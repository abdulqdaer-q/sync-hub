import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bell, CheckCircle2, Clock, RefreshCw, ShieldAlert } from "lucide-react";
import { EmptyState, PageIntro, Panel, StatCard, Tag } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import type { OpsAlert } from "@/lib/contracts";
import { platformApi } from "@/lib/platformApi";

const SEVERITY_ORDER: Record<OpsAlert["severity"], number> = {
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
};

function tagToneForSeverity(severity: OpsAlert["severity"]) {
  if (severity === "P0" || severity === "P1") {
    return "warning";
  }
  if (severity === "P2") {
    return "primary";
  }
  return "neutral";
}

function tagToneForStatus(status: OpsAlert["status"]) {
  if (status === "resolved") {
    return "success";
  }
  if (status === "acknowledged") {
    return "primary";
  }
  return "warning";
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatMetric(value: number | null, threshold: number | null) {
  if (value === null) {
    return "n/a";
  }
  const displayValue = Number.isInteger(value) ? value.toLocaleString() : value.toFixed(2);
  if (threshold === null) {
    return displayValue;
  }
  const displayThreshold = Number.isInteger(threshold) ? threshold.toLocaleString() : threshold.toFixed(2);
  return `${displayValue} / ${displayThreshold}`;
}

function contextPreview(context: Record<string, unknown>) {
  const entries = Object.entries(context).slice(0, 4);
  if (!entries.length) {
    return "No context";
  }
  return entries
    .map(([key, value]) => `${key}: ${typeof value === "string" || typeof value === "number" ? value : JSON.stringify(value)}`)
    .join(" | ");
}

export function OpsAlertsPage() {
  const { adminMemberships, enabled, isAdmin, loading } = useAuth();
  const [alerts, setAlerts] = useState<OpsAlert[]>([]);
  const [loadingAlerts, setLoadingAlerts] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acknowledging, setAcknowledging] = useState<string | null>(null);
  const [lastLoadedAt, setLastLoadedAt] = useState<string | null>(null);

  const adminTenantIds = useMemo(() => adminMemberships.map((membership) => membership.id), [adminMemberships]);
  const tenantNameById = useMemo(
    () => new Map(adminMemberships.map((membership) => [membership.id, membership.name])),
    [adminMemberships],
  );

  const loadAlerts = useCallback(() => {
    if (enabled && loading) {
      return;
    }
    if (enabled && !isAdmin) {
      return;
    }

    setLoadingAlerts(true);
    setError(null);
    platformApi
      .getOpsAlerts(adminTenantIds)
      .then((items) => {
        setAlerts(
          items
            .filter((alert) => alert.status !== "resolved")
            .sort((left, right) => SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity] || right.lastSeenAt.localeCompare(left.lastSeenAt)),
        );
        setLastLoadedAt(new Date().toISOString());
      })
      .catch((alertError) => {
        setError(alertError instanceof Error ? alertError.message : String(alertError));
      })
      .finally(() => setLoadingAlerts(false));
  }, [adminTenantIds, enabled, isAdmin, loading]);

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  const counts = useMemo(() => {
    return alerts.reduce(
      (memo, alert) => {
        memo.total += 1;
        memo[alert.severity] += 1;
        if (alert.status === "acknowledged") {
          memo.acknowledged += 1;
        }
        return memo;
      },
      { total: 0, P0: 0, P1: 0, P2: 0, P3: 0, acknowledged: 0 },
    );
  }, [alerts]);

  const activeAlert = alerts[0] ?? null;

  async function acknowledge(alert: OpsAlert) {
    setAcknowledging(alert.dedupeKey);
    try {
      const acknowledged = await platformApi.acknowledgeOpsAlert(alert.dedupeKey);
      setAlerts((current) =>
        current.map((item) =>
          item.dedupeKey === alert.dedupeKey
            ? acknowledged ?? { ...item, status: "acknowledged" }
            : item,
        ),
      );
    } finally {
      setAcknowledging(null);
    }
  }

  if (enabled && !loading && !isAdmin) {
    return (
      <div className="page-stack">
        <EmptyState title="Admin only" detail="Operations alerts are restricted to platform admins." />
      </div>
    );
  }

  return (
    <div className="page-stack">
      <PageIntro
        eyebrow="Operations"
        title="Alerts"
        description="Active Supabase health findings, deduped by component, tenant, and alert key."
        actions={
          <button className="button button--secondary" type="button" onClick={loadAlerts} disabled={loadingAlerts}>
            <RefreshCw size={16} />
            Refresh
          </button>
        }
      />

      <div className="stats-grid">
        <StatCard label="Active alerts" value={counts.total.toLocaleString()} delta={lastLoadedAt ? `loaded ${formatDateTime(lastLoadedAt)}` : "pending"} icon={<Bell size={16} />} />
        <StatCard label="P0 / P1" value={`${counts.P0 + counts.P1}`} delta="page-worthy" tone="secondary" icon={<ShieldAlert size={16} />} />
        <StatCard label="P2 / P3" value={`${counts.P2 + counts.P3}`} delta="monitor" tone="tertiary" icon={<AlertTriangle size={16} />} />
        <StatCard label="Acknowledged" value={counts.acknowledged.toLocaleString()} delta="still active" icon={<CheckCircle2 size={16} />} />
      </div>

      {error ? <EmptyState title="Unable to load alerts" detail={error} /> : null}

      <div className="admin-grid">
        <Panel className="table-card">
          <div className="parsing-table-controls">
            <div>
              <h3>Active findings</h3>
              <p>{loadingAlerts ? "Loading current alert state." : `${alerts.length} open alert${alerts.length === 1 ? "" : "s"}.`}</p>
            </div>
            <Tag tone={counts.P0 || counts.P1 ? "warning" : counts.total ? "primary" : "success"}>
              {counts.P0 || counts.P1 ? "response needed" : counts.total ? "watching" : "clear"}
            </Tag>
          </div>

          {loadingAlerts ? (
            <div className="logs" aria-busy="true">
              <div className="log-line">
                <span className="log-line__level">load</span>
                <span>--:--:--</span>
                <span>Fetching active alert snapshot</span>
              </div>
            </div>
          ) : alerts.length ? (
            <div className="parsing-table ops-alerts-table">
              <table>
                <thead>
                  <tr>
                    <th>Alert</th>
                    <th>Component</th>
                    <th>Metric</th>
                    <th>Last seen</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {alerts.map((alert) => (
                    <tr key={alert.dedupeKey}>
                      <td>
                        <div className="parsing-table__file">
                          <strong>{alert.message}</strong>
                          <span>{tenantNameById.get(alert.tenantId ?? "") ?? alert.tenantId ?? "global"}</span>
                        </div>
                      </td>
                      <td>
                        <div className="parsing-table__candidate">
                          <strong>{alert.component}</strong>
                          <span>{alert.alertKey}</span>
                        </div>
                      </td>
                      <td>
                        <div className="parsing-table__score">
                          <strong>{formatMetric(alert.currentValue, alert.threshold)}</strong>
                          <span>current / threshold</span>
                        </div>
                      </td>
                      <td>
                        <div className="parsing-table__score">
                          <strong>{formatDateTime(alert.lastSeenAt)}</strong>
                          <span>first {formatDateTime(alert.firstSeenAt)}</span>
                        </div>
                      </td>
                      <td>
                        <div className="skill-list">
                          <Tag tone={tagToneForSeverity(alert.severity)}>{alert.severity}</Tag>
                          <Tag tone={tagToneForStatus(alert.status)}>{alert.status}</Tag>
                        </div>
                      </td>
                      <td className="parsing-table__actions">
                        <button
                          className="button button--secondary"
                          type="button"
                          disabled={alert.status !== "firing" || acknowledging === alert.dedupeKey}
                          onClick={() => void acknowledge(alert)}
                        >
                          <CheckCircle2 size={16} />
                          Ack
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="parsing-operator-note">
              <div className="skill-list">
                <CheckCircle2 size={16} />
                <strong>No active alerts</strong>
              </div>
              <p>Supabase health checks are clear for the current admin scope.</p>
            </div>
          )}
        </Panel>

        <Panel className="table-card">
          <div className="stack">
            <div className="skill-list">
              <Clock size={16} />
              <h3>Current context</h3>
            </div>
            {activeAlert ? (
              <>
                <div className="evidence-card">
                  <div className="signal-row">
                    <strong>{activeAlert.severity}</strong>
                    <span>{activeAlert.status}</span>
                  </div>
                  <p>{activeAlert.message}</p>
                </div>
                <div className="logs">
                  <div className="log-line">
                    <span className="log-line__level">key</span>
                    <span>{activeAlert.alertKey}</span>
                  </div>
                  <div className="log-line">
                    <span className="log-line__level">scope</span>
                    <span>{tenantNameById.get(activeAlert.tenantId ?? "") ?? activeAlert.tenantId ?? "global"}</span>
                  </div>
                  <div className="log-line">
                    <span className="log-line__level">ctx</span>
                    <span>{contextPreview(activeAlert.context)}</span>
                  </div>
                </div>
              </>
            ) : (
              <div className="evidence-card">
                <div className="skill-list">
                  <CheckCircle2 size={16} />
                  <strong>Clear</strong>
                </div>
                <p>No active findings in the current admin workspace scope.</p>
              </div>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}
