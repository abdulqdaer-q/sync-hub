import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { createAuthedClient } from "../_shared/client.ts";
import { normalizeLocationValue, normalizeSkillList } from "../_shared/searchTaxonomy.ts";

const SEARCH_PAGE_SIZE = 1000;

type JsonRecord = Record<string, unknown>;

function describeError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  if (error && typeof error === "object") {
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error);
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? Array.from(new Set(value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean)))
    : [];
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function asNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function dedupeSorted(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right));
}

async function fetchAllSearchCacheRows(supabase: ReturnType<typeof createAuthedClient>, tenantIds: string[]) {
  const rows: Array<{
    seniority: string | null;
    skills: string[] | null;
    companies: string[] | null;
    location: string | null;
  }> = [];

  for (let offset = 0; ; offset += SEARCH_PAGE_SIZE) {
    let request = supabase
      .from("candidate_search_cache")
      .select("seniority, skills, companies, location")
      .range(offset, offset + SEARCH_PAGE_SIZE - 1);

    if (tenantIds.length) {
      request = request.in("tenant_id", tenantIds);
    }

    const { data, error } = await request;
    if (error) {
      throw error;
    }
    const page = data ?? [];
    rows.push(...page);
    if (page.length < SEARCH_PAGE_SIZE) {
      break;
    }
  }

  return rows;
}

async function getSearchFilterOptions(supabase: ReturnType<typeof createAuthedClient>, tenantIds: string[]) {
  const rows = await fetchAllSearchCacheRows(supabase, tenantIds);
  return {
    seniority: dedupeSorted(rows.map((row) => row.seniority ?? "").filter((value) => value && value !== "unclassified")),
    skills: dedupeSorted(normalizeSkillList(rows.flatMap((row) => row.skills ?? []))),
    companies: dedupeSorted(rows.flatMap((row) => row.companies ?? [])),
    locations: dedupeSorted(rows.map((row) => normalizeLocationValue(row.location)).filter((value): value is string => Boolean(value))),
  };
}

async function getWorkspaceStats(supabase: ReturnType<typeof createAuthedClient>, tenantIds: string[]) {
  const { data, error } = await supabase.rpc("workspace_stats_v1", {
    p_tenant_ids: tenantIds.length ? tenantIds : null,
  });
  if (error) {
    throw error;
  }
  return Array.isArray(data) ? data[0] ?? { document_count: 0, candidate_count: 0, company_count: 0 } : data;
}

