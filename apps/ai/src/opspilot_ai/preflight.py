import asyncio
import json
import os
from datetime import UTC, datetime
from typing import Any

from pydantic import ValidationError

from .config import AiSettings, load_settings
from .constants import GROQ_MODEL
from .errors import AiServiceError
from .providers import GroqChatCompletionsProvider, ResponseProvider

LIVE_PREFLIGHT_FLAG = "OPSPILOT_LIVE_AI_PREFLIGHT"


def _timestamp() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


async def run_preflight(
    settings: AiSettings,
    *,
    provider: ResponseProvider | None = None,
) -> dict[str, Any]:
    selected_provider = provider or GroqChatCompletionsProvider(settings)
    try:
        await selected_provider.preflight()
        return {
            "success": True,
            "checkedAt": _timestamp(),
            "provider": "Groq",
            "model": GROQ_MODEL,
            "providerState": selected_provider.state.value,
            "checks": {
                "credentialAndModelAccess": True,
                "zeroDataRetentionOperatorConfirmation": True,
                "reviewedPricePolicyPinned": True,
            },
            "inferencePerformed": False,
            "secretValuesEmitted": False,
        }
    finally:
        await selected_provider.aclose()


def _safe_failure(code: str) -> dict[str, Any]:
    return {
        "success": False,
        "checkedAt": _timestamp(),
        "provider": "Groq",
        "model": GROQ_MODEL,
        "errorCode": code,
        "secretValuesEmitted": False,
    }


def main() -> int:
    if os.environ.get(LIVE_PREFLIGHT_FLAG, "").lower() != "true":
        print(json.dumps(_safe_failure("LIVE_PREFLIGHT_NOT_OPTED_IN"), sort_keys=True))
        return 2
    try:
        settings = load_settings()
    except ValidationError:
        print(json.dumps(_safe_failure("AI_CONFIGURATION_INVALID"), sort_keys=True))
        return 2
    if not settings.provider_enabled:
        print(json.dumps(_safe_failure("PROVIDER_DISABLED"), sort_keys=True))
        return 2
    try:
        result = asyncio.run(run_preflight(settings))
    except AiServiceError as error:
        print(json.dumps(_safe_failure(error.code), sort_keys=True))
        return 1
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
