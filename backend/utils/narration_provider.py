from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Optional

import httpx

from database.database import get_settings


@dataclass(frozen=True)
class NarrationResult:
    narration: str
    suggested_actions: list[str]
    provider: str
    model: str


class NarrationProviderError(RuntimeError):
    pass


class NarrationProvider:
    name: str

    def narrate_json(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.7,
        max_tokens: int = 350,
    ) -> NarrationResult:
        raise NotImplementedError


def _coerce_json_response(raw_text: str) -> dict[str, Any] | None:
    """
    Best-effort extraction of a JSON object from model text.
    We support:
      - pure JSON
      - JSON wrapped in prose/code fences
    """
    text = (raw_text or "").strip()
    if not text:
        return None

    # First try plain parse
    try:
        parsed = json.loads(text)
        return parsed if isinstance(parsed, dict) else None
    except Exception:
        pass

    # Try to salvage first {...} block
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            parsed = json.loads(text[start : end + 1])
            return parsed if isinstance(parsed, dict) else None
        except Exception:
            return None

    return None


def _normalize_actions(value: Any, *, limit: int = 6) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        # allow newline lists
        parts = [p.strip(" -\t\r\n") for p in value.replace("\r", "").split("\n")]
        return [p for p in parts if p][:limit]
    if isinstance(value, list):
        out: list[str] = []
        for item in value:
            if isinstance(item, str) and item.strip():
                out.append(item.strip())
            if len(out) >= limit:
                break
        return out
    return []


class OpenAINarrationProvider(NarrationProvider):
    name = "openai"

    def __init__(self, *, api_key: str, model: str):
        self._api_key = api_key
        self._model = model

    def narrate_json(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.7,
        max_tokens: int = 350,
    ) -> NarrationResult:
        if not self._api_key:
            raise NarrationProviderError("OPENAI_API_KEY is not configured")

        try:
            # Use the v1 client to avoid relying on global module state.
            from openai import OpenAI

            client = OpenAI(api_key=self._api_key)
            resp = client.chat.completions.create(
                model=self._model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=temperature,
                max_tokens=max_tokens,
            )
            raw = (resp.choices[0].message.content or "").strip()
        except Exception as e:
            raise NarrationProviderError(f"OpenAI narration failed: {e}") from e

        parsed = _coerce_json_response(raw)
        narration = ""
        suggested_actions: list[str] = []

        if parsed:
            narration = str(parsed.get("narration") or parsed.get("text") or "").strip()
            suggested_actions = _normalize_actions(parsed.get("suggested_actions") or parsed.get("actions"))

        if not narration:
            # Fallback: treat raw as narration
            narration = raw

        return NarrationResult(
            narration=narration,
            suggested_actions=suggested_actions,
            provider=self.name,
            model=self._model,
        )


class OllamaNarrationProvider(NarrationProvider):
    name = "ollama"

    def __init__(self, *, base_url: str, model: str, timeout_s: float = 60.0):
        self._base_url = (base_url or "").rstrip("/")
        self._model = model
        self._timeout_s = timeout_s

    def narrate_json(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.7,
        max_tokens: int = 350,
    ) -> NarrationResult:
        if not self._base_url:
            raise NarrationProviderError("OLLAMA_BASE_URL is not configured")
        if not self._model:
            raise NarrationProviderError("OLLAMA_MODEL_FAST is not configured")

        payload = {
            "model": self._model,
            "stream": False,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "options": {
                "temperature": temperature,
                # Ollama does not use max_tokens directly; `num_predict` is the closest.
                "num_predict": max_tokens,
            },
        }

        url = f"{self._base_url}/api/chat"
        try:
            with httpx.Client(timeout=self._timeout_s) as client:
                r = client.post(url, json=payload)
                r.raise_for_status()
                data = r.json()
                raw = str(((data.get("message") or {}).get("content")) or "").strip()
        except Exception as e:
            raise NarrationProviderError(f"Ollama narration failed: {e}") from e

        parsed = _coerce_json_response(raw)
        narration = ""
        suggested_actions: list[str] = []

        if parsed:
            narration = str(parsed.get("narration") or parsed.get("text") or "").strip()
            suggested_actions = _normalize_actions(parsed.get("suggested_actions") or parsed.get("actions"))

        if not narration:
            narration = raw

        return NarrationResult(
            narration=narration,
            suggested_actions=suggested_actions,
            provider=self.name,
            model=self._model,
        )


def get_narration_provider() -> NarrationProvider:
    settings = get_settings()
    provider = (getattr(settings, "narration_provider", "") or "openai").strip().lower()

    if provider == "ollama":
        return OllamaNarrationProvider(
            base_url=getattr(settings, "ollama_base_url", "") or "http://127.0.0.1:11434",
            model=getattr(settings, "ollama_model_fast", "") or "llama3.1:8b-instruct",
        )

    # Default: OpenAI
    return OpenAINarrationProvider(
        api_key=getattr(settings, "openai_api_key", "") or "",
        model=getattr(settings, "openai_narration_model", "") or "gpt-4o-mini",
    )


