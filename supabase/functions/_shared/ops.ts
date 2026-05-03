type SupabaseClientLike = {
  from: (table: string) => any;
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

export function createTraceId() {
  return crypto.randomUUID();
}

export function withTraceHeader(response: Response, traceId: string) {
  response.headers.set("x-trace-id", traceId);
  return response;
}

async function resolveTelemetryTenant(supabase: SupabaseClientLike, tenantIds: string[]) {
  const explicitTenant = tenantIds.find((tenantId) => tenantId.trim().length > 0);
  if (explicitTenant) {
    return explicitTenant;
  }

  const memberships = await supabase
    .from("tenant_memberships")
    .select("tenant_id")
    .eq("status", "active")
    .limit(1);
  const membershipTenant = memberships.data?.[0]?.tenant_id;
  if (!memberships.error && typeof membershipTenant === "string") {
    return membershipTenant;
  }

  const tenants = await supabase
    .from("tenants")
    .select("id")
    .limit(1);
  const tenantId = tenants.data?.[0]?.id;
  return !tenants.error && typeof tenantId === "string" ? tenantId : null;
}

export async function recordEdgeRequest(
  supabase: SupabaseClientLike,
  options: {
    component: string;
    tenantIds?: string[];
    traceId: string;
    startedAt: number;
    statusCode: number;
    payload?: Record<string, unknown>;
  },
) {
  try {
    const tenantId = await resolveTelemetryTenant(supabase, options.tenantIds ?? []);
    if (!tenantId) {
      return;
    }

    await supabase.rpc("record_ops_event_v1", {
      p_tenant_id: tenantId,
      p_event_name: `edge.${options.component}.request`,
      p_trace_id: options.traceId,
      p_payload: {
        status_code: options.statusCode,
        duration_ms: Math.round(performance.now() - options.startedAt),
        ok: options.statusCode < 400,
        ...options.payload,
      },
    });
  } catch {
    // Telemetry must never make the user-facing request fail.
  }
}
