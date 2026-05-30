type TaxonomyEntry<T extends string> = {
  value: T;
  label?: string;
  aliases: readonly string[];
};

export const SEARCH_SENIORITY_TABLE = [
  {
    value: "staff-plus",
    label: "Staff+",
    aliases: [
      "staff",
      "staff+",
      "principal",
      "lead",
      "architect",
      "technical lead",
      "tech lead",
      "head of engineering",
      "head of",
    ],
  },
  {
    value: "senior",
    label: "Senior",
    aliases: ["senior", "sr", "sr."],
  },
  {
    value: "mid",
    label: "Mid",
    aliases: ["mid", "mid-level", "mid level", "intermediate"],
  },
  {
    value: "junior",
    label: "Junior",
    aliases: [
      "junior",
      "jr",
      "jr.",
      "entry level",
      "entry-level",
      "intern",
      "graduate",
      "fresher",
      "trainee",
    ],
  },
] as const satisfies readonly TaxonomyEntry<string>[];

export const SEARCH_SKILL_TABLE = [
  {
    value: ".NET",
    aliases: [
      ".net",
      "dotnet",
      "dot net",
      ".net core",
      "dotnet core",
      ".net framework",
      "net framework",
      ".net4",
      ".net 4",
      ".net4.0",
      ".net 4.0",
      "net4",
      "net 4",
      "net4.0",
      "net 4.0",
      ".net5",
      ".net 5",
      ".net5.0",
      ".net 5.0",
      "net5",
      "net 5",
      "net5.0",
      "net 5.0",
      ".net6",
      ".net 6",
      ".net6.0",
      ".net 6.0",
      "net6",
      "net 6",
      "net6.0",
      "net 6.0",
      ".net7",
      ".net 7",
      ".net7.0",
      ".net 7.0",
      "net7",
      "net 7",
      "net7.0",
      "net 7.0",
      ".net8",
      ".net 8",
      ".net8.0",
      ".net 8.0",
      "net8",
      "net 8",
      "net8.0",
      "net 8.0",
    ],
  },
  { value: "Angular", aliases: ["angular", "angularjs", "angular js"] },
  { value: "ASP.NET", aliases: ["asp.net", "asp net", "asp-net"] },
  {
    value: "ASP.NET Core",
    aliases: ["asp.net core", "asp net core", "asp-net-core"],
  },
  { value: "AWS", aliases: ["aws", "amazon web services"] },
  { value: "Azure", aliases: ["azure", "microsoft azure"] },
  { value: "C#", aliases: ["c#", "c sharp"] },
  { value: "C++", aliases: ["c++", "cpp"] },
  { value: "CSS", aliases: ["css", "css3"] },
  { value: "Dart", aliases: ["dart"] },
  { value: "Django", aliases: ["django"] },
  { value: "Docker", aliases: ["docker"] },
  { value: "Express", aliases: ["express", "expressjs", "express js"] },
  { value: "FastAPI", aliases: ["fastapi", "fast api"] },
  { value: "Firebase", aliases: ["firebase"] },
  { value: "Flask", aliases: ["flask"] },
  { value: "Flutter", aliases: ["flutter"] },
  { value: "Go", aliases: ["go", "golang"] },
  { value: "Google Cloud", aliases: ["google cloud", "gcp"] },
  { value: "GraphQL", aliases: ["graphql", "graph ql"] },
  { value: "HTML", aliases: ["html", "html5"] },
  { value: "Java", aliases: ["java"] },
  { value: "JavaScript", aliases: ["javascript", "js"] },
  { value: "Kafka", aliases: ["kafka"] },
  { value: "Kotlin", aliases: ["kotlin"] },
  { value: "Kubernetes", aliases: ["kubernetes", "k8s"] },
  { value: "Laravel", aliases: ["laravel"] },
  { value: "Linux", aliases: ["linux"] },
  { value: "MongoDB", aliases: ["mongodb", "mongo db"] },
  { value: "MySQL", aliases: ["mysql", "my sql"] },
  { value: "NestJS", aliases: ["nestjs", "nest js"] },
  { value: "Next.js", aliases: ["next.js", "nextjs", "next js"] },
  {
    value: "Node.js",
    aliases: ["node", "node.js", "nodejs", "node js", "node-js"],
  },
  { value: "NumPy", aliases: ["numpy", "num py"] },
  { value: "Pandas", aliases: ["pandas"] },
  { value: "PHP", aliases: ["php"] },
  { value: "PostgreSQL", aliases: ["postgres", "postgresql", "postgre sql"] },
  { value: "PyTorch", aliases: ["pytorch", "py torch"] },
  { value: "Python", aliases: ["python", "py"] },
  { value: "React", aliases: ["react", "reactjs", "react js"] },
  { value: "React Native", aliases: ["react native"] },
  { value: "Redis", aliases: ["redis"] },
  {
    value: "REST APIs",
    aliases: ["rest", "rest api", "rest apis", "restful api"],
  },
  { value: "Supabase", aliases: ["supabase"] },
  { value: "Swift", aliases: ["swift"] },
  {
    value: "Tailwind CSS",
    aliases: ["tailwind", "tailwindcss", "tailwind css"],
  },
  { value: "Terraform", aliases: ["terraform"] },
  { value: "TensorFlow", aliases: ["tensorflow", "tensor flow"] },
  { value: "TypeScript", aliases: ["typescript", "ts"] },
  { value: "Vue", aliases: ["vue", "vuejs", "vue js"] },
] as const satisfies readonly TaxonomyEntry<string>[];

