from dataclasses import dataclass
from typing import Literal

CostDisposition = Literal["RELEASE", "HOLD"]


@dataclass(slots=True)
class AiServiceError(Exception):
    status_code: int
    code: str
    safe_message: str
    cost_disposition: CostDisposition = "RELEASE"

    def __post_init__(self) -> None:
        Exception.__init__(self, self.safe_message)


def invalid_internal_request(message: str = "The internal request is invalid") -> AiServiceError:
    return AiServiceError(422, "INVALID_INTERNAL_REQUEST", message)
