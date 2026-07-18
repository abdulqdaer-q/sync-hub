from __future__ import annotations

import json
from typing import Any

from ...llm_models import CandidateExtraction, JobFamilyExtraction
from ...normalization_constants import JOB_FAMILY_LABELS, JOB_FAMILY_TAXONOMY_VERSION
from ...schema import CandidateProfile
from ...utils import compact_whitespace
from .loader import load_prompt_template


def build_candidate_system_prompt() -> str:
    return load_prompt_template("candidate_system").render(
        output_schema=json.dumps(CandidateExtraction.model_json_schema(), indent=2, ensure_ascii=True)
    )


def build_job_family_system_prompt() -> str:
    return load_prompt_template("job_family_system").render(
        job_family_labels=json.dumps(list(JOB_FAMILY_LABELS), ensure_ascii=True),
        output_schema=json.dumps(JobFamilyExtraction.model_json_schema(), ensure_ascii=True),
    )


def build_job_family_prompt(profile: CandidateProfile) -> dict[str, Any]:
    return {
        "taxonomy_version": JOB_FAMILY_TAXONOMY_VERSION,
        "deterministic_job_family": profile.metadata.get("job_family"),
        "deterministic_confidence": profile.metadata.get("job_family_confidence"),
        "candidate_profile": {
            "current_title": profile.current_title,
            "headline": profile.headline,
            "seniority": profile.seniority,
            "role_tags": profile.role_tags,
            "skills": profile.skills[:80],
            "summary": compact_whitespace(profile.summary)[:1200],
            "experience": [
                {
                    "title": entry.title,
                    "company": entry.company,
                    "description": compact_whitespace(entry.description)[:500],
                }
                for entry in profile.experience[:6]
            ],
            "projects": [
                {
                    "name": project.name,
                    "description": compact_whitespace(project.description)[:300],
                    "technologies": project.technologies[:20],
                }
                for project in profile.projects[:4]
            ],
        },
    }
