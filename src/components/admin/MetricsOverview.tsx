import { useState, type ReactNode } from "react";
import { Flag, HeartHandshake, MessageSquare, RefreshCw, ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { useAsync, usePolling } from "../../hooks/useAsync";
import { api, errorMessage } from "../../lib/api";
import { ALL_ROLES, ACCOUNT_STATUSES, ROLE_LABELS } from "../../lib/constants";
import { STATUS_LABELS } from "../../lib/format";
import { timeAgo } from "../../lib/format";
import { cn } from "../../lib/utils";
import { ErrorState, PageLoader } from "../shared/PageState";
import { Button } from "../ui/button";
import { BarList, ColumnChart, shortDate } from "./charts";

function StatTile({ label, value, icon, alert = false }: { label: string; value: number; icon: ReactNode; alert?: boolean }) {
  return (
    <div className={cn("rounded-2xl border bg-white p-4", alert ? "border-rose-200" : "border-slate-100")}>
      <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
        <span className={cn("[&_svg]:size-4", alert ? "text-rose-600" : "text-slate-400")}>{icon}</span>
        {label}
      </div>
      <p className="mt-2 text-3xl font-bold text-slate-900">{value.toLocaleString()}</p>
      {alert && <p className="mt-1 text-xs font-medium text-rose-700">Needs review</p>}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-100 bg-[#fcfcfb] p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-800">{title}</h3>
      {children}
    </section>
  );
}

export function MetricsOverview() {
  const metrics = useAsync(() => api.admin.metrics(), []);
  const [cleaning, setCleaning] = useState(false);
  usePolling(() => void metrics.reload({ silent: true }), 30_000);

  if (metrics.loading && !metrics.data) return <PageLoader label="Loading live metrics…" />;
  if (metrics.error || !metrics.data) {
    return <ErrorState error={metrics.error ?? new Error("No data")} onRetry={() => void metrics.reload()} />;
  }
  const m = metrics.data;

  const runCleanup = async () => {
    setCleaning(true);
    try {
      const result = await api.admin.runCleanup();
      toast.success(
        `Cleanup complete: ${result.terminatedConnectionIds.length} stale chat(s) closed, ${result.liftedSuspensionUserIds.length} suspension(s) lifted.`,
      );
      void metrics.reload({ silent: true });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setCleaning(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span>Updated {timeAgo(m.generatedAt)} · refreshes every 30 seconds</span>
        <Button variant="outline" size="sm" onClick={() => void runCleanup()} disabled={cleaning}>
          <RefreshCw className={cn(cleaning && "animate-spin")} /> Run inactivity cleanup now
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile label="Total users" value={m.totalUsers} icon={<Users />} />
        <StatTile label="Pending wali requests" value={m.pendingWaliRequests} icon={<ShieldCheck />} />
        <StatTile label="Active chaperoned chats" value={m.activeChaperonedChats} icon={<HeartHandshake />} />
        <StatTile label="Reported accounts" value={m.reportedAccounts} icon={<Flag />} alert={m.reportedAccounts > 0} />
        <StatTile label="Messages (24h)" value={m.messagesLast24h} icon={<MessageSquare />} />
      </div>

      <Panel title="New sign-ups · last 14 days">
        <ColumnChart
          valueLabel="Sign-ups"
          data={m.signupsLast14Days.map((d) => ({ label: shortDate(d.date), value: d.count }))}
        />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Users by role">
          <BarList valueLabel="Users" data={ALL_ROLES.map((role) => ({ label: ROLE_LABELS[role], value: m.usersByRole[role] }))} />
        </Panel>
        <Panel title="Connections by status">
          <BarList
            valueLabel="Connections"
            data={(Object.keys(STATUS_LABELS) as (keyof typeof STATUS_LABELS)[]).map((status) => ({
              label: STATUS_LABELS[status],
              value: m.connectionsByStatus[status],
            }))}
          />
        </Panel>
        <Panel title="Accounts by status">
          <BarList
            valueLabel="Accounts"
            data={ACCOUNT_STATUSES.map((status) => ({
              label: status.charAt(0) + status.slice(1).toLowerCase(),
              value: m.usersByStatus[status],
            }))}
          />
        </Panel>
      </div>
    </div>
  );
}