async function getAuthContext(supabase: ReturnType<typeof createAuthedClient>) {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) {
    throw userError;
  }
  if (!user) {
    return { memberships: [], is_platform_admin: false };
  }

  const [membershipResult, platformAdminResult] = await Promise.all([
    supabase
      .from("tenant_memberships")
      .select("tenant_id, role, status")
      .eq("user_id", user.id)
      .eq("status", "active"),
    supabase
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  if (membershipResult.error) {
    throw membershipResult.error;
  }

  const platformAdminQueryFailed =
    platformAdminResult.error &&
    !/platform_admins/i.test(platformAdminResult.error.message) &&
    platformAdminResult.error.code !== "PGRST205";
  if (platformAdminQueryFailed) {
    throw platformAdminResult.error;
  }

  const membershipRows = membershipResult.data ?? [];
  const isPlatformAdmin = Boolean(platformAdminResult.data?.user_id);
  if (!membershipRows.length && !isPlatformAdmin) {
    return { memberships: [], is_platform_admin: false };
  }

  const tenantIds = membershipRows.map((membership) => membership.tenant_id).filter(Boolean);
  const tenantResult = isPlatformAdmin
    ? await supabase.from("tenants").select("id, slug, name, icon_url").order("name")
    : await supabase.from("tenants").select("id, slug, name, icon_url").in("id", tenantIds);

  if (tenantResult.error) {
    throw tenantResult.error;
  }

  const tenantRows = tenantResult.data ?? [];
  const tenantMap = new Map(tenantRows.map((tenant) => [tenant.id, tenant]));
  const memberships = membershipRows
    .map((membership) => {
      const tenant = tenantMap.get(membership.tenant_id);
      if (!tenant) {
        return null;
      }
      return {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        iconUrl: tenant.icon_url,
        role: membership.role,
        status: membership.status,
      };
    })
    .filter(Boolean);

  if (isPlatformAdmin) {
    memberships.push(
      ...tenantRows.map((tenant) => ({
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        iconUrl: tenant.icon_url,
        role: "platform-admin",
        status: "active",
      })),
    );
  }

  return {
    memberships,
    is_platform_admin: isPlatformAdmin,
  };
}

async function bootstrapTenant(supabase: ReturnType<typeof createAuthedClient>, body: JsonRecord) {
  const name = asString(body.name);
  const slug = asString(body.slug);
  if (!name || !slug) {
    throw new Error("name and slug are required");
  }
  const { error } = await supabase.rpc("bootstrap_tenant_v1", {
    p_name: name,
    p_slug: slug,
  });
  if (error) {
    throw error;
  }
  return { ok: true };
}

async function getCandidateDetail(supabase: ReturnType<typeof createAuthedClient>, candidateId: string) {
  const [dossier, chunks] = await Promise.all([
    supabase
      .from("candidate_dossier_v1")
      .select(
        "candidate_id, name, headline, current_title, location, years_experience, seniority, primary_role, top_skills, email, phone, links, summary_short, short_summary, long_summary, strengths, risks, recommended_roles, timeline_json, profile_json, original_filename, mime_type, storage_path, source_uri, confidence",
      )
      .eq("candidate_id", candidateId)
      .maybeSingle(),
    supabase
      .from("candidate_chunks")
      .select("id, chunk_type, text")
      .eq("candidate_id", candidateId)
      .eq("is_active", true)
      .order("chunk_index", { ascending: true })
      .limit(6),
  ]);

  if (dossier.error) {
    throw dossier.error;
  }
  if (!dossier.data) {
    throw new Error(`Candidate ${candidateId} was not found.`);
  }
  if (chunks.error) {
    throw chunks.error;
  }

  return {
    dossier: dossier.data,
    chunks: chunks.data ?? [],
  };
}

function asInteger(value: unknown, fallback: number, min: number, max: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

async function getParsingOverview(supabase: ReturnType<typeof createAuthedClient>, tenantIds: string[], body: JsonRecord) {
  const limit = asInteger(body.limit, 100, 0, 500);
  const offset = asInteger(body.offset, 0, 0, 100000);
  const needsReviewOnly = body.needs_review_only === true;
  const query = asString(body.query);
  const { data, error } = await supabase.rpc("parsing_overview_page_v1", {
    p_tenant_ids: tenantIds.length ? tenantIds : null,
    p_limit: limit,
    p_offset: offset,
    p_needs_review_only: needsReviewOnly,
    p_query: query,
  });
  if (error) {
    throw error;
  }
  return data;
}

async function getParsingDocument(supabase: ReturnType<typeof createAuthedClient>, documentId: string, tenantIds: string[]) {
  let documentQuery = supabase
    .from("source_documents")
    .select("id, tenant_id, candidate_id, source_type, original_filename, mime_type, source_uri, storage_path, created_at, updated_at")
    .eq("id", documentId);

  if (tenantIds.length) {
    documentQuery = documentQuery.in("tenant_id", tenantIds);
  }

  const documentResult = await documentQuery.maybeSingle();
  if (documentResult.error) {
    throw documentResult.error;
  }
  if (!documentResult.data) {
    return { documents: [], candidates: [], profiles: [], runs: [] };
  }

  const document = documentResult.data as JsonRecord;
  const [candidateResult, profileByDocumentResult, runsResult] = await Promise.all([
    document.candidate_id
      ? supabase
          .from("candidates")
          .select("id, tenant_id, name, headline, current_title, location, years_experience, seniority, primary_role, top_skills, email, phone, links, summary_short, status")
          .eq("id", document.candidate_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("candidate_profiles")
      .select("tenant_id, candidate_id, source_document_id, profile_json, timeline_json, skill_matrix_json, raw_text, confidence, missing_fields, parse_warnings, created_at, updated_at")
      .eq("source_document_id", documentId)
      .maybeSingle(),
    supabase
      .from("processing_runs")
      .select("tenant_id, source_document_id, status, parser_version, model_version, prompt_version, chunk_version, embedding_version, warnings, error_code, error_message, created_at, updated_at, metadata_json")
      .eq("source_document_id", documentId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  if (candidateResult.error) {
    throw candidateResult.error;
  }
  if (profileByDocumentResult.error) {
    throw profileByDocumentResult.error;
  }
  if (runsResult.error) {
    throw runsResult.error;
  }

  let profile = profileByDocumentResult.data;
  if (!profile && document.candidate_id) {
    const profileByCandidateResult = await supabase
      .from("candidate_profiles")
      .select("tenant_id, candidate_id, source_document_id, profile_json, timeline_json, skill_matrix_json, raw_text, confidence, missing_fields, parse_warnings, created_at, updated_at")
      .eq("candidate_id", document.candidate_id)
      .maybeSingle();
    if (profileByCandidateResult.error) {
      throw profileByCandidateResult.error;
    }
    profile = profileByCandidateResult.data;
  }

  return {
    documents: [document],
    candidates: candidateResult.data ? [candidateResult.data] : [],
    profiles: profile ? [profile] : [],
    runs: runsResult.data ?? [],
  };
}

const parserProfileSelect = [
  "id",
  "tenant_id",
  "name",
  "slug",
  "description",
  "status",
  "extraction_provider",
  "extraction_model",
  "parser_version",
  "model_version",
  "prompt_version",
  "chunk_version",
  "embedding_provider",
  "embedding_model",
  "embedding_version",
  "chunking_profile",
  "ocr_enabled",
  "allow_heuristic_fallback",
  "prompt_template",
  "notes",
  "last_evaluated_at",
  "avg_parse_percentage",
  "avg_confidence",
  "documents_evaluated",
  "created_at",
  "updated_at",
].join(", ");

async function getParserProfiles(supabase: ReturnType<typeof createAuthedClient>, tenantIds: string[]) {
  let query = supabase
    .from("parser_profiles")
    .select(parserProfileSelect)
    .order("status", { ascending: true })
    .order("updated_at", { ascending: false });

  if (tenantIds.length) {
    query = query.in("tenant_id", tenantIds);
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }
  return data ?? [];
}

async function saveParserProfile(supabase: ReturnType<typeof createAuthedClient>, body: JsonRecord) {
  const profile = (body.profile ?? {}) as JsonRecord;
  const tenantId = asString(body.tenant_id);
  if (!tenantId) {
    throw new Error("tenant_id is required");
  }

  const payload = {
    tenant_id: tenantId,
    name: asString(profile.name) ?? "Parser profile",
    slug: (asString(profile.slug) ?? "parser-profile").toLowerCase(),
    description: asString(profile.description) ?? "",
    extraction_provider: asString(profile.extractionProvider) ?? "gemini",
    extraction_model: asString(profile.extractionModel) ?? "gemini-2.5-flash",
    parser_version: asString(profile.parserVersion) ?? "pdftotext-raw-v2",
    model_version: asString(profile.modelVersion) ?? "v1",
    prompt_version: asString(profile.promptVersion) ?? "v1",
    chunk_version: asString(profile.chunkVersion) ?? "v1",
    embedding_provider: asString(profile.embeddingProvider) ?? "gemini",
    embedding_model: asString(profile.embeddingModel) ?? "gemini-embedding-001",
    embedding_version: asString(profile.embeddingVersion) ?? "gemini-embedding-001-768-v1",
    chunking_profile: asString(profile.chunkingProfile) ?? "default",
    ocr_enabled: Boolean(profile.ocrEnabled),
    allow_heuristic_fallback: false,
    prompt_template: asString(profile.promptTemplate) ?? "",
    notes: asString(profile.notes) ?? "",
  };

  const profileId = asString(profile.id);
  const mutation = profileId
    ? supabase.from("parser_profiles").update(payload).eq("id", profileId).select(parserProfileSelect).single()
    : supabase.from("parser_profiles").insert(payload).select(parserProfileSelect).single();

  const { data, error } = await mutation;
  if (error) {
    throw error;
  }
  return data;
}

async function publishParserProfile(supabase: ReturnType<typeof createAuthedClient>, profileId: string) {
  const { data, error } = await supabase.rpc("publish_parser_profile_v1", { p_profile_id: profileId });
  if (error) {
    throw error;
  }
  return data;
}

const shortlistSelect = [
  "user_id",
  "tenant_id",
  "candidate_id",
  "candidate_name",
  "current_title",
  "location",
  "years_experience",
  "seniority",
  "primary_role",
  "top_skills",
  "match_rate",
  "cv_url",
  "original_filename",
  "source_query",
  "search_snapshot",
  "notes",
  "created_at",
  "updated_at",
].join(", ");

async function getCurrentUserId(supabase: ReturnType<typeof createAuthedClient>) {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error) {
    throw error;
  }
  if (!user) {
    throw new Error("Authentication is required.");
  }
  return user.id;
}

async function getCandidateCvSource(supabase: ReturnType<typeof createAuthedClient>, tenantId: string, candidateId: string) {
  const { data, error } = await supabase
    .from("source_documents")
    .select("source_uri, original_filename")
    .eq("tenant_id", tenantId)
    .eq("candidate_id", candidateId)
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function getShortlistItems(supabase: ReturnType<typeof createAuthedClient>, tenantIds: string[]) {
  const userId = await getCurrentUserId(supabase);
  let query = supabase
    .from("candidate_shortlist_items")
    .select(shortlistSelect)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (tenantIds.length) {
    query = query.in("tenant_id", tenantIds);
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }
  return data ?? [];
}

async function saveShortlistItem(supabase: ReturnType<typeof createAuthedClient>, body: JsonRecord) {
  const userId = await getCurrentUserId(supabase);
  const item = asRecord(body.item);
  const tenantId = asString(item.tenant_id);
  const candidateId = asString(item.candidate_id);
  if (!tenantId || !candidateId) {
    throw new Error("tenant_id and candidate_id are required");
  }

  const matchRate = asNumber(item.match_rate);
  const yearsExperience = asNumber(item.years_experience);
  const cvSource = await getCandidateCvSource(supabase, tenantId, candidateId);
  const payload = {
    user_id: userId,
    tenant_id: tenantId,
    candidate_id: candidateId,
    candidate_name: asString(item.candidate_name) ?? "Unknown candidate",
    current_title: asString(item.current_title) ?? "Candidate",
    location: asString(item.location) ?? "Unknown",
    years_experience: yearsExperience,
    seniority: asString(item.seniority),
    primary_role: asString(item.primary_role),
    top_skills: asStringArray(item.top_skills).slice(0, 24),
    match_rate: matchRate === null ? null : Math.max(0, Math.min(100, Math.round(matchRate))),
    cv_url: asString(cvSource?.source_uri) ?? asString(item.cv_url),
    original_filename: asString(cvSource?.original_filename) ?? asString(item.original_filename),
    source_query: asString(item.source_query) ?? "",
    search_snapshot: asRecord(item.search_snapshot),
    notes: asString(item.notes) ?? "",
  };

  const { data, error } = await supabase
    .from("candidate_shortlist_items")
    .upsert(payload, { onConflict: "user_id,tenant_id,candidate_id" })
    .select(shortlistSelect)
    .single();
  if (error) {
    throw error;
  }
  return data;
}

async function deleteShortlistItem(supabase: ReturnType<typeof createAuthedClient>, body: JsonRecord) {
  const userId = await getCurrentUserId(supabase);
  const candidateId = asString(body.candidate_id);
  const tenantId = asString(body.tenant_id);
  if (!candidateId) {
    throw new Error("candidate_id is required");
  }

  let query = supabase
    .from("candidate_shortlist_items")
    .delete()
    .eq("user_id", userId)
    .eq("candidate_id", candidateId);

  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  }

  const { error } = await query;
  if (error) {
    throw error;
  }
  return { ok: true };
}

async function clearShortlistItems(supabase: ReturnType<typeof createAuthedClient>, tenantIds: string[]) {
  const userId = await getCurrentUserId(supabase);
  let query = supabase
    .from("candidate_shortlist_items")
    .delete()
    .eq("user_id", userId);

  if (tenantIds.length) {
    query = query.in("tenant_id", tenantIds);
  }

  const { error } = await query;
  if (error) {
    throw error;
  }
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "method_not_allowed" });
  }

  try {
    const body = await req.json() as JsonRecord;
    const action = asString(body.action);
    const tenantIds = asStringArray(body.tenant_ids);
    const supabase = createAuthedClient(req);

    switch (action) {
      case "auth_context":
        return jsonResponse(200, await getAuthContext(supabase));
      case "bootstrap_tenant":
        return jsonResponse(200, await bootstrapTenant(supabase, body));
      case "search_filter_options":
        return jsonResponse(200, await getSearchFilterOptions(supabase, tenantIds));
      case "workspace_stats":
        return jsonResponse(200, await getWorkspaceStats(supabase, tenantIds));
      case "candidate_detail":
        return jsonResponse(200, await getCandidateDetail(supabase, asString(body.candidate_id) ?? ""));
      case "parsing_overview":
        return jsonResponse(200, await getParsingOverview(supabase, tenantIds, body));
      case "parsing_document":
        return jsonResponse(200, await getParsingDocument(supabase, asString(body.document_id) ?? "", tenantIds));
      case "parser_profiles":
        return jsonResponse(200, await getParserProfiles(supabase, tenantIds));
      case "save_parser_profile":
        return jsonResponse(200, await saveParserProfile(supabase, body));
      case "publish_parser_profile":
        return jsonResponse(200, await publishParserProfile(supabase, asString(body.profile_id) ?? ""));
      case "shortlist_items":
        return jsonResponse(200, await getShortlistItems(supabase, tenantIds));
      case "save_shortlist_item":
        return jsonResponse(200, await saveShortlistItem(supabase, body));
      case "delete_shortlist_item":
        return jsonResponse(200, await deleteShortlistItem(supabase, body));
      case "clear_shortlist_items":
        return jsonResponse(200, await clearShortlistItems(supabase, tenantIds));
      default:
        return jsonResponse(400, { error: "unknown_action", details: action });
    }
  } catch (error) {
    return jsonResponse(500, { error: "unexpected_error", details: describeError(error) });
  }
});
