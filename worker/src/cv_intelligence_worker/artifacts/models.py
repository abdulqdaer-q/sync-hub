from __future__ import annotations

from typing import Annotated

from pydantic import Field, field_validator, model_validator

from ..llm_models import LLMOutput


NonBlankText = Annotated[str, Field(min_length=1)]
Confidence = Annotated[float, Field(ge=0, le=1)]
ComparisonScore = Annotated[float, Field(ge=0, le=100)]


def _normalize_unique(values: list[str]) -> list[str]:
    normalized = [" ".join(value.split()) for value in values]
    if any(not value for value in normalized):
        raise ValueError("artifact lists cannot contain blank values")
    if len(normalized) != len(set(normalized)):
        raise ValueError("artifact lists cannot contain duplicates")
    return normalized


class SummaryArtifactOutput(LLMOutput):
    short_summary: Annotated[str, Field(min_length=1, max_length=400)]
    long_summary: Annotated[str, Field(min_length=1, max_length=2000)]
    strengths: list[NonBlankText] = Field(max_length=5)
    risks: list[NonBlankText] = Field(max_length=5)
    recommended_roles: list[NonBlankText] = Field(max_length=6)
    evidence_refs: list[NonBlankText] = Field(max_length=20)
    confidence: Confidence

    @field_validator("strengths", "risks", "recommended_roles", "evidence_refs")
    @classmethod
    def require_unique_values(cls, values: list[str]) -> list[str]:
        return _normalize_unique(values)


class ComparisonItemOutput(LLMOutput):
    candidate_id: NonBlankText
    score: ComparisonScore
    matched_skills: list[NonBlankText] = Field(max_length=20)
    gaps: list[NonBlankText] = Field(max_length=20)
    evidence_refs: list[NonBlankText] = Field(max_length=20)

    @field_validator("matched_skills", "gaps", "evidence_refs")
    @classmethod
    def require_unique_values(cls, values: list[str]) -> list[str]:
        return _normalize_unique(values)


class ComparisonArtifactOutput(LLMOutput):
    overall_summary: Annotated[str, Field(min_length=1, max_length=2000)]
    items: list[ComparisonItemOutput] = Field(min_length=1)
    overlap: list[NonBlankText] = Field(max_length=20)
    recommended_candidate_id: str | None
    evidence_refs: list[NonBlankText] = Field(max_length=40)

    @field_validator("recommended_candidate_id")
    @classmethod
    def reject_blank_recommendation(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = " ".join(value.split())
        if not normalized:
            raise ValueError("recommended candidate ID cannot be blank")
        return normalized

    @field_validator("overlap", "evidence_refs")
    @classmethod
    def require_unique_values(cls, values: list[str]) -> list[str]:
        return _normalize_unique(values)

    @model_validator(mode="after")
    def require_unique_candidate_ids(self) -> ComparisonArtifactOutput:
        candidate_ids = [item.candidate_id for item in self.items]
        if len(candidate_ids) != len(set(candidate_ids)):
            raise ValueError("comparison candidate IDs must be unique")
        return self
