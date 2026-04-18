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
    const limit = typeof body.limit === "number" ? body.limit : 20;
    const offset = typeof body.offset === "number" ? body.offset : 0;

    let intentSource: "llm" | "rule_based" = "rule_based";
    let llmIntent: SearchIntentPayload | null = null;

    try {
      llmIntent = await extractIntentWithLlm(query, requestFilters);
      if (llmIntent) {
        intentSource = "llm";
      }
    } catch {
      llmIntent = null;
    }

    const resolvedIntent = resolveSearchFilters(query, {
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

    const rpcPayload = {
      p_q: query,
      p_query_embedding: queryEmbeddingPayload.embedding,
      p_limit: limit,
      p_offset: offset,
      p_role: resolvedIntent.role ?? null,
      p_seniority: resolvedIntent.seniority ?? null,
      p_min_years: resolvedIntent.min_years_experience ?? null,
      p_skills: resolvedIntent.skills ?? [],
      p_embedding_version: queryEmbeddingPayload.embeddingVersion,
      p_rank_version: body.rank_version ?? "v1",
      p_tenant_ids: tenantIds.length ? tenantIds : null,
      p_filter_role: requestFilters.role ?? null,
      p_filter_seniority: requestFilters.seniority ?? null,
      p_filter_min_years: requestFilters.min_years_experience ?? null,
      p_filter_skills: requestFilters.skills ?? [],
      p_filter_location: requestFilters.location ?? null,
    };

    const { data, error } = await supabase.rpc("search_candidates_v1", rpcPayload);

    if (error) {
      return jsonResponse(400, { error: "search_debug_failed", details: error.message });
    }

    const strictFilters = Object.entries(requestFilters)
      .filter(([, value]) => Array.isArray(value) ? value.length > 0 : value !== null && value !== "")
      .map(([key]) => key);

    const response = {
      request: {
        query,
        limit,
        offset,
        tenant_ids: tenantIds,
        explicit_filters: requestFilters,
      },
      analysis: {
        intent_source: intentSource,
        llm_intent: llmIntent,
        resolved_intent: resolvedIntent,
        embedding: {
          provider: queryEmbeddingPayload.provider,
          version: queryEmbeddingPayload.embeddingVersion,
          dimensions: Array.isArray(queryEmbeddingPayload.embedding) ? queryEmbeddingPayload.embedding.length : 0,
          preview: Array.isArray(queryEmbeddingPayload.embedding) ? queryEmbeddingPayload.embedding.slice(0, 12) : [],
        },
        rpc_payload: {
          ...rpcPayload,
          p_query_embedding: undefined,
          p_query_embedding_dimensions: Array.isArray(queryEmbeddingPayload.embedding) ? queryEmbeddingPayload.embedding.length : 0,
          p_query_embedding_preview: Array.isArray(queryEmbeddingPayload.embedding) ? queryEmbeddingPayload.embedding.slice(0, 12) : [],
        },
        uses_lexical: query.trim().length > 0,
        uses_semantic: Boolean(queryEmbeddingPayload.embedding),
        uses_name_boost: query.trim().length > 0,
        strict_filters: strictFilters,
      },
      results: data ?? [],
      next_cursor: (data ?? []).length < limit ? null : offset + limit,
      meta: {
        count: (data ?? []).length,
        rank_version: body.rank_version ?? "v1",
        source: "remote",
      },
    };

    return jsonResponse(200, {
      ...response,
      raw_response: response,
    });
  } catch (error) {
    return jsonResponse(500, { error: "unexpected_error", details: `${error}` });
  }
});
