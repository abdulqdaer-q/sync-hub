import pytest

from cv_intelligence_worker.candidate_normalization import canonical_skill


@pytest.mark.parametrize(
    ("raw_skill", "expected"),
    [
        ("React.js", "React"),
        ("• basic knowledge of NodeJS", "Node.js"),
        ("Frontend: TypeScript", "TypeScript"),
        ("ASP.NET Core 8", "ASP.NET Core"),
        ("AWS", "AWS"),
    ],
)
def test_canonical_skill_normalizes_supported_aliases(raw_skill: object, expected: str) -> None:
    assert canonical_skill(raw_skill) == expected


@pytest.mark.parametrize(
    "raw_skill",
    [
        None,
        "candidate@example.com",
        "2024-01",
        "Frontend Developer",
        "!!!",
    ],
)
def test_canonical_skill_rejects_noise(raw_skill: object) -> None:
    assert canonical_skill(raw_skill) == ""
