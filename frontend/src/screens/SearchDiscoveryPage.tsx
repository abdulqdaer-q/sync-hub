import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ArrowUp, BriefcaseBusiness, Building2, CheckCircle2, FileText, MapPin, MessageSquareText, Search, ShieldCheck, SlidersHorizontal, Sparkles, Users, X } from "lucide-react";
import { Link } from "react-router-dom";
import { PlatformScopeControl } from "@/components/PlatformScopeControl";
import { FilterMultiSelect } from "@/components/FilterMultiSelect";
import { PickerDropdown } from "@/components/PickerDropdown";
import { defaultSearchQuery } from "@/data/mockData";
import { buildChatHref } from "@/lib/chatAgent";
import type { SearchFilterOptions, SearchFilters, SearchResponse, WorkspaceStats } from "@/lib/contracts";
import { useAuth } from "@/lib/auth";
import { formatYearsExperience } from "@/lib/experience";
import { platformApi } from "@/lib/platformApi";
import { usePlatformScope } from "@/lib/platformScope";
import { deriveSearchFilters, parseSkillText } from "@/lib/queryIntent";
import { Avatar, EmptyState, PageIntro, Panel, ScorePill, StatCard, Tag } from "@/components/ui";

type SearchRequest = {
  query: string;
  filters: SearchFilters;
  offset: number;
  limit: number;
};

type SearchSortOption =
  | "best-match"
  | "experience-desc"
  | "experience-asc"
  | "name-asc"
  | "name-desc";

const PAGE_SIZE = 8;

type SearchLoadingStep = {
  label: string;
  phrase: string;
  detail: string;
};

const ROLE_LABELS: Record<string, string> = {
  backend: "backend",
  frontend: "frontend",
  "full-stack": "full-stack",
  mobile: "mobile",
  devops: "DevOps",
  data: "data",
  ml: "ML",
  qa: "QA",
  security: "security",
  generalist: "generalist",
};

function formatSearchList(values: string[], maxItems = 2) {
  const visible = values.slice(0, maxItems);
  const suffix = values.length > maxItems ? ` +${values.length - maxItems}` : "";
  return `${visible.join(", ")}${suffix}`;
}

function compactSearchQuery(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 54 ? `${trimmed.slice(0, 51)}...` : trimmed;
}

function buildSearchLoadingSteps(request: SearchRequest): SearchLoadingStep[] {
  const inferredFilters = deriveSearchFilters(request.query, request.filters);
  const queryLabel = compactSearchQuery(request.query);
  const roleLabel = inferredFilters.role ? ROLE_LABELS[inferredFilters.role] ?? inferredFilters.role : null;
  const seniorityLabel = inferredFilters.seniority ? `${inferredFilters.seniority} ` : "";
  const rolePhrase = roleLabel ? `${seniorityLabel}${roleLabel}`.trim() : "matching";
  const skills = inferredFilters.skills ?? [];
  const companies = inferredFilters.companies ?? [];
  const minYears = inferredFilters.minYearsExperience ?? 0;
  const location = inferredFilters.location?.trim();
  const constraintParts = [
    minYears > 0 ? `${Math.round(minYears)}+ years` : null,
    location || null,
    skills.length ? formatSearchList(skills) : null,
    companies.length ? formatSearchList(companies) : null,
  ].filter((part): part is string => Boolean(part));

  const steps: SearchLoadingStep[] = [
    {
      label: "Read request",
      phrase: queryLabel ? `Asking the intent model to read "${queryLabel}"` : "Reading selected filters",
      detail: roleLabel
        ? `Treating ${roleLabel} as the target role and keeping location separate.`
        : "Separating role, skills, seniority, years, companies, and location with the LLM.",
    },
    {
      label: "Shape filters",
      phrase: constraintParts.length ? `Applying ${formatSearchList(constraintParts, 3)}` : `Looking for ${rolePhrase} candidates`,
      detail: constraintParts.length
        ? "Using the explicit constraints as hard filters before ranking."
        : "Keeping the search broad enough to avoid dropping relevant profiles too early.",
    },
  ];

  if (skills.length) {
    steps.push({
      label: "Check skills",
      phrase: `Checking ${formatSearchList(skills)} evidence`,
      detail: "Matching requested skills against normalized candidate skill tokens.",
    });
  }

  if (location) {
    steps.push({
      label: "Match location",
      phrase: `Filtering for ${location}`,
      detail: "Comparing candidate locations with the normalized location request.",
    });
  }

  steps.push(
    {
      label: "Scan profiles",
      phrase: `Scanning ${rolePhrase} profiles`,
      detail: "Looking at titles, profile summaries, experience, and indexed skills.",
    },
    {
      label: "Rank shortlist",
      phrase: "Balancing exact fit with semantic relevance",
      detail: "Prioritizing title evidence, role fit, seniority, experience, and match quality.",
    },
    {
      label: "Prepare results",
      phrase: "Preparing the first ranked profiles",
      detail: "Packaging the strongest candidates for the results list.",
    },
  );

  return steps;
}

