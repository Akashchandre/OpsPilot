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

from .cross_service_server import app

RUN_CROSS_SERVICE = os.environ.get("OPSPILOT_RUN_CROSS_SERVICE_SMOKE", "").lower() == "true"


def _available_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
        listener.bind(("127.0.0.1", 0))
        return int(listener.getsockname()[1])


@pytest.mark.cross_service
@pytest.mark.skipif(not RUN_CROSS_SERVICE, reason="explicit cross-service smoke opt-in is required")
def test_real_node_to_fastapi_signed_http_contract() -> None:
    repository_root = Path(__file__).resolve().parents[3]
    node_binary = os.environ.get("OPSPILOT_NODE_BINARY") or shutil.which("node")
    if node_binary is None:
        pytest.fail("Node.js is required for the cross-service smoke")

    port = _available_port()
    server = uvicorn.Server(
        uvicorn.Config(
            app,
            host="127.0.0.1",
            port=port,
            log_level="error",
            access_log=False,
        )
    )
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    deadline = time.monotonic() + 5
    while not server.started and thread.is_alive() and time.monotonic() < deadline:
        time.sleep(0.01)
    if not server.started:
        server.should_exit = True
        thread.join(timeout=2)
        pytest.fail("The local FastAPI mock did not start")

    signing_key = base64.b64encode(bytes(range(32))).decode("ascii")
    environment = {
        **os.environ,
        "AI_SERVICE_URL": f"http://127.0.0.1:{port}",
        "AI_SERVICE_SIGNING_KEY": signing_key,
        "AI_SERVICE_SIGNING_KEY_ID": "phase7-cross-service-v1",
    }
    try:
        completed = subprocess.run(
            [
                node_binary,
                str(
                    repository_root
                    / "apps"
                    / "api"
                    / "src"
                    / "scripts"
                    / "phase7CrossServiceSmoke.js"
                ),
            ],
            cwd=repository_root,
            env=environment,
            check=False,
            capture_output=True,
            text=True,
            timeout=15,
        )
    finally:
        server.should_exit = True
        thread.join(timeout=5)

    assert completed.returncode == 0, completed.stderr
    result = json.loads(completed.stdout)
    assert result == {
        "success": True,
        "health": {
            "service": "opspilot-ai",
            "status": "ready",
            "provider": "ready",
        },
        "model": "openai/gpt-oss-120b",
        "promptVersion": "customer-help-v1",
        "outcome": "ANSWER",
        "zeroDataRetention": True,
        "contentRecorded": False,
        "secretValuesEmitted": False,
    }
    assert signing_key not in completed.stdout
