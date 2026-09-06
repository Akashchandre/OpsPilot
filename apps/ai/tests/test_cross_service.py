import base64
import json
import os
import shutil
import socket
import subprocess
import threading
import time
from pathlib import Path

import pytest
import uvicorn

from opspilot_ai.app import create_app
from opspilot_ai.config import AiSettings, load_settings

from .cross_service_server import CrossServiceMockProvider, app

RUN_CROSS_SERVICE = os.environ.get("OPSPILOT_RUN_CROSS_SERVICE_SMOKE", "").lower() == "true"
RUN_LIVE_RAG_CROSS_SERVICE = (
    os.environ.get("OPSPILOT_RUN_LIVE_RAG_CROSS_SERVICE", "").lower() == "true"
)


def _available_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
        listener.bind(("127.0.0.1", 0))
        return int(listener.getsockname()[1])


def _run_node_smoke(
    application,
    *,
    repository_root: Path,
    node_binary: str,
    script_name: str,
    environment: dict[str, str],
    timeout_seconds: int,
) -> subprocess.CompletedProcess[str]:
    port = _available_port()
    server = uvicorn.Server(
        uvicorn.Config(
            application,
            host="127.0.0.1",
            port=port,
            log_level="error",
            access_log=False,
        )
    )
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    deadline = time.monotonic() + 25
    while not server.started and thread.is_alive() and time.monotonic() < deadline:
        time.sleep(0.01)
    if not server.started:
        server.should_exit = True
        thread.join(timeout=5)
        pytest.fail("The local FastAPI service did not start")

    selected_environment = {
        **environment,
        "AI_SERVICE_URL": f"http://127.0.0.1:{port}",
    }
    try:
        return subprocess.run(
            [
                node_binary,
                str(repository_root / "apps" / "api" / "src" / "scripts" / script_name),
            ],
            cwd=repository_root,
            env=selected_environment,
            check=False,
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
        )
    finally:
        server.should_exit = True
        thread.join(timeout=5)


@pytest.mark.cross_service
@pytest.mark.skipif(not RUN_CROSS_SERVICE, reason="explicit cross-service smoke opt-in is required")
def test_real_node_to_fastapi_signed_http_contract() -> None:
    repository_root = Path(__file__).resolve().parents[3]
    node_binary = os.environ.get("OPSPILOT_NODE_BINARY") or shutil.which("node")
    if node_binary is None:
        pytest.fail("Node.js is required for the cross-service smoke")

    signing_key = base64.b64encode(bytes(range(32))).decode("ascii")
    environment = {
        **os.environ,
        "AI_SERVICE_SIGNING_KEY": signing_key,
        "AI_SERVICE_SIGNING_KEY_ID": "phase7-cross-service-v1",
    }
    completed = _run_node_smoke(
        app,
        repository_root=repository_root,
        node_binary=node_binary,
        script_name="phase7CrossServiceSmoke.js",
        environment=environment,
        timeout_seconds=15,
    )

    assert completed.returncode == 0, completed.stderr
    result = json.loads(completed.stdout)
    assert result == {
        "success": True,
        "health": {
            "service": "opspilot-ai",
            "status": "ready",
            "provider": "ready",
            "embedding": "disabled",
            "vectorIndex": "disabled",
        },
        "model": "openai/gpt-oss-120b",
        "promptVersion": "customer-help-v1",
        "outcome": "ANSWER",
        "zeroDataRetention": True,
        "documentPromptVersion": "customer-documents-v1",
        "documentOutcome": "ANSWER",
        "documentCitations": ["S1"],
        "contentRecorded": False,
        "secretValuesEmitted": False,
    }
    assert signing_key not in completed.stdout


