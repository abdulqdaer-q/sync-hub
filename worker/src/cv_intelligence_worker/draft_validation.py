from __future__ import annotations

import json
import logging
from typing import Any

from .config import WorkerConfig
from .extraction import _call_openai_compatible_json, _call_ollama_json

logger = logging.getLogger(__name__)

VALIDATION_OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "is_valid": {"type": "boolean"},
        "reason": {"type": "string"},
    },
    "required": ["is_valid", "reason"],
}


def _validation_system_prompt() -> str:
    return (
        "You are an AI validation assistant for a recruitment platform.\n"
        "Your task is to compare the original extracted CV profile with the user's manual edits.\n"
        "You must determine if the user's edits are logical, realistic, and do not constitute fraud.\n"
        "Rules:\n"
        "- The user can correct OCR mistakes, adjust dates, or slightly modify titles.\n"
        "- The user CANNOT drastically change their seniority (e.g., from Junior to CEO) without evidence.\n"
        "- The user CANNOT add entirely new high-level roles that do not match the original CV timeline.\n"
        "- If the edits are minor and logical, return is_valid=true.\n"
        "- If the edits are suspicious, illogical, or fraudulent, return is_valid=false and provide a short reason.\n"
        "- Return ONLY valid JSON.\n\n"
        f"Output schema: {json.dumps(VALIDATION_OUTPUT_SCHEMA, ensure_ascii=True)}"
    )


def validate_user_overrides_with_llm(
    original_profile: dict[str, Any], user_overrides: dict[str, Any], config: WorkerConfig
) -> tuple[bool, str]:
    if not user_overrides:
        return True, ""

    provider = config.job_family_provider.lower()
    model = config.job_family_model or config.extraction_model

    if provider in {"rules", "deterministic", "off", "disabled"} or not model:
        logger.info("LLM validation disabled, auto-accepting edits.")
        return True, ""

    prompt = {
        "original_extracted_profile": original_profile,
        "user_manual_edits": user_overrides,
    }

    try:
        if provider == "ollama" or (provider == "llm" and config.extraction_provider.lower() == "ollama"):
            result = _call_ollama_json(
                config, model, _validation_system_prompt(), prompt, VALIDATION_OUTPUT_SCHEMA
            )
        else:
            result = _call_openai_compatible_json(config, model, _validation_system_prompt(), prompt)
        
        is_valid = bool(result.get("is_valid", False))
        reason = str(result.get("reason", ""))
        return is_valid, reason
    except Exception as exc:
        logger.error(f"Failed to validate draft with LLM: {exc}")
        # Default to reject if validation fails to prevent fraudulent overrides
        return False, f"LLM validation failed: {exc}"
