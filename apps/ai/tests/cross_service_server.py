import base64

from opspilot_ai.app import create_app
from opspilot_ai.config import AiSettings
from opspilot_ai.constants import XAI_MODEL, Outcome, SafeNotice
from opspilot_ai.contracts import StructuredProviderOutput
from opspilot_ai.prompts import RenderedPrompt
from opspilot_ai.providers import ProviderReadiness, ProviderResult, ProviderUsage


class CrossServiceMockProvider:
    state = ProviderReadiness.READY

    async def preflight(self) -> None:
        return None

    async def generate(self, prompt: RenderedPrompt) -> ProviderResult:
        del prompt
        return ProviderResult(
            output=StructuredProviderOutput(
                answer="Open Support, then create a new ticket.",
                outcome=Outcome.ANSWER,
                notices=[SafeNotice.USE_STANDARD_SUPPORT],
            ),
            model=XAI_MODEL,
            request_id="resp_cross_service_mock",
            usage=ProviderUsage(
                input_tokens=100,
                output_tokens=20,
                total_tokens=120,
                cost_in_usd_ticks=100_000,
            ),
            zero_data_retention=True,
        )

    async def aclose(self) -> None:
        return None


settings = AiSettings(
    _env_file=None,
    AI_ENVIRONMENT="test",
    AI_SERVICE_SIGNING_KEY=base64.b64encode(bytes(range(32))).decode("ascii"),
    AI_SERVICE_SIGNING_KEY_ID="phase7-cross-service-v1",
)
app = create_app(settings, provider=CrossServiceMockProvider())
