from __future__ import annotations

import json
from typing import Any, TypeVar

from openai import OpenAI, OpenAIError
from pydantic import BaseModel, ValidationError

from .config import WorkerConfig

OutputT = TypeVar("OutputT", bound=BaseModel)


class LLMResponseError(RuntimeError):
    pass


class LLMClient:
    def __init__(
        self,
        config: WorkerConfig,
        *,
        provider: str | None = None,
        client: OpenAI | None = None,
    ) -> None:
        self.config = config
        self.provider = (provider or config.extraction_provider).lower()
        self._client = client

    def parse(
        self,
        *,
        model: str,
        system_prompt: str,
        prompt: dict[str, Any],
        response_model: type[OutputT],
    ) -> OutputT:
        try:
            completion = self._sync_client().chat.completions.parse(
                model=model,
                messages=self._messages(system_prompt, prompt),
                temperature=0,
                response_format=response_model,
            )
        except ValidationError as exc:
            raise LLMResponseError("structured model response failed validation") from exc
        except OpenAIError as exc:
            status = getattr(exc, "status_code", None)
            detail = f" with status {status}" if status is not None else ""
            raise LLMResponseError(f"structured model request failed{detail}") from exc
        if not completion.choices:
            raise LLMResponseError("model returned no completion choices")
        return self._parsed_output(completion.choices[0].message, response_model)

    def _sync_client(self) -> OpenAI:
        if self._client is None:
            self._client = OpenAI(**self._client_options())
        return self._client

    def _client_options(self) -> dict[str, Any]:
        return {
            "api_key": self.config.model_api_key,
            "base_url": self._base_url(),
            "timeout": self.config.request_timeout_seconds,
            "max_retries": max(0, self.config.extraction_max_attempts - 1),
        }

    def _base_url(self) -> str:
        base_url = self.config.model_base_url.rstrip("/")
        if self.provider == "ollama" and not base_url.endswith("/v1"):
            return f"{base_url}/v1"
        return base_url

    @staticmethod
    def _messages(system_prompt: str, prompt: dict[str, Any]) -> list[dict[str, str]]:
        return [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": json.dumps(prompt, ensure_ascii=True)},
        ]

    @staticmethod
    def _parsed_output(message: Any, response_model: type[OutputT]) -> OutputT:
        refusal = getattr(message, "refusal", None)
        if refusal:
            raise LLMResponseError("model refused structured output")
        parsed = getattr(message, "parsed", None)
        if not isinstance(parsed, response_model):
            raise LLMResponseError("model returned no validated structured output")
        return parsed
