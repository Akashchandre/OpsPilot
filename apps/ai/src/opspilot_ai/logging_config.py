import json
import logging
from datetime import UTC, datetime
from typing import Any

from .constants import SERVICE_NAME

SAFE_LOG_FIELDS = frozenset(
    {
        "event",
        "request_id",
        "assistant",
        "intent",
        "prompt_version",
        "model",
        "status",
        "duration_ms",
        "input_tokens",
        "output_tokens",
        "total_tokens",
        "cost_in_usd_ticks",
        "zero_data_retention",
        "error_code",
        "provider_state",
    }
)


class AllowlistedJsonFormatter(logging.Formatter):
    def __init__(self, environment: str) -> None:
        super().__init__()
        self.environment = environment

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": datetime.now(UTC)
            .isoformat(timespec="milliseconds")
            .replace("+00:00", "Z"),
            "level": record.levelname.lower(),
            "service": SERVICE_NAME,
            "environment": self.environment,
        }
        for field in SAFE_LOG_FIELDS:
            value = getattr(record, field, None)
            if value is not None:
                payload[field] = value
        return json.dumps(payload, separators=(",", ":"), ensure_ascii=True)


def configure_logging(environment: str, level: str) -> logging.Logger:
    logger = logging.getLogger("opspilot.ai")
    logger.handlers.clear()
    handler = logging.StreamHandler()
    handler.setFormatter(AllowlistedJsonFormatter(environment))
    logger.addHandler(handler)
    logger.setLevel(level.upper())
    logger.propagate = False
    return logger


def log_event(
    logger: logging.Logger,
    level: int,
    event: str,
    **fields: str | int | bool,
) -> None:
    safe_fields = {key: value for key, value in fields.items() if key in SAFE_LOG_FIELDS}
    logger.log(level, "", extra={"event": event, **safe_fields})