function SearchProcessingState({ request }: { request: SearchRequest }) {
  const steps = useMemo(() => buildSearchLoadingSteps(request), [request]);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const activeStep = steps[activeStepIndex] ?? steps[0];

  useEffect(() => {
    setActiveStepIndex(0);
    const stepTimer = window.setInterval(() => {
      setActiveStepIndex((currentIndex) => {
        if (currentIndex >= steps.length - 1) {
          window.clearInterval(stepTimer);
          return currentIndex;
        }

        return currentIndex + 1;
      });
    }, 1250);

    return () => {
      window.clearInterval(stepTimer);
    };
  }, [steps]);

  return (
    <Panel className="search-processing-panel" aria-busy="true" aria-label="Searching candidates">
      <div className="search-processing-visual" aria-hidden="true">
        <span className="search-processing-ring search-processing-ring--outer" />
        <span className="search-processing-ring search-processing-ring--inner" />
        <span className="search-processing-node search-processing-node--search">
          <Search size={15} />
        </span>
        <span className="search-processing-node search-processing-node--talent">
          <Users size={15} />
        </span>
        <div className="search-processing-core">
          <Sparkles size={22} />
        </div>
      </div>
      <div className="search-processing-copy">
        <strong>AI search in progress</strong>
        <span className="search-processing-phrase">{activeStep.phrase}</span>
        <p>{activeStep.detail}</p>
      </div>
      <div className="search-processing-steps">
        {steps.map((step, index) => (
          <span
            key={step.label}
            className={[
              "search-processing-step",
              index < activeStepIndex ? "search-processing-step--complete" : "",
              index === activeStepIndex ? "search-processing-step--active" : "",
            ].filter(Boolean).join(" ")}
          >
            <span>{String(index + 1).padStart(2, "0")}</span>
            {step.label}
          </span>
        ))}
      </div>
    </Panel>
  );
}

