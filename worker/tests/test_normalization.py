from __future__ import annotations

import unittest

from cv_intelligence_worker.normalization import normalize_location, normalize_profile
from cv_intelligence_worker.schema import CandidateProfile, EducationEntry, ExperienceEntry


class NormalizationTests(unittest.TestCase):
    def _base_profile(self, **overrides: object) -> CandidateProfile:
        payload = {
            "tenant_id": "tenant-1",
            "candidate_id": "candidate-1",
            "source_document_id": "doc-1",
            "source_sha256": "sha-1",
            "name": "Candidate",
            "current_title": "",
            "headline": "",
            "location": "Damascus, Syria",
            "email": "candidate@example.com",
            "phone": "",
            "links": [],
            "years_experience": 0.0,
            "seniority": "unclassified",
            "role_tags": [],
            "skills": [],
            "skill_aliases": {},
            "experience": [],
            "education": [],
            "projects": [],
            "languages": [],
            "certifications": [],
            "summary": "",
            "raw_text": "",
            "metadata": {},
            "confidence": 0.8,
            "missing_fields": [],
            "parse_warnings": [],
        }
        payload.update(overrides)
        return CandidateProfile(**payload)

    def test_normalize_profile_prefers_experience_title_over_location(self) -> None:
        profile = self._base_profile(
            current_title="Damascus, Syria",
            headline="Frontend Developer with 3+ years of experience building production dashboards",
            years_experience=10.0,
            seniority="Senior",
            skills=["React", "Next.js", "TypeScript"],
            experience=[
                ExperienceEntry(company="Asmartech", title="Front-End Developer", start_date="2024", end_date="Present"),
            ],
            summary="Frontend developer with React and Next.js experience.",
        )

        normalized = normalize_profile(profile)

        self.assertEqual(normalized.current_title, "Front-End Developer")
        self.assertEqual(normalized.role_tags[0], "frontend")
        self.assertEqual(normalized.seniority, "mid")
        self.assertLessEqual(normalized.years_experience, 5.0)

    def test_normalize_profile_prioritizes_mobile_role_for_flutter_candidates(self) -> None:
        profile = self._base_profile(
            current_title="Flutter Developer",
            headline="Flutter Developer and UI/UX Designer",
            seniority="Mid-Level",
            skills=["React", "Firebase", "UI/UX"],
            experience=[
                ExperienceEntry(company="Devoura", title="Flutter Developer", start_date="2023", end_date="Present"),
            ],
            summary="Built iOS and Android apps with Flutter and launched to the App Store.",
            raw_text="Flutter Developer building mobile apps for iOS and Android with Firebase.",
        )

        normalized = normalize_profile(profile)

        self.assertEqual(normalized.role_tags[0], "mobile")
        self.assertIn("frontend", normalized.role_tags)
        self.assertIn("Flutter", normalized.skills)
        self.assertEqual(normalized.seniority, "mid")

    def test_normalize_profile_security_focus_beats_infrastructure_noise(self) -> None:
        profile = self._base_profile(
            current_title="Cybersecurity Specialist",
            headline="Cloud Security Engineer and Cybersecurity Engineer",
            skills=["AWS", "Docker", "Kubernetes", "SIEM", "Splunk"],
            summary="Threat detection, vulnerability management, and securing cloud infrastructure.",
            raw_text="Cybersecurity specialist skilled in SIEM, threat detection, and vulnerability assessment.",
        )

        normalized = normalize_profile(profile)

        self.assertEqual(normalized.role_tags[0], "security")
        self.assertNotEqual(normalized.role_tags[0], "devops")

    def test_normalize_profile_rejects_impossible_staff_plus_without_experience_signal(self) -> None:
        profile = self._base_profile(
            current_title="AI & Backend Engineer",
            headline="AI & Backend Engineer",
            seniority="staff-plus",
            years_experience=0.0,
            skills=["Python", "Laravel", "TensorFlow"],
            summary="Software engineer focused on backend systems and AI/ML, with experience building scalable applications and clean architectures.",
        )

        normalized = normalize_profile(profile)

        self.assertEqual(normalized.seniority, "unclassified")

    def test_normalize_profile_keeps_explicit_senior_when_title_confirms_it(self) -> None:
        profile = self._base_profile(
            current_title="Senior Backend Engineer",
            headline="Senior Backend Engineer",
            seniority="senior",
            years_experience=0.0,
            skills=["Node.js", "GraphQL"],
            summary="Backend engineer working on APIs and platform services.",
        )

        normalized = normalize_profile(profile)

        self.assertEqual(normalized.seniority, "senior")

    def test_normalize_profile_ignores_inflated_years_when_education_overlaps_work_history(self) -> None:
        profile = self._base_profile(
            current_title="Front-End Developer with SEO expertise in Information Technology (IT)",
            headline="Front-End Developer with SEO expertise in Information Technology (IT)",
            years_experience=10.0,
            seniority="senior",
            experience=[
                ExperienceEntry(
                    company="Montreal's Leading SEO & Digital Marketing Agency",
                    title="SEO Developer, Growth-Hacker",
                    start_date="08/2024",
                    end_date="Present",
                    location="Montreal, Canada",
                ),
                ExperienceEntry(
                    company="CREMEDIA GLOBAL - MARKETING AGENCY",
                    title="Web Developer",
                    start_date="22/08/2021",
                    end_date="09/2021",
                    location="Damascus, Syria",
                ),
                ExperienceEntry(
                    company="CREMEDIA GLOBAL - MARKETING AGENCY",
                    title="Project Leadership",
                    start_date="2018-09",
                    end_date="2023-09",
                    location="Damascus, Syria",
                ),
            ],
            education=[
                EducationEntry(
                    institution="Arab International University",
                    degree="Bachelor's Degree in Information Technology Engineer - Artificial Intelligence",
                    start_date="2018-09",
                    end_date="2023-09",
                ),
            ],
            summary="Front-end developer with over three years of experience building user-friendly websites.",
        )

        normalized = normalize_profile(profile)

        self.assertLessEqual(normalized.years_experience, 6.0)
        self.assertNotEqual(normalized.seniority, "senior")

    def test_normalize_profile_discards_invalid_location_terms(self) -> None:
        profile = self._base_profile(
            location="ERP, CRM",
            current_title="Full Stack Developer",
            headline="Full Stack Developer",
        )

        normalized = normalize_profile(profile)

        self.assertEqual(normalized.location, "")

    def test_normalize_location_canonicalizes_damascus_variants(self) -> None:
        self.assertEqual(normalize_location("Damscus"), "Damascus, Syria")
        self.assertEqual(normalize_location("Damascus syria"), "Damascus, Syria")
        self.assertEqual(normalize_location("Damascus, syria"), "Damascus, Syria")
        self.assertEqual(normalize_location("Damascus"), "Damascus, Syria")


if __name__ == "__main__":
    unittest.main()