const LOCATION_COUNTRY_TABLE = [
  { value: "Bahrain", aliases: ["bahrain"] },
  { value: "Canada", aliases: ["canada", "montreal"] },
  { value: "Egypt", aliases: ["egypt", "cairo"] },
  { value: "France", aliases: ["france", "paris"] },
  { value: "Germany", aliases: ["germany", "deutschland", "berlin"] },
  { value: "India", aliases: ["india"] },
  { value: "Iraq", aliases: ["iraq"] },
  { value: "Jordan", aliases: ["jordan", "amman"] },
  { value: "Kuwait", aliases: ["kuwait", "kuwait city"] },
  { value: "Lebanon", aliases: ["lebanon", "beirut"] },
  { value: "Netherlands", aliases: ["netherlands", "holland"] },
  { value: "Oman", aliases: ["oman"] },
  { value: "Pakistan", aliases: ["pakistan"] },
  { value: "Palestine", aliases: ["palestine", "palestinian territories"] },
  { value: "Philippines", aliases: ["philippines"] },
  { value: "Qatar", aliases: ["qatar", "doha"] },
  {
    value: "Saudi Arabia",
    aliases: [
      "saudi arabia",
      "ksa",
      "kingdom of saudi arabia",
      "riyadh",
      "jeddah",
    ],
  },
  {
    value: "Syria",
    aliases: [
      "syria",
      "syrian arab republic",
      "damascus",
      "damscus",
      "aleppo",
      "damascus syria",
      "damscus syria",
      "aleppo syria",
    ],
  },
  { value: "Turkey", aliases: ["turkey", "turkiye", "istanbul"] },
  {
    value: "United Arab Emirates",
    aliases: [
      "united arab emirates",
      "uae",
      "u.a.e",
      "emirates",
      "dubai",
      "abu dhabi",
    ],
  },
  {
    value: "United Kingdom",
    aliases: ["united kingdom", "uk", "u.k", "great britain", "england"],
  },
  {
    value: "United States",
    aliases: ["united states", "usa", "u.s.a", "us", "u.s", "america"],
  },
] as const satisfies readonly TaxonomyEntry<string>[];

