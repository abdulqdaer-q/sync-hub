import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { transform } from "esbuild";
import { createClient } from "@supabase/supabase-js";

const require = createRequire(import.meta.url);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.resolve(scriptDir, "..");
const repoDir = path.resolve(frontendDir, "..");

const SELECTS = {
  documents:
    "id, tenant_id, candidate_id, source_type, original_filename, mime_type, source_uri, storage_path, created_at, updated_at",
  candidates:
    "id, tenant_id, name, headline, current_title, location, years_experience, seniority, primary_role, top_skills, email, phone, links, summary_short, status",
  profiles:
    "tenant_id, candidate_id, source_document_id, profile_json, timeline_json, skill_matrix_json, raw_text, confidence, missing_fields, parse_warnings, created_at, updated_at",
  runs:
    "tenant_id, source_document_id, status, parser_version, model_version, prompt_version, chunk_version, embedding_version, warnings, error_code, error_message, created_at, updated_at, metadata_json",
};

function parseArgs(argv) {
  const options = {
    mode: "frontend",
    tenantIds: [],
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--mode") {
      options.mode = argv[index + 1] ?? options.mode;
      index += 1;
      continue;
    }
    if (arg.startsWith("--mode=")) {
      options.mode = arg.slice("--mode=".length);
      continue;
    }
    if (arg === "--tenant" || arg === "--tenant-id") {
      options.tenantIds.push(...splitTenantIds(argv[index + 1] ?? ""));
      index += 1;
      continue;
    }
    if (arg.startsWith("--tenant=")) {
      options.tenantIds.push(...splitTenantIds(arg.slice("--tenant=".length)));
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!["frontend", "all"].includes(options.mode)) {
    throw new Error(`Invalid --mode "${options.mode}". Use "frontend" or "all".`);
  }

  options.tenantIds = Array.from(new Set(options.tenantIds));
  return options;
}

