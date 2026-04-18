import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { createAuthedClient } from "../_shared/client.ts";
import { generateStructuredObject } from "../_shared/llm.ts";
import { buildQueryEmbedding } from "../_shared/queryEmbedding.ts";
import { buildSearchIntentConfig, resolveSearchFilters, type SearchIntentPayload } from "../_shared/searchIntent.ts";
import { normalizeSeniorityValue, normalizeSkillList } from "../_shared/searchTaxonomy.ts";

function asString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return null;
}

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean)
    : [];
}

function normalizeExplicitFilters(filters: Record<string, unknown>) {
  const minYearsRaw = asNumber(filters.min_years_experience);

  return {
    role: asString(filters.role),
    seniority: normalizeSeniorityValue(asString(filters.seniority)) ?? null,
    min_years_experience: minYearsRaw !== null && minYearsRaw > 0 ? minYearsRaw : null,
    location: asString(filters.location),
    skills: normalizeSkillList(asStringArray(filters.skills)),
  };
}

async function extractIntentWithLlm(query: string, filters: Record<string, unknown>): Promise<SearchIntentPayload | null> {
  const result = await generateStructuredObject<SearchIntentPayload>(buildSearchIntentConfig(query, filters));

  return result?.object ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "method_not_allowed" });
  }

  try {
    const body = await req.json();
    const supabase = createAuthedClient(req);
    const query = String(body.q ?? "");
    const tenantIds = asStringArray(body.tenant_ids);
    const requestFilters = normalizeExplicitFilters((body.filters ?? {}) as Record<string, unknown>);
    let intentSource = "rule_based";
    let llmIntent: SearchIntentPayload | null = null;

    try {
      llmIntent = await extractIntentWithLlm(query, requestFilters);
      if (llmIntent) {
        intentSource = "llm";
      }
    } catch {
      llmIntent = null;
    }

    const filters = resolveSearchFilters(query, {
      role: requestFilters.role ?? null,
      seniority: requestFilters.seniority ?? null,
      min_years_experience: requestFilters.min_years_experience ?? null,
      location: requestFilters.location ?? null,
      skills: requestFilters.skills,
    }, llmIntent);
    const queryEmbeddingPayload = Array.isArray(body.query_embedding)
      ? {
          embedding: body.query_embedding,
          embeddingVersion: typeof body.embedding_version === "string" ? body.embedding_version : null,
          provider: "client",
        }
      : await buildQueryEmbedding(query);

    const { data, error } = await supabase.rpc("search_candidates_v1", {
      p_q: query,
      p_query_embedding: queryEmbeddingPayload.embedding,
      p_limit: body.limit ?? 20,
      p_offset: body.offset ?? 0,
      p_role: filters.role ?? null,
      p_seniority: filters.seniority ?? null,
      p_min_years: filters.min_years_experience ?? null,
      p_skills: filters.skills ?? [],
      p_embedding_version: queryEmbeddingPayload.embeddingVersion,
      p_rank_version: body.rank_version ?? "v1",
      p_tenant_ids: tenantIds.length ? tenantIds : null,
      p_filter_role: requestFilters.role ?? null,
      p_filter_seniority: requestFilters.seniority ?? null,
      p_filter_min_years: requestFilters.min_years_experience ?? null,
      p_filter_skills: requestFilters.skills ?? [],
      p_filter_location: requestFilters.location ?? null,
    });

    if (error) {
      return jsonResponse(400, { error: "search_failed", details: error.message });
    }

    return jsonResponse(200, {
      results: data ?? [],
      next_cursor: (data ?? []).length < (body.limit ?? 20) ? null : (body.offset ?? 0) + (body.limit ?? 20),
      meta: {
        count: (data ?? []).length,
        rank_version: body.rank_version ?? "v1",
        intent_source: intentSource,
        intent: filters,
        explicit_filters: requestFilters,
        tenant_ids: tenantIds,
        embedding_provider: queryEmbeddingPayload.provider,
        embedding_version: queryEmbeddingPayload.embeddingVersion,
      },
    });
  } catch (error) {
    return jsonResponse(500, { error: "unexpected_error", details: `${error}` });
  }
});
