import asyncio
from time import monotonic
from typing import Any, TypedDict
from uuid import UUID

from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
from langgraph.errors import GraphRecursionError
from langgraph.graph import END, START, StateGraph
from langgraph.types import Command, interrupt

from ..errors import AiServiceError
from ..providers import ResponseProvider
from .contracts import BusinessBriefOutput, SupportReplyOutput, WorkflowRequest
from .gateway import WorkflowNodeGateway
from .prompts import render_workflow_prompt


class WorkflowState(TypedDict, total=False):
    workflow_run_id: str
    workflow_code: str
    graph_version: str
    thread_id: str
    model_step_id: str
    tool_calls: list[dict[str, str]]
    status: str
    artifact_id: str | None


class WorkflowService:
    def __init__(
        self,
        *,
        saver: AsyncSqliteSaver,
        gateway: WorkflowNodeGateway,
        provider: ResponseProvider,
        maximum_concurrency: int = 1,
        support_enabled: bool = False,
        invocation_timeout_seconds: float = 22.0,
    ) -> None:
        self._saver = saver
        self._gateway = gateway
        self._provider = provider
        self._support_enabled = support_enabled
        self._invocation_timeout_seconds = invocation_timeout_seconds
        self._semaphore = asyncio.Semaphore(maximum_concurrency)
        self._graphs = {
            ("OWNER_BUSINESS_BRIEF_V1", "v1"): self._business_graph(),
            ("SUPPORT_REPLY_DRAFT_V1", "v1"): self._support_graph(),
        }

    async def _model_step(
        self, state: WorkflowState, tool_calls: list[dict[str, str]]
    ) -> dict[str, str | None]:
        workflow_run_id = state["workflow_run_id"]
        model_step_id = state["model_step_id"]
        outputs: list[dict[str, Any]] = []
        try:
            for tool_call in tool_calls:
                output = await self._gateway.execute_tool(
                    workflow_run_id=UUID(workflow_run_id),
                    tool_call_id=UUID(tool_call["id"]),
                    tool_code=tool_call["code"],
                )
                outputs.append({"source": tool_call["code"], "output": output})
            reservation = await self._gateway.reserve(
                workflow_run_id=UUID(workflow_run_id),
                model_step_id=UUID(model_step_id),
            )
            if reservation != "RESERVED":
                if reservation == "SUCCEEDED":
                    return {"status": "SUCCEEDED", "artifact_id": None}
                if reservation in {"FAILED", "UNKNOWN"}:
                    return {"status": reservation, "artifact_id": None}
                finalized = await self._gateway.finalize(
                    workflow_run_id=UUID(workflow_run_id),
                    model_step_id=UUID(model_step_id),
                    result={
                        "status": "UNKNOWN",
                        "safeErrorCode": "PROVIDER_OUTCOME_UNKNOWN",
                        "durationMs": 0,
                    },
                )
                return {
                    "status": finalized.data.status,
                    "artifact_id": (
                        str(finalized.data.artifact_id) if finalized.data.artifact_id else None
                    ),
                }

            prompt = render_workflow_prompt(state["workflow_code"], outputs)
            started = monotonic()
            provider_result = await self._provider.generate(prompt)
            duration_ms = round((monotonic() - started) * 1_000)
            output = provider_result.output
            if state["workflow_code"] == "OWNER_BUSINESS_BRIEF_V1":
                if not isinstance(output, BusinessBriefOutput):
                    raise AiServiceError(502, "PROVIDER_RESPONSE_INVALID", "Invalid brief", "HOLD")
                outcome = "ANSWER"
            else:
                if not isinstance(output, SupportReplyOutput):
                    raise AiServiceError(502, "PROVIDER_RESPONSE_INVALID", "Invalid draft", "HOLD")
                outcome = {
                    "READY_FOR_REVIEW": "READY_FOR_REVIEW",
                    "ESCALATE": "ESCALATE",
                    "INSUFFICIENT_CONTEXT": "INSUFFICIENT_EVIDENCE",
                    "REFUSAL": "REFUSAL",
                }[output.status]
            usage = provider_result.usage
            finalized = await self._gateway.finalize(
                workflow_run_id=UUID(workflow_run_id),
                model_step_id=UUID(model_step_id),
                result={
                    "status": "SUCCEEDED",
                    "outcome": outcome,
                    "output": output.model_dump(by_alias=True, mode="json"),
                    "providerRequestId": provider_result.request_id,
                    "usage": {
                        "inputTokens": usage.input_tokens,
                        "outputTokens": usage.output_tokens,
                        "totalTokens": usage.total_tokens,
                        "costInUsdTicks": usage.cost_in_usd_ticks,
                    },
                    "durationMs": duration_ms,
                },
            )
            return {
                "status": finalized.data.status,
                "artifact_id": (
                    str(finalized.data.artifact_id) if finalized.data.artifact_id else None
                ),
            }
        except AiServiceError as error:
            duration_ms = 0
            status = "UNKNOWN" if error.cost_disposition == "HOLD" else "FAILED"
            try:
                finalized = await self._gateway.finalize(
                    workflow_run_id=UUID(workflow_run_id),
                    model_step_id=UUID(model_step_id),
                    result={
                        "status": status,
                        "safeErrorCode": error.code,
                        "durationMs": duration_ms,
                    },
                )
                return {
                    "status": finalized.data.status,
                    "artifact_id": None,
                }
            except AiServiceError:
                raise error from None

    async def _business(self, state: WorkflowState) -> dict[str, str | None]:
        return await self._model_step(state, state["tool_calls"])

    async def _support_draft(self, state: WorkflowState) -> dict[str, str | None]:
        return await self._model_step(state, state["tool_calls"][:2])

    async def _approval(self, state: WorkflowState) -> dict[str, str]:
        decision = interrupt(
            {"workflowRunId": state["workflow_run_id"], "decision": "HUMAN_REVIEW_REQUIRED"}
        )
        if decision != {"decision": "APPROVED"}:
            raise AiServiceError(409, "WORKFLOW_RESUME_INVALID", "Invalid workflow resume")
        return {"status": "APPROVED"}

    async def _support_action(self, state: WorkflowState) -> dict[str, str | None]:
        tool_call = state["tool_calls"][2]
        output = await self._gateway.execute_tool(
            workflow_run_id=UUID(state["workflow_run_id"]),
            tool_call_id=UUID(tool_call["id"]),
            tool_code=tool_call["code"],
        )
        if output.get("published") is not True:
            raise AiServiceError(502, "WORKFLOW_ACTION_INVALID", "Invalid action receipt", "HOLD")
        return {"status": "SUCCEEDED", "artifact_id": None}

    def _business_graph(self):
        builder = StateGraph(WorkflowState)
        builder.add_node("build_brief", self._business)
        builder.add_edge(START, "build_brief")
        builder.add_edge("build_brief", END)
        return builder.compile(checkpointer=self._saver, name="owner_business_brief_v1")

    def _support_graph(self):
        builder = StateGraph(WorkflowState)
        builder.add_node("draft_reply", self._support_draft)
        builder.add_node("human_approval", self._approval)
        builder.add_node("publish_reply", self._support_action)
        builder.add_edge(START, "draft_reply")
        builder.add_conditional_edges(
            "draft_reply",
            lambda state: "human_approval" if state.get("status") == "AWAITING_APPROVAL" else END,
        )
        builder.add_edge("human_approval", "publish_reply")
        builder.add_edge("publish_reply", END)
        return builder.compile(checkpointer=self._saver, name="support_reply_draft_v1")

    def _graph(self, request: WorkflowRequest):
        if request.workflow_code == "SUPPORT_REPLY_DRAFT_V1" and not self._support_enabled:
            raise AiServiceError(403, "WORKFLOW_SUPPORT_DISABLED", "Workflow unavailable")
        graph = self._graphs.get((request.workflow_code, request.graph_version))
        if graph is None:
            raise AiServiceError(409, "WORKFLOW_VERSION_UNAVAILABLE", "Workflow unavailable")
        return graph

    @staticmethod
    def _initial_state(request: WorkflowRequest) -> WorkflowState:
        return {
            "workflow_run_id": str(request.workflow_run_id),
            "workflow_code": request.workflow_code,
            "graph_version": request.graph_version,
            "thread_id": str(request.thread_id),
            "model_step_id": str(request.model_step_id),
            "tool_calls": [
                {"id": str(tool_call.id), "code": tool_call.code}
                for tool_call in request.tool_calls
            ],
            "status": "RUNNING",
            "artifact_id": None,
        }

    @staticmethod
    def _result(state: WorkflowState) -> dict[str, str | None]:
        return {
            "workflowRunId": state["workflow_run_id"],
            "status": state.get("status", "UNKNOWN"),
            "artifactId": state.get("artifact_id"),
        }

    async def _checkpoint_state(self, graph, request: WorkflowRequest, *, required: bool):
        configuration = {"configurable": {"thread_id": str(request.thread_id)}}
        try:
            snapshot = await graph.aget_state(configuration)
        except Exception as error:
            raise AiServiceError(
                409,
                "WORKFLOW_CHECKPOINT_INVALID",
                "Workflow checkpoint is invalid",
                "HOLD",
            ) from error
        if not snapshot.values:
            if required:
                raise AiServiceError(
                    409,
                    "WORKFLOW_CHECKPOINT_INVALID",
                    "Workflow checkpoint is invalid",
                    "HOLD",
                )
            return None
        state = dict(snapshot.values)
        expected = self._initial_state(request)
        identity_fields = (
            "workflow_run_id",
            "workflow_code",
            "graph_version",
            "thread_id",
            "model_step_id",
            "tool_calls",
        )
        if any(state.get(field) != expected[field] for field in identity_fields):
            raise AiServiceError(
                409,
                "WORKFLOW_CHECKPOINT_INVALID",
                "Workflow checkpoint is invalid",
                "HOLD",
            )
        return state, snapshot

    async def _invoke(self, graph, value, configuration):
        try:
            async with asyncio.timeout(self._invocation_timeout_seconds):
                return await graph.ainvoke(value, configuration)
        except TimeoutError:
            raise AiServiceError(
                504, "WORKFLOW_TIMEOUT", "Workflow execution timed out", "HOLD"
            ) from None
        except GraphRecursionError:
            raise AiServiceError(
                409, "WORKFLOW_RECURSION_LIMIT", "Workflow execution limit reached", "HOLD"
            ) from None

    async def start(self, request: WorkflowRequest) -> dict[str, str | None]:
        graph = self._graph(request)
        configuration = {
            "configurable": {"thread_id": str(request.thread_id)},
            "recursion_limit": 12,
        }
        async with self._semaphore:
            existing = await self._checkpoint_state(graph, request, required=False)
            if existing is not None:
                state, snapshot = existing
                if not snapshot.next or tuple(snapshot.next) == ("human_approval",):
                    return self._result(state)
                value = None
            else:
                value = self._initial_state(request)
            result = await self._invoke(graph, value, configuration)
        status = "AWAITING_APPROVAL" if result.get("__interrupt__") else result.get("status")
        return {
            "workflowRunId": str(request.workflow_run_id),
            "status": status or "UNKNOWN",
            "artifactId": result.get("artifact_id"),
        }

    async def resume(self, request: WorkflowRequest) -> dict[str, str | None]:
        if request.workflow_code != "SUPPORT_REPLY_DRAFT_V1":
            raise AiServiceError(409, "WORKFLOW_RESUME_INVALID", "Workflow cannot resume")
        graph = self._graph(request)
        configuration = {
            "configurable": {"thread_id": str(request.thread_id)},
            "recursion_limit": 12,
        }
        async with self._semaphore:
            state, snapshot = await self._checkpoint_state(graph, request, required=True)
            if not snapshot.next:
                if state.get("status") == "SUCCEEDED":
                    return self._result(state)
                raise AiServiceError(
                    409,
                    "WORKFLOW_CHECKPOINT_INVALID",
                    "Workflow checkpoint is invalid",
                    "HOLD",
                )
            if tuple(snapshot.next) != ("human_approval",) or state.get("status") != (
                "AWAITING_APPROVAL"
            ):
                raise AiServiceError(
                    409,
                    "WORKFLOW_CHECKPOINT_INVALID",
                    "Workflow checkpoint is invalid",
                    "HOLD",
                )
            result = await self._invoke(
                graph,
                Command(resume={"decision": "APPROVED"}),
                configuration,
            )
        return {
            "workflowRunId": str(request.workflow_run_id),
            "status": result.get("status", "UNKNOWN"),
            "artifactId": result.get("artifact_id"),
        }

    async def delete_thread(self, thread_id: str) -> None:
        await self._saver.adelete_thread(thread_id)