function splitTenantIds(value) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function printHelp() {
  console.log(`Usage: npm run check:parsing-overview -- [options]

Checks parsing overview cards using the same buildParsingOverview() logic as the frontend.

Options:
  --mode frontend   Use the same non-paginated table fetch shape as the frontend fallback. Default.
  --mode all        Page through all accessible rows, then run the same frontend scoring logic.
  --tenant <uuid>   Restrict to one tenant. Repeat or comma-separate for multiple tenants.
  --json            Print machine-readable JSON.
  --help            Show this help.
`);
}

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const values = {};
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separator = line.indexOf("=");
    if (separator === -1) {
      continue;
    }

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    value = value.replace(/^(['"])(.*)\1$/, "$2");
    values[key] = value;
  }
  return values;
}

function loadEnv() {
  return {
    ...readEnvFile(path.join(repoDir, ".env.local")),
    ...readEnvFile(path.join(frontendDir, ".env.local")),
    ...process.env,
  };
}

function isPlaceholder(value) {
  return !value || value.includes("your-project") || value.startsWith("your-");
}

function getSupabaseConfig() {
  const env = loadEnv();
  const url = !isPlaceholder(env.SUPABASE_URL) ? env.SUPABASE_URL : env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;

  if (isPlaceholder(url)) {
    throw new Error("Missing Supabase URL. Set SUPABASE_URL or VITE_SUPABASE_URL.");
  }
  if (isPlaceholder(key)) {
    throw new Error("Missing Supabase key. Set SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, or VITE_SUPABASE_ANON_KEY.");
  }

  return { url, key };
}

async function loadFrontendOverviewBuilder() {
  const sourcePath = path.join(frontendDir, "src/lib/parsingQuality.ts");
  const source = fs.readFileSync(sourcePath, "utf8");
  const transformed = await transform(source, {
    loader: "ts",
    format: "cjs",
    target: "node16",
  });

  const module = { exports: {} };
  const evaluate = new Function("module", "exports", "require", transformed.code);
  evaluate(module, module.exports, require);
  return module.exports.buildParsingOverview;
}

function applyTenantFilter(query, tenantIds) {
  return tenantIds.length ? query.in("tenant_id", tenantIds) : query;
}

async function unwrap(result, label) {
  const { data, error } = await result;
  if (error) {
    throw new Error(`${label} fetch failed: ${error.message}`);
  }
  return data ?? [];
}

async function fetchFrontendLikeSnapshot(supabase, tenantIds) {
  const documentsQuery = applyTenantFilter(
    supabase
      .from("source_documents")
      .select(SELECTS.documents)
      .order("created_at", { ascending: false })
      .limit(10000),
    tenantIds,
  );
  const candidatesQuery = applyTenantFilter(supabase.from("candidates").select(SELECTS.candidates).limit(10000), tenantIds);
  const profilesQuery = applyTenantFilter(supabase.from("candidate_profiles").select(SELECTS.profiles).limit(10000), tenantIds);
  const runsQuery = applyTenantFilter(
    supabase
      .from("processing_runs")
      .select(SELECTS.runs)
      .order("created_at", { ascending: false })
      .limit(20000),
    tenantIds,
  );

  const [documents, candidates, profiles, runs] = await Promise.all([
    unwrap(documentsQuery, "source_documents"),
    unwrap(candidatesQuery, "candidates"),
    unwrap(profilesQuery, "candidate_profiles"),
    unwrap(runsQuery, "processing_runs"),
  ]);

  return { documents, candidates, profiles, runs };
}

async function fetchPagedRows(supabase, table, select, tenantIds, order) {
  const pageSize = 1000;
  const rows = [];

  for (let from = 0; ; from += pageSize) {
    let query = supabase.from(table).select(select).range(from, from + pageSize - 1);
    query = applyTenantFilter(query, tenantIds);
    if (order) {
      query = query.order(order.column, { ascending: order.ascending });
    }

    const page = await unwrap(query, table);
    rows.push(...page);
    if (page.length < pageSize) {
      return rows;
    }
  }
}

async function fetchAllRowsSnapshot(supabase, tenantIds) {
  const [documents, candidates, profiles, runs] = await Promise.all([
    fetchPagedRows(supabase, "source_documents", SELECTS.documents, tenantIds, { column: "created_at", ascending: false }),
    fetchPagedRows(supabase, "candidates", SELECTS.candidates, tenantIds),
    fetchPagedRows(supabase, "candidate_profiles", SELECTS.profiles, tenantIds),
    fetchPagedRows(supabase, "processing_runs", SELECTS.runs, tenantIds, { column: "created_at", ascending: false }),
  ]);

  return { documents, candidates, profiles, runs };
}

function summarize(overview, snapshot, mode, tenantIds) {
  const reasonBreakdown = overview.items.reduce(
    (summary, item) => {
      const lowParse = item.parsedPercentage < 75;
      const lowConfidence = item.extractionConfidence < 65;
      const failed = item.status === "failed" || item.status === "partial_failed";

      if (lowParse) {
        summary.lowParse += 1;
      }
      if (lowConfidence) {
        summary.lowConfidence += 1;
      }
      if (failed) {
        summary.failedStatus += 1;
      }
      if (lowParse && lowConfidence) {
        summary.lowParseAndLowConfidence += 1;
      }
      if (lowParse && !lowConfidence && !failed) {
        summary.lowParseOnly += 1;
      }
      if (lowConfidence && !lowParse && !failed) {
        summary.lowConfidenceOnly += 1;
      }
      return summary;
    },
    {
      lowParse: 0,
      lowConfidence: 0,
      failedStatus: 0,
      lowParseAndLowConfidence: 0,
      lowParseOnly: 0,
      lowConfidenceOnly: 0,
    },
  );

  const qualityBands = overview.items.reduce(
    (summary, item) => {
      summary[item.qualityBand] = (summary[item.qualityBand] ?? 0) + 1;
      return summary;
    },
    { healthy: 0, review: 0, critical: 0 },
  );

  const rowCounts = {
    documents: snapshot.documents.length,
    candidates: snapshot.candidates.length,
    profiles: snapshot.profiles.length,
    runs: snapshot.runs.length,
  };

  return {
    mode,
    tenantIds,
    rowCounts,
    cards: {
      corpusParseCoverage: overview.overallParsedPercentage,
      averageConfidence: overview.averageConfidence,
      documentsCount: overview.documentsCount,
      completedCount: overview.completedCount,
      needsReviewCount: overview.needsReviewCount,
      failedCount: overview.failedCount,
    },
    reasonBreakdown,
    qualityBands,
  };
}

function printHuman(summary) {
  console.log("Parsing overview check");
  console.log(`Mode: ${summary.mode}`);
  console.log(`Tenant filter: ${summary.tenantIds.length ? summary.tenantIds.join(", ") : "none"}`);
  console.log(
    `Rows fetched: ${summary.rowCounts.documents} documents, ${summary.rowCounts.candidates} candidates, ${summary.rowCounts.profiles} profiles, ${summary.rowCounts.runs} runs`,
  );
  console.log("");
  console.log(`Corpus parse coverage: ${summary.cards.corpusParseCoverage}%`);
  console.log(`Average confidence: ${summary.cards.averageConfidence}%`);
  console.log(`Needs review: ${summary.cards.needsReviewCount}`);
  console.log(`Failed docs: ${summary.cards.failedCount}`);
  console.log("");
  console.log("Needs review reasons");
  console.log(`Parsed percentage < 75: ${summary.reasonBreakdown.lowParse}`);
  console.log(`Extraction confidence < 65: ${summary.reasonBreakdown.lowConfidence}`);
  console.log(`Failed or partial_failed status: ${summary.reasonBreakdown.failedStatus}`);
  console.log(`Low parse and low confidence overlap: ${summary.reasonBreakdown.lowParseAndLowConfidence}`);
  console.log("");
  console.log("Quality bands");
  console.log(`Healthy: ${summary.qualityBands.healthy}`);
  console.log(`Review: ${summary.qualityBands.review}`);
  console.log(`Critical: ${summary.qualityBands.critical}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const { url, key } = getSupabaseConfig();
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const buildParsingOverview = await loadFrontendOverviewBuilder();
  const snapshot =
    options.mode === "all"
      ? await fetchAllRowsSnapshot(supabase, options.tenantIds)
      : await fetchFrontendLikeSnapshot(supabase, options.tenantIds);
  const overview = buildParsingOverview(snapshot.documents, snapshot.candidates, snapshot.profiles, snapshot.runs);
  const summary = summarize(overview, snapshot, options.mode, options.tenantIds);

  if (options.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  printHuman(summary);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