function normalizeLookupToken(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapePattern(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function dedupe(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function compileEntry<T extends string>(entry: TaxonomyEntry<T>) {
  const aliases = dedupe(
    [entry.value, ...entry.aliases]
      .map((alias) => normalizeLookupToken(alias))
      .filter(Boolean),
  );
  return {
    ...entry,
    aliases,
    patterns: aliases.map((alias) => {
      const pattern = escapePattern(alias).replace(/\s+/g, "[-\\s]+");
      return new RegExp(`(^|[^a-z0-9+#.])${pattern}([^a-z0-9+#.]|$)`, "i");
    }),
  };
}

const COMPILED_SENIORITY = SEARCH_SENIORITY_TABLE.map(compileEntry);
const COMPILED_SKILLS = SEARCH_SKILL_TABLE.map(compileEntry).sort(
  (left, right) =>
    Math.max(...right.aliases.map((alias) => alias.length)) -
    Math.max(...left.aliases.map((alias) => alias.length)),
);
const COMPILED_LOCATIONS = LOCATION_COUNTRY_TABLE.map(compileEntry).sort(
  (left, right) =>
    Math.max(...right.aliases.map((alias) => alias.length)) -
    Math.max(...left.aliases.map((alias) => alias.length)),
);

const SENIORITY_ALIAS_MAP = new Map(
  COMPILED_SENIORITY.flatMap((entry) =>
    entry.aliases.map((alias) => [alias, entry.value] as const)
  ),
);
const SKILL_ALIAS_MAP = new Map(
  COMPILED_SKILLS.flatMap((entry) =>
    entry.aliases.map((alias) => [alias, entry.value] as const)
  ),
);
const LOCATION_ALIAS_MAP = new Map(
  COMPILED_LOCATIONS.flatMap((entry) =>
    entry.aliases.map((alias) => [alias, entry.value] as const)
  ),
);

function titleCaseLocation(value: string) {
  return value
    .split(/\s+/)
    .map((part) =>
      part ? `${part[0].toUpperCase()}${part.slice(1).toLowerCase()}` : part
    )
    .join(" ");
}

type LocationNormalizeOptions = {
  allowFallback?: boolean;
};

function looksLikeFallbackLocation(value: string) {
  const normalized = normalizeLookupToken(value);
  if (!normalized || normalized.length > 48 || /\d/.test(normalized)) {
    return false;
  }

  const words = normalized.split(/\s+/).filter(Boolean);
  if (!words.length || words.length > 4) {
    return false;
  }

  return !/\b(?:frontend|front end|backend|back end|full stack|fullstack|developer|engineer|designer|manager|senior|junior|mid|staff|lead|principal|devops|sre|platform|cloud|data|ml|ai|qa|security|mobile|android|ios|years?|yrs?|experience|skill|skills|knowledge|react|angular|vue|node|net|java|python|kubernetes|terraform|docker|aws|azure|with|worked|working|work)\b/i
    .test(
      normalized,
    );
}

export function normalizeSeniorityValue(value: string | null | undefined) {
  const normalized = normalizeLookupToken(value ?? "");
  return normalized ? SENIORITY_ALIAS_MAP.get(normalized) : undefined;
}

export function extractSeniorityFromText(query: string) {
  for (const entry of COMPILED_SENIORITY) {
    if (entry.patterns.some((pattern) => pattern.test(query))) {
      return entry.value;
    }
  }

  return undefined;
}

export function normalizeSkillValue(value: string | null | undefined) {
  const normalized = normalizeLookupToken(value ?? "");
  return normalized
    ? (SKILL_ALIAS_MAP.get(normalized) ?? value?.trim())
    : undefined;
}

export function normalizeSkillList(values: Array<string | null | undefined>) {
  return dedupe(
    values
      .map((value) => normalizeSkillValue(value))
      .filter((value): value is string => Boolean(value)),
  );
}

export function normalizeLocationValue(
  value: string | null | undefined,
  options: LocationNormalizeOptions = {},
) {
  const raw = value?.trim();
  if (!raw) {
    return undefined;
  }

  const parts = raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const candidates = parts.length > 1 ? [parts[parts.length - 1], raw] : [raw];

  for (const candidate of candidates) {
    const normalized = normalizeLookupToken(candidate);
    const exact = LOCATION_ALIAS_MAP.get(normalized);
    if (exact) {
      return exact;
    }
  }

  for (const entry of COMPILED_LOCATIONS) {
    if (entry.patterns.some((pattern) => pattern.test(raw))) {
      return entry.value;
    }
  }

  if (options.allowFallback === false) {
    return undefined;
  }

  const fallbackSource = parts.length > 1 ? parts[parts.length - 1] : raw;
  if (!looksLikeFallbackLocation(fallbackSource)) {
    return undefined;
  }

  const fallback = normalizeLookupToken(fallbackSource);
  return fallback ? titleCaseLocation(fallback) : undefined;
}

export function extractSkillsFromText(query: string) {
  const matches: string[] = [];

  for (const entry of COMPILED_SKILLS) {
    if (entry.patterns.some((pattern) => pattern.test(query))) {
      matches.push(entry.value);
    }
  }

  return dedupe(matches);
}
