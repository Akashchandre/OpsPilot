import hashlib
import hmac
import json
from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

import httpx
from pydantic import ValidationError

from ..config import AiSettings
from ..errors import AiServiceError
from .contracts import FinalizationEnvelope, ReservationEnvelope


def _timestamp() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


class WorkflowNodeGateway:
    def __init__(self, settings: AiSettings, *, client: httpx.AsyncClient | None = None) -> None:
        if settings.workflow_node_url is None or settings.workflow_node_signing_key_id is None:
            raise ValueError("workflow gateway configuration is unavailable")
        self._key = settings.workflow_node_signing_key_bytes()
        self._key_id = settings.workflow_node_signing_key_id
        self._owns_client = client is None
        self._client = client or httpx.AsyncClient(
            base_url=settings.workflow_node_url,
            timeout=httpx.Timeout(2.0),
            follow_redirects=False,
            trust_env=False,
        )

    async def _request(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        request_id = str(uuid4())
        nonce = str(uuid4())
        timestamp = _timestamp()
        body = json.dumps(payload, ensure_ascii=True, separators=(",", ":")).encode("utf-8")
        digest = hashlib.sha256(body).hexdigest()
        canonical = "\n".join(("v1", timestamp, nonce, request_id, "POST", path, digest)).encode(
            "utf-8"
        )
        signature = hmac.new(self._key, canonical, hashlib.sha256).hexdigest()
        headers = {
            "Content-Type": "application/json",
            "X-OpsPilot-Signature-Version": "v1",
            "X-OpsPilot-Key-Id": self._key_id,
            "X-OpsPilot-Timestamp": timestamp,
            "X-OpsPilot-Nonce": nonce,
            "X-Request-Id": request_id,
            "X-OpsPilot-Signature": signature,
        }
        try:
            response = await self._client.post(path, content=body, headers=headers)
            if response.status_code < 200 or response.status_code >= 300:
                raise AiServiceError(
                    503,
                    "WORKFLOW_NODE_REJECTED",
                    "The workflow authority rejected the request",
                    "HOLD",
                )
            if response.headers.get("content-type", "").split(";", 1)[0] != "application/json":
                raise ValueError("invalid content type")
            if len(response.content) > 100_000:
                raise ValueError("response too large")
            value = response.json()
            if not isinstance(value, dict) or value.get("requestId") != request_id:
                raise ValueError("request identity mismatch")
            return value
        except AiServiceError:
            raise
        except (httpx.HTTPError, json.JSONDecodeError, ValueError) as error:
            raise AiServiceError(
                503,
                "WORKFLOW_NODE_UNAVAILABLE",
                "The workflow authority is unavailable",
                "HOLD",
            ) from error

    async def execute_tool(
        self, *, workflow_run_id: UUID, tool_call_id: UUID, tool_code: str
    ) -> dict[str, Any]:
        path = f"/internal/v1/ai/workflow-tools/{tool_call_id}/execute"
        value = await self._request(
            path,
            {
                "contractVersion": 1,
                "workflowRunId": str(workflow_run_id),
                "toolCode": tool_code,
            },
        )
        data = value.get("data")
        if not isinstance(data, dict) or not isinstance(data.get("output"), dict):
            raise AiServiceError(502, "WORKFLOW_NODE_INVALID_RESPONSE", "Invalid tool response")
        return data["output"]

    async def reserve(self, *, workflow_run_id: UUID, model_step_id: UUID) -> str:
        path = f"/internal/v1/ai/workflow-model-steps/{model_step_id}/reserve"
        value = await self._request(
            path,
            {
                "contractVersion": 1,
                "workflowRunId": str(workflow_run_id),
                "modelStepId": str(model_step_id),
            },
        )
        try:
            return ReservationEnvelope.model_validate(value).data.status
        except ValidationError as error:
            raise AiServiceError(
                502, "WORKFLOW_NODE_INVALID_RESPONSE", "Invalid reservation"
            ) from error

    async def finalize(
        self, *, workflow_run_id: UUID, model_step_id: UUID, result: dict[str, Any]
    ) -> FinalizationEnvelope:
        path = f"/internal/v1/ai/workflow-model-steps/{model_step_id}/finalize"
        value = await self._request(
            path,
            {
                "contractVersion": 1,
                "workflowRunId": str(workflow_run_id),
                "modelStepId": str(model_step_id),
                **result,
            },
        )
        try:
            return FinalizationEnvelope.model_validate(value)
        except ValidationError as error:
            raise AiServiceError(
                502, "WORKFLOW_NODE_INVALID_RESPONSE", "Invalid finalization"
            ) from error

    async def aclose(self) -> None:
        if self._owns_client:
            await self._client.aclose()
