import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Radio } from "lucide-react";
import { format } from "date-fns";
import { useAsync, usePolling } from "../../hooks/useAsync";
import { api } from "../../lib/api";
import { AUDIT_ACTIONS, oneOf, type AuditAction } from "../../lib/constants";
import type { AuditLogView } from "../../lib/contracts";
import { cn } from "../../lib/utils";
import { ErrorState, PageLoader } from "../shared/PageState";
import { Button } from "../ui/button";
import { NativeSelect } from "../ui/native-select";

const PAGE_SIZE = 50;

function actionTone(action: string): string {
  if (/BANNED|SUSPENDED|PHOTO_REMOVED|ROLE_RESET|REPORT_CREATED/.test(action)) return "border-rose-200 bg-rose-50 text-rose-700";
  if (/TERMINATED|REJECTED|WITHDRAWN|UNLINKED/.test(action)) return "border-amber-200 bg-amber-50 text-amber-800";
  if (/APPROVED|ACCEPTED|REINSTATED|LINKED|COMPLETED|EXPIRED/.test(action)) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.length === 0 ? "none" : value.map((v) => formatValue(v)).join(", ");
  return JSON.stringify(value);
}

function Party({ party }: { party: AuditLogView["actor"] }) {
  if (!party) return <span className="text-slate-400 italic">System</span>;
  return (
    <span>
      <span className="font-medium text-slate-800">{party.displayName}</span>
      <span className="block text-[11px] text-slate-400">{party.email}</span>
    </span>
  );
}

export function AuditTrail() {
  const [action, setAction] = useState<AuditAction | null>(null);
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [action]);

  const logs = useAsync(() => api.admin.auditLogs({ page, pageSize: PAGE_SIZE, action: action ?? undefined }), [page, action]);
  const live = page === 1;
  usePolling(() => void logs.reload({ silent: true }), 10_000, live);

  const totalPages = logs.data ? Math.max(1, Math.ceil(logs.data.total / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <NativeSelect
          className="sm:w-72"
          value={action ?? ""}
          onChange={(e) => setAction(oneOf(AUDIT_ACTIONS, e.target.value))}
          aria-label="Filter by action"
        >
          <option value="">All actions</option>
          {AUDIT_ACTIONS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </NativeSelect>
        <span className={cn("flex items-center gap-1.5 text-xs", live ? "text-emerald-700" : "text-slate-400")}>
          <Radio className={cn("size-3.5", live && "animate-pulse")} />
          {live ? "Live — refreshes every 10 seconds" : "Paused while browsing older pages"}
        </span>
      </div>

      {logs.loading && !logs.data ? (
        <PageLoader label="Loading audit trail…" />
      ) : logs.error || !logs.data ? (
        <ErrorState error={logs.error ?? new Error("No data")} onRetry={() => void logs.reload()} />
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">When</th>
                  <th className="px-3 py-2 font-medium">Action</th>
                  <th className="px-3 py-2 font-medium">Actor</th>
                  <th className="px-3 py-2 font-medium">Target</th>
                  <th className="px-3 py-2 font-medium">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 align-top">
                {logs.data.items.map((log) => (
                  <tr key={log.id}>
                    <td className="px-3 py-2.5 text-xs whitespace-nowrap text-slate-500 tabular-nums">
                      {format(new Date(log.createdAt), "d MMM yyyy, HH:mm:ss")}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold", actionTone(log.action))}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <Party party={log.actor} />
                    </td>
                    <td className="px-3 py-2.5">
                      <Party party={log.target} />
                    </td>
                    <td className="max-w-md px-3 py-2.5 text-xs text-slate-600">
                      {Object.entries(log.metadata).length === 0 ? (
                        <span className="text-slate-400">—</span>
                      ) : (
                        <dl className="space-y-0.5">
                          {Object.entries(log.metadata).map(([key, value]) => (
                            <div key={key} className="flex gap-1.5">
                              <dt className="shrink-0 text-slate-400">{key}:</dt>
                              <dd className="break-all">{formatValue(value)}</dd>
                            </div>
                          ))}
                        </dl>
                      )}
                    </td>
                  </tr>
                ))}
                {logs.data.items.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-10 text-center text-slate-500">
                      No audit events recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between text-sm text-slate-500">
            <span>
              {logs.data.total.toLocaleString()} events · page {page} of {totalPages}
            </span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft /> Newer
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Older <ChevronRight />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
