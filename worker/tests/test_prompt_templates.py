from __future__ import annotations

import hashlib

import pytest
from pydantic import ValidationError

from cv_intelligence_worker.candidate_extraction import build_candidate_system_prompt, build_job_family_system_prompt
from cv_intelligence_worker.candidate_extraction.prompts.loader import PromptConfigurationError, PromptTemplate, load_prompt_template


def test_yaml_prompts_preserve_reviewed_content() -> None:
    prompts = {
        "candidate": build_candidate_system_prompt(),
        "job_family": build_job_family_system_prompt(),
    }

    assert hashlib.sha256(prompts["candidate"].encode()).hexdigest() == "657b3093a50d0d57e958979cc40b89cdb7a9739ea6a262e791b43fff59a90145"
    assert hashlib.sha256(prompts["job_family"].encode()).hexdigest() == "37ff0dcd32490e41884e39fbcfca67e3bc4aeeedbe68710d5a1dcb1195cac456"


def test_prompt_template_rejects_mismatched_variables() -> None:
    with pytest.raises(ValidationError, match="placeholders do not match"):
        PromptTemplate(version=1, template="Hello {name}", input_variables=["other"])


def test_prompt_template_requires_exact_render_values() -> None:
    template = PromptTemplate(version=1, template="Hello {name}", input_variables=["name"])

    with pytest.raises(PromptConfigurationError, match="values do not match"):
        template.render(other="value")


def test_unknown_prompt_name_fails_closed() -> None:
    with pytest.raises(PromptConfigurationError, match="unknown prompt template"):
        load_prompt_template("unknown")