export function SearchDiscoveryPage() {
  const { currentTenant } = useAuth();
  const {
    currentWorkspace,
    isAllScope,
    isPlatformAdmin,
    resolvedTenantIds,
    scopeMode,
    setScopeMode,
    setWorkspaceId,
    workspaceOptions,
  } = usePlatformScope();
  const workspaceNameById = useMemo(
    () => new Map(workspaceOptions.map((workspace) => [workspace.id, workspace.name])),
    [workspaceOptions],
  );
  const queryInputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [seniority, setSeniority] = useState("");
  const [minYears, setMinYears] = useState(0);
  const [location, setLocation] = useState("");
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [selectedCompanies, setSelectedCompanies] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<SearchSortOption>("best-match");
  const [filterOptions, setFilterOptions] = useState<SearchFilterOptions | null>(null);
  const [workspaceStats, setWorkspaceStats] = useState<WorkspaceStats | null>(null);
  const [loadingWorkspaceStats, setLoadingWorkspaceStats] = useState(true);
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [loadingInitial, setLoadingInitial] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [request, setRequest] = useState<SearchRequest | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const requestedOffsetsRef = useRef<Set<number>>(new Set());
  const hasExecutedSearch = request !== null;
  const scopeKey = resolvedTenantIds.join("|");
  const sortedResults = useMemo(() => {
    const results = response?.results ?? [];

    switch (sortBy) {
      case "experience-desc":
        return [...results].sort((left, right) => right.yearsExperience - left.yearsExperience || right.matchScore - left.matchScore);
      case "experience-asc":
        return [...results].sort((left, right) => left.yearsExperience - right.yearsExperience || right.matchScore - left.matchScore);
      case "name-asc":
        return [...results].sort((left, right) => left.name.localeCompare(right.name));
      case "name-desc":
        return [...results].sort((left, right) => right.name.localeCompare(left.name));
      case "best-match":
      default:
        return results;
    }
  }, [response?.results, sortBy]);

  useEffect(() => {
    let cancelled = false;

    platformApi.getSearchFilterOptions(resolvedTenantIds).then((nextOptions) => {
      if (!cancelled) {
        setFilterOptions(nextOptions);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [resolvedTenantIds]);

  useEffect(() => {
    let cancelled = false;

    setWorkspaceStats(null);
    setLoadingWorkspaceStats(true);

    platformApi
      .getWorkspaceStats(resolvedTenantIds)
      .then((nextStats) => {
        if (!cancelled) {
          setWorkspaceStats(nextStats);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setWorkspaceStats(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingWorkspaceStats(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [scopeKey]);

  useEffect(() => {
    if (!request) {
      return;
    }

    let cancelled = false;
    const isFirstPage = request.offset === 0;
    setError(null);
    if (isFirstPage) {
      setLoadingInitial(true);
    } else {
      setLoadingMore(true);
    }

    platformApi
      .search(request.query, request.filters, {
        offset: request.offset,
        limit: request.limit,
      }, resolvedTenantIds)
      .then((nextResponse) => {
        if (cancelled) {
          return;
        }
        startTransition(() => {
          setResponse((currentResponse) => {
            if (isFirstPage || !currentResponse) {
              return nextResponse;
            }

            const seenIds = new Set(currentResponse.results.map((candidate) => candidate.candidateId));
            const appendedResults = nextResponse.results.filter((candidate) => !seenIds.has(candidate.candidateId));

            return {
              ...nextResponse,
              results: [...currentResponse.results, ...appendedResults],
              meta: {
                ...nextResponse.meta,
                count: currentResponse.results.length + appendedResults.length,
              },
            };
          });
          if (isFirstPage && nextResponse.meta.intent) {
            const resolvedIntent = nextResponse.meta.intent;
            setSeniority(resolvedIntent.seniority ?? "");
            setMinYears(resolvedIntent.minYearsExperience ?? 0);
            setLocation(resolvedIntent.location ?? "");
            setSelectedSkills(resolvedIntent.skills ?? []);
            setSelectedCompanies(resolvedIntent.companies ?? []);
          }
          setLoadingInitial(false);
          setLoadingMore(false);
        });
      })
      .catch((nextError) => {
        if (cancelled) {
          return;
        }
        if (!isFirstPage) {
          requestedOffsetsRef.current.delete(request.offset);
        }
        setError(String(nextError));
        setLoadingInitial(false);
        setLoadingMore(false);
      });

    return () => {
      cancelled = true;
    };
  }, [request, resolvedTenantIds]);

  useEffect(() => {
    if (!response?.nextCursor || loadingInitial || loadingMore || error) {
      return;
    }

    const sentinel = loadMoreRef.current;
    if (!sentinel) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting || !request || response.nextCursor === null) {
          return;
        }

        if (requestedOffsetsRef.current.has(response.nextCursor)) {
          return;
        }

        requestedOffsetsRef.current.add(response.nextCursor);
        setRequest({
          ...request,
          offset: response.nextCursor,
        });
      },
      {
        rootMargin: "320px 0px",
      },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadingInitial, loadingMore, request, response]);

  useEffect(() => {
    if (!request) {
      return;
    }

    requestedOffsetsRef.current = new Set([0]);
    setResponse(null);
    setRequest((current) => (current ? { ...current, offset: 0 } : current));
  }, [scopeKey]);

  function handleExecute() {
    const normalizedQuery = query.trim();
    const hasStructuredInput = Boolean(seniority || minYears > 0 || location.trim() || selectedSkills.length || selectedCompanies.length);
    if (!normalizedQuery && !hasStructuredInput) {
      setError("Enter a title, skill, or filter to start searching.");
      return;
    }

    const explicitFilters: SearchFilters = {
      seniority,
      minYearsExperience: minYears,
      location,
      skills: selectedSkills,
      companies: selectedCompanies,
    };
    const normalizedFilters = deriveSearchFilters(normalizedQuery, explicitFilters);

    setSeniority(normalizedFilters.seniority ?? "");
    setMinYears(normalizedFilters.minYearsExperience ?? 0);
    setLocation(normalizedFilters.location ?? "");
    setSelectedSkills(normalizedFilters.skills ?? []);
    setSelectedCompanies(normalizedFilters.companies ?? []);

    setError(null);
    setResponse(null);
    requestedOffsetsRef.current = new Set([0]);
    setRequest({
      query: normalizedQuery,
      filters: normalizedFilters,
      offset: 0,
      limit: PAGE_SIZE,
    });
  }

  const activeFilterCount =
    (seniority ? 1 : 0) +
    (minYears > 0 ? 1 : 0) +
    (location.trim() ? 1 : 0) +
    selectedSkills.length +
    selectedCompanies.length;

  function handleClearFilters() {
    setSeniority("");
    setMinYears(0);
    setLocation("");
    setSelectedSkills([]);
    setSelectedCompanies([]);
  }

  const topCompareHref =
    response && sortedResults.length >= 2
      ? `/compare?ids=${sortedResults
          .slice(0, 2)
          .map((candidate) => candidate.candidateId)
          .join(",")}`
      : null;
  const topChatHref =
    response && sortedResults.length
      ? buildChatHref(
          sortedResults.slice(0, Math.min(3, sortedResults.length)).map((candidate) => candidate.candidateId),
          "Which candidate is the strongest overall fit and why?",
        )
      : null;
  const workspaceStatsPanel = loadingWorkspaceStats ? (
    <div className="stats-grid search-stats-grid" aria-busy="true" aria-label="Loading workspace statistics">
      {["cv-pool", "candidate-profiles", "workspace"].map((item) => (
        <Panel key={item} className="stat-card stat-card--loading">
          <div className="stat-card__header">
            <span className="stat-card__skeleton stat-card__skeleton--label" />
            <span className="stat-card__skeleton stat-card__skeleton--icon" />
          </div>
          <div className="stat-card__value-row">
            <span className="stat-card__skeleton stat-card__skeleton--value" />
            <span className="stat-card__skeleton stat-card__skeleton--delta" />
          </div>
        </Panel>
      ))}
    </div>
  ) : workspaceStats ? (
    <div className="stats-grid search-stats-grid">
      <StatCard
        label="CV Pool"
        value={workspaceStats.documentCount.toLocaleString()}
        delta="indexed documents"
        icon={<FileText size={16} />}
      />
      <StatCard
        label="Candidate Profiles"
        value={workspaceStats.candidateCount.toLocaleString()}
        delta="searchable"
        tone="secondary"
        icon={<Users size={16} />}
      />
      <StatCard
        label="Workspace"
        value={isAllScope ? "All workspaces" : currentWorkspace?.name ?? currentTenant?.name ?? "Demo Workspace"}
        delta={isAllScope ? `${workspaceOptions.length} workspaces` : currentWorkspace ? `${currentWorkspace.role} access` : "tenant-scoped pool"}
        tone="tertiary"
        icon={isAllScope ? <ShieldCheck size={16} /> : currentWorkspace ? <Building2 size={16} /> : <ShieldCheck size={16} />}
      />
    </div>
  ) : null;

  return (
    <div className="page-stack">
      <PageIntro
        eyebrow="Candidate search"
        title="Search candidates"
        actions={
          <div className="stack" style={{ alignItems: "flex-end" }}>
            <PlatformScopeControl
              isPlatformAdmin={isPlatformAdmin}
              scopeMode={scopeMode}
              onChangeScopeMode={setScopeMode}
              currentWorkspace={currentWorkspace}
              workspaceOptions={workspaceOptions}
              onChangeWorkspace={setWorkspaceId}
            />
          </div>
        }
      />

      {workspaceStatsPanel}

      <form
        className="search-console-form"
        onSubmit={(event) => {
          event.preventDefault();
          handleExecute();
        }}
      >
        <Panel className="search-command-panel">
          <div className="search-command-bar">
            <label className="search-field">
              <Sparkles size={18} />
              <input
                ref={queryInputRef}
                aria-label="Search candidates"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={defaultSearchQuery}
              />
            </label>
            <button className="button button--primary search-submit-button" type="submit" disabled={loadingInitial || loadingMore}>
              <Search size={16} />
              {loadingInitial ? "Searching..." : "Search"}
            </button>
          </div>

          <div className="search-filter-toolbar">
            <div className="search-filter-toolbar__title">
              <SlidersHorizontal size={16} />
              <strong>Filters</strong>
              <span>{activeFilterCount ? `${activeFilterCount} active` : "All candidates"}</span>
            </div>
            {activeFilterCount ? (
              <button className="button button--secondary button--compact" type="button" onClick={handleClearFilters}>
                <X size={14} />
                Clear
              </button>
            ) : null}
          </div>

          <div className="search-filters-grid">
            <label className="search-filter-field">
              <span>Seniority</span>
              <PickerDropdown
                value={seniority}
                options={filterOptions?.seniority ?? []}
                onChange={setSeniority}
                placeholder="Any seniority"
                emptyLabel="No seniority values available"
              />
            </label>

            <label className="search-filter-field">
              <span>Min years</span>
              <input className="form-input" type="number" value={minYears} min={0} onChange={(event) => setMinYears(Number(event.target.value))} />
            </label>

            <label className="search-filter-field">
              <span>Location</span>
              <PickerDropdown
                value={location}
                options={(filterOptions?.locations ?? []).map((option) => ({ value: option, label: option }))}
                onChange={setLocation}
                placeholder="Any location"
                emptyLabel="No indexed locations available"
              />
            </label>

            <label className="search-filter-field search-filter-field--wide">
              <span>Skills</span>
              <FilterMultiSelect
                options={filterOptions?.skills ?? []}
                values={selectedSkills}
                onChange={setSelectedSkills}
                placeholder="Any skill"
                searchPlaceholder="Search skills"
                normalizeInput={parseSkillText}
                emptyLabel="No skills match"
              />
            </label>

            <label className="search-filter-field search-filter-field--wide">
              <span>Companies</span>
              <FilterMultiSelect
                options={filterOptions?.companies ?? []}
                values={selectedCompanies}
                onChange={setSelectedCompanies}
                placeholder="Any company"
                searchPlaceholder="Search companies"
                emptyLabel="No companies match"
              />
            </label>
          </div>
        </Panel>
      </form>

      {!hasExecutedSearch ? null : loadingInitial && request ? (
        <SearchProcessingState request={request} />
      ) : error && !response?.results.length ? (
        <EmptyState title="Search failed" detail={error} />
      ) : !response?.results.length ? (
        <EmptyState
          title="No candidates found"
          detail="The search ran successfully, but there are no indexed candidates matching the current query and filters yet."
        />
      ) : (
        <>
          <Panel className="search-summary-bar">
            <div className="search-summary-bar__main">
              <strong>Loaded {response.results.length} candidates</strong>
              <p>
                Results append automatically as you scroll. Sort applies to the loaded result set without changing the active search frame.
              </p>
              {topChatHref || topCompareHref ? (
                <div className="search-summary-actions">
                  {topChatHref ? (
                    <Link className="button button--secondary" to={topChatHref}>
                      Ask Agent
                      <MessageSquareText size={16} />
                    </Link>
                  ) : null}
                  {topCompareHref ? (
                    <Link className="button button--primary" to={topCompareHref}>
                      Compare Top Matches
                      <ArrowRight size={16} />
                    </Link>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="search-summary-bar__controls">
              <label className="search-sort">
                <span>Sort by</span>
                <select className="form-select" value={sortBy} onChange={(event) => setSortBy(event.target.value as SearchSortOption)}>
                  <option value="best-match">Best match</option>
                  <option value="experience-desc">Most experience</option>
                  <option value="experience-asc">Least experience</option>
                  <option value="name-asc">Name A-Z</option>
                  <option value="name-desc">Name Z-A</option>
                </select>
              </label>
            </div>
          </Panel>

          <div className="candidate-results">
            {sortedResults.map((candidate) => {
              const partnerId = sortedResults.find((item) => item.candidateId !== candidate.candidateId)?.candidateId;

              return (
                <Panel key={candidate.candidateId} className="candidate-card">
                  <div className="candidate-card__header">
                    <div className="candidate-card__identity">
                      <Avatar name={candidate.name} hue={candidate.avatarHue} />
                      <div className="stack">
                        <h3>{candidate.name}</h3>
                        <p>{candidate.currentTitle}</p>
                        <div className="skill-list">
                          {isAllScope && candidate.tenantId ? <Tag>{workspaceNameById.get(candidate.tenantId) ?? "Workspace"}</Tag> : null}
                          <Tag>{candidate.seniority}</Tag>
                          <Tag>{candidate.primaryRole}</Tag>
                          <Tag tone="success">{candidate.stage}</Tag>
                        </div>
                      </div>
                    </div>
                    <ScorePill score={candidate.backendMatchRate} label="Match rate" />
                  </div>

                  <div className="meta-list">
                    <span className="tag">
                      <MapPin size={14} />
                      {candidate.location}
                    </span>
                    <span className="tag">
                      <BriefcaseBusiness size={14} />
                      {formatYearsExperience(candidate.yearsExperience)}
                    </span>
                  </div>

                  <div className="skill-list">
                    {candidate.topSkills.slice(0, 5).map((skill) => (
                      <Tag key={skill} tone="primary">
                        {skill}
                      </Tag>
                    ))}
                  </div>

                  <div className="skill-list">
                    <Link
                      className="button button--secondary"
                      to={`/dossier/${candidate.candidateId}`}
                      state={{
                        searchMatchScore: candidate.matchScore,
                        searchMatchSignals: candidate.matchSignals,
                        searchQuery: request?.query ?? query,
                      }}
                    >
                      View Dossier
                    </Link>
                    <Link
                      className="button button--secondary"
                      to={buildChatHref([candidate.candidateId], "Why is this candidate a strong fit?")}
                    >
                      Ask Agent
                    </Link>
                    {partnerId ? (
                      <Link className="button button--primary" to={`/compare?ids=${candidate.candidateId},${partnerId}`}>
                        Compare
                      </Link>
                    ) : null}
                  </div>
                </Panel>
              );
            })}
          </div>

          <div ref={loadMoreRef} className="infinite-scroll-sentinel">
            {error ? (
              <Panel className="infinite-scroll-panel">
                <strong>Could not load more results</strong>
                <p>{error}</p>
                {request && response.nextCursor !== null ? (
                  <button
                    className="button button--secondary"
                    type="button"
                    onClick={() => {
                      requestedOffsetsRef.current.add(response.nextCursor as number);
                      setRequest({
                        ...request,
                        offset: response.nextCursor as number,
                      });
                    }}
                  >
                    Retry
                  </button>
                ) : null}
              </Panel>
            ) : loadingMore ? (
              <Panel className="infinite-scroll-panel">
                <strong>Loading more candidates</strong>
                <p>Fetching the next ranked slice from the search index.</p>
              </Panel>
            ) : response.nextCursor !== null ? (
              <Panel className="infinite-scroll-panel">
                <strong>Keep scrolling</strong>
                <p>The next page will load automatically as this section enters the viewport.</p>
              </Panel>
            ) : (
              <Panel className="infinite-scroll-panel infinite-scroll-panel--complete">
                <div className="infinite-scroll-panel__badge">
                  <CheckCircle2 size={16} />
                  <span>Search complete</span>
                </div>
                <strong>{response.results.length} ranked candidates loaded</strong>
                <p>You’ve reached the end of this ranked result set. Broaden the search frame or adjust filters to surface more profiles.</p>
                <div className="infinite-scroll-panel__actions">
                  <button
                    className="button button--secondary"
                    type="button"
                    onClick={() => {
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  >
                    <ArrowUp size={14} />
                    Back to Top
                  </button>
                  <button
                    className="button button--secondary"
                    type="button"
                    onClick={() => {
                      window.scrollTo({ top: 0, behavior: "smooth" });
                      window.setTimeout(() => queryInputRef.current?.focus(), 180);
                    }}
                  >
                    Refine Search
                  </button>
                </div>
              </Panel>
            )}
          </div>
        </>
      )}
    </div>
  );
}