@pytest.mark.cross_service
@pytest.mark.skipif(not RUN_CROSS_SERVICE, reason="explicit cross-service smoke opt-in is required")
def test_phase9_bidirectional_workflow_contract(tmp_path: Path) -> None:
    repository_root = Path(__file__).resolve().parents[3]
    node_binary = os.environ.get("OPSPILOT_NODE_BINARY") or shutil.which("node")
    if node_binary is None:
        pytest.fail("Node.js is required for the cross-service smoke")

    node_port = _available_port()
    service_signing_key = base64.b64encode(bytes(range(32))).decode("ascii")
    reverse_signing_key = base64.b64encode(bytes(range(32, 64))).decode("ascii")
    artifact_key = base64.b64encode(bytes(range(64, 96))).decode("ascii")
    checkpoint_path = tmp_path / "phase9-cross-service.sqlite"
    settings = AiSettings(
        _env_file=None,
        AI_ENVIRONMENT="test",
        AI_PROVIDER_ENABLED=True,
        GROQ_API_KEY="gsk_phase9_cross_service_test_only",
        GROQ_ZERO_DATA_RETENTION_CONFIRMED=True,
        AI_SERVICE_SIGNING_KEY=service_signing_key,
        AI_SERVICE_SIGNING_KEY_ID="phase9-node-to-ai-v1",
        AI_WORKFLOWS_ENABLED=True,
        AI_WORKFLOW_NODE_URL=f"http://127.0.0.1:{node_port}",
        AI_WORKFLOW_NODE_SIGNING_KEY=reverse_signing_key,
        AI_WORKFLOW_NODE_SIGNING_KEY_ID="phase9-ai-to-node-v1",
        AI_WORKFLOW_CHECKPOINT_PATH=checkpoint_path,
        LANGGRAPH_STRICT_MSGPACK=True,
        AI_WORKFLOW_MAX_CONCURRENCY=1,
    )
    completed = _run_node_smoke(
        create_app(settings, provider=CrossServiceMockProvider()),
        repository_root=repository_root,
        node_binary=node_binary,
        script_name="phase9CrossServiceSmoke.js",
        environment={
            **os.environ,
            "API_PORT": str(node_port),
            "AI_SERVICE_SIGNING_KEY": service_signing_key,
            "AI_SERVICE_SIGNING_KEY_ID": "phase9-node-to-ai-v1",
            "AI_WORKFLOW_NODE_SIGNING_KEY": reverse_signing_key,
            "AI_WORKFLOW_NODE_SIGNING_KEY_ID": "phase9-ai-to-node-v1",
            "AI_WORKFLOW_ARTIFACT_KEY": artifact_key,
            "AI_WORKFLOW_ARTIFACT_KEY_ID": "phase9-artifacts-v1",
            "AI_WORKFLOW_CHECKPOINT_PATH": str(checkpoint_path),
        },
        timeout_seconds=30,
    )

    assert completed.returncode == 0, completed.stderr
    result = json.loads(completed.stdout)
    assert result["success"] is True
    assert result["signedBidirectionalBoundary"] is True
    assert result["caseCount"] == 5
    assert result["p95Ms"] <= result["maximumP95Ms"] == 8_000
    assert result["toolP95Ms"] <= result["maximumToolP95Ms"] == 250
    assert result["providerCalls"] == 5
    assert result["toolCalls"] == 15
    assert result["sourceCount"] == 15
    assert result["totalTokens"] == 600
    assert result["exactCostInUsdTicks"] == 500_000
    assert result["checkpointBytes"] > 0
    assert result["artifactCiphertextBytes"] > 0
    assert result["checkpointCleanupMs"] >= 0
    assert result["cpuTimeMs"] > 0
    assert result["rssBytes"] > 0
    assert result["contentRecorded"] is False
    assert result["secretValuesEmitted"] is False
    assert service_signing_key not in completed.stdout
    assert reverse_signing_key not in completed.stdout
    assert artifact_key not in completed.stdout
    print(json.dumps(result, separators=(",", ":"), sort_keys=True))


@pytest.mark.cross_service
@pytest.mark.skipif(
    not RUN_LIVE_RAG_CROSS_SERVICE,
    reason="explicit metered signed RAG live-gate opt-in is required",
)
def test_live_node_to_fastapi_to_groq_document_latency_gate() -> None:
    repository_root = Path(__file__).resolve().parents[3]
    node_binary = os.environ.get("OPSPILOT_NODE_BINARY") or shutil.which("node")
    if node_binary is None:
        pytest.fail("Node.js is required for the signed RAG live gate")

    settings = load_settings()
    if not settings.provider_enabled:
        pytest.fail("The Groq provider must be enabled for the signed RAG live gate")
    signing_key = settings.signing_key.get_secret_value()
    completed = _run_node_smoke(
        create_app(settings.model_copy(update={"log_level": "error"})),
        repository_root=repository_root,
        node_binary=node_binary,
        script_name="phase8SignedRagLiveGate.js",
        environment={
            **os.environ,
            "AI_SERVICE_SIGNING_KEY": signing_key,
            "AI_SERVICE_SIGNING_KEY_ID": settings.signing_key_id,
            "OPSPILOT_RUN_LIVE_RAG_CROSS_SERVICE": "true",
        },
        timeout_seconds=90,
    )

    assert completed.returncode == 0, completed.stderr
    result = json.loads(completed.stdout)
    assert result["success"] is True
    assert result["signedBoundary"] is True
    assert result["caseCount"] == 5
    assert result["p95Ms"] <= result["maximumP95Ms"] == 6_000
    assert all(case["passed"] for case in result["cases"])
    assert result["questionAnswerOrSourceContentEmitted"] is False
    assert result["secretValuesEmitted"] is False
    assert signing_key not in completed.stdout
    print(json.dumps(result, separators=(",", ":"), sort_keys=True))
