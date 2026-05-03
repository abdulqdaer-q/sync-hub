export function formatYearsExperience(value: number | null | undefined, unit: "years" | "yrs" = "years") {
  const numericValue = Number(value);
  const roundedYears = Number.isFinite(numericValue) ? Math.max(0, Math.round(numericValue)) : 0;

  if (unit === "yrs") {
    return `${roundedYears} yrs`;
  }

  return `${roundedYears} ${roundedYears === 1 ? "year" : "years"}`;
}
