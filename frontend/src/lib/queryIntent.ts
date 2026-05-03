import type { SearchFilters } from "@/lib/contracts";
import {
  normalizeLocationValue,
  normalizeSeniorityValue,
  normalizeSkillList,
  parseSkillInput,
} from "@/lib/searchTaxonomy";

type SearchFilterInputs = {
  role?: string;
  seniority?: string;
  minYearsExperience?: number;
  skills?: string[];
  companies?: string[];
  location?: string;
};

export function parseSkillText(input: string) {
  return parseSkillInput(input);
}

export function deriveSearchFilters(query: string, filters: SearchFilterInputs): SearchFilters {
  void query;
  const explicitSkills = normalizeSkillList(filters.skills ?? []);
  const explicitCompanies = Array.from(new Set((filters.companies ?? []).map((company) => company.trim()).filter(Boolean)));
  const explicitMinYears =
    typeof filters.minYearsExperience === "number" && filters.minYearsExperience > 0
      ? filters.minYearsExperience
      : undefined;

  return {
    role: filters.role || undefined,
    seniority: normalizeSeniorityValue(filters.seniority) || undefined,
    minYearsExperience: explicitMinYears ?? 0,
    location: normalizeLocationValue(filters.location) || undefined,
    skills: explicitSkills,
    companies: explicitCompanies,
  };
}
