from dataclasses import dataclass
from enum import StrEnum
from typing import Protocol

from ..contracts import StructuredProviderOutput
from ..errors import AiServiceError
from ..prompts import RenderedPrompt


class ProviderReadiness(StrEnum):
    DISABLED = "disabled"
    UNVERIFIED = "unverified"
    READY = "ready"
    UNAVAILABLE = "unavailable"


@dataclass(frozen=True, slots=True)
class ProviderUsage:
    input_tokens: int
    output_tokens: int
    total_tokens: int
    cost_in_usd_ticks: int


@dataclass(frozen=True, slots=True)
class ProviderResult:
    output: StructuredProviderOutput
    model: str
    request_id: str
    usage: ProviderUsage
    zero_data_retention: bool


class ResponseProvider(Protocol):
    @property
    def state(self) -> ProviderReadiness: ...

    async def preflight(self) -> None: ...

    async def generate(self, prompt: RenderedPrompt) -> ProviderResult: ...

    async def aclose(self) -> None: ...


class DisabledProvider:
    state = ProviderReadiness.DISABLED

    async def preflight(self) -> None:
        return None

    async def generate(self, prompt: RenderedPrompt) -> ProviderResult:
        del prompt
        raise AiServiceError(
            503,
            "PROVIDER_DISABLED",
            "AI responses are currently disabled",
        )

    async def aclose(self) -> None:
        return None
