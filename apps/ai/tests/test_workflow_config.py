import base64
from pathlib import Path

import pytest
from pydantic import ValidationError

from opspilot_ai.config import REPOSITORY_ROOT

from .conftest import make_settings


def workflow_values(tmp_path: Path) -> dict[str, object]:
    return {
        "AI_PROVIDER_ENABLED": True,
        "GROQ_API_KEY": "gsk_phase9_test_only",
        "GROQ_ZERO_DATA_RETENTION_CONFIRMED": True,
        "AI_WORKFLOWS_ENABLED": True,
        "AI_WORKFLOW_NODE_URL": "http://127.0.0.1:4000",
        "AI_WORKFLOW_NODE_SIGNING_KEY": base64.b64encode(bytes(range(32, 64))).decode("ascii"),
        "AI_WORKFLOW_NODE_SIGNING_KEY_ID": "phase9-reverse-v1",
        "AI_WORKFLOW_CHECKPOINT_PATH": tmp_path / "checkpoints" / "workflows.sqlite",
        "LANGGRAPH_STRICT_MSGPACK": True,
        "AI_WORKFLOW_MAX_CONCURRENCY": 1,
    }


def test_workflow_defaults_are_disabled() -> None:
    settings = make_settings()

    assert settings.workflows_enabled is False
    assert settings.support_data_processing_confirmed is False
    assert settings.workflow_checkpoint_path is None
    assert settings.langgraph_strict_msgpack is True
    assert settings.workflow_max_concurrency == 1


def test_accepts_isolated_loopback_workflow_configuration(tmp_path: Path) -> None:
    settings = make_settings(**workflow_values(tmp_path))

    assert settings.workflows_enabled is True
    assert settings.workflow_node_url == "http://127.0.0.1:4000"
    assert settings.workflow_node_signing_key_bytes() == bytes(range(32, 64))
    assert settings.workflow_checkpoint_path == tmp_path / "checkpoints" / "workflows.sqlite"


@pytest.mark.parametrize(
    ("name", "value"),
    [
        ("AI_WORKFLOW_NODE_URL", "https://127.0.0.1:4000"),
        ("AI_WORKFLOW_NODE_URL", "http://localhost:4000"),
        ("AI_WORKFLOW_NODE_URL", "http://127.0.0.1:4000/internal"),
        ("AI_WORKFLOW_NODE_SIGNING_KEY", base64.b64encode(b"short").decode("ascii")),
        ("LANGGRAPH_STRICT_MSGPACK", False),
        ("AI_WORKFLOW_MAX_CONCURRENCY", 2),
    ],
)
def test_rejects_unsafe_workflow_configuration(tmp_path: Path, name: str, value: object) -> None:
    with pytest.raises(ValidationError):
        make_settings(**{**workflow_values(tmp_path), name: value})


def test_rejects_repository_checkpoint_and_production_topology(tmp_path: Path) -> None:
    with pytest.raises(ValidationError, match="outside repository/public roots"):
        make_settings(
            **{
                **workflow_values(tmp_path),
                "AI_WORKFLOW_CHECKPOINT_PATH": REPOSITORY_ROOT / "private" / "workflow.sqlite",
            }
        )
    with pytest.raises(ValidationError, match="explicitly accepted topology"):
        make_settings(**{**workflow_values(tmp_path), "AI_ENVIRONMENT": "production"})

    settings = make_settings(
        **{
            **workflow_values(tmp_path),
            "AI_ENVIRONMENT": "production",
            "AI_PRODUCTION_DEMO_LOCAL_TOPOLOGY_ACCEPTED": True,
        }
    )
    assert settings.production_demo_local_topology_accepted is True
    assert settings.workflows_enabled is True


def test_support_processing_requires_isolated_rag_boundary(tmp_path: Path) -> None:
    with pytest.raises(ValidationError, match="Support workflows require AI_RAG_ENABLED"):
        make_settings(
            **{
                **workflow_values(tmp_path),
                "AI_SUPPORT_DATA_PROCESSING_CONFIRMED": True,
            }
        )

    settings = make_settings(
        **{
            **workflow_values(tmp_path),
            "AI_SUPPORT_DATA_PROCESSING_CONFIRMED": True,
            "AI_RAG_ENABLED": True,
            "AI_RAG_MODEL_CACHE_DIR": tmp_path / "models",
            "AI_RAG_QDRANT_PATH": tmp_path / "qdrant",
        }
    )
    assert settings.support_data_processing_confirmed is True
