import { useState } from "react";
import { AlertTriangle, CheckCircle2, Flag } from "lucide-react";
import { toast } from "sonner";
import { useAsync, usePolling } from "../../hooks/useAsync";
import { api, errorMessage } from "../../lib/api";
import type { AdminUserRow, ReportRow } from "../../lib/contracts";
import { timeAgo } from "../../lib/format";
import { ConfirmDialog } from "../shared/ConfirmDialog";
import { EmptyState, ErrorState, PageLoader } from "../shared/PageState";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { AccountActionDialog } from "./AccountActionDialog";
import { AccountStatusBadge } from "./UserDirectory";

export function ModerationQueue() {
  const queue = useAsync(() => api.admin.moderation(), []);
  usePolling(() => void queue.reload({ silent: true }), 30_000);
  const [managing, setManaging] = useState<AdminUserRow | null>(null);
  const [resolving, setResolving] = useState<ReportRow | null>(null);
  const [note, setNote] = useState("");

  if (queue.loading && !queue.data) return <PageLoader label="Loading moderation queue…" />;
  if (queue.error || !queue.data) return <ErrorState error={queue.error ?? new Error("No data")} onRetry={() => void queue.reload()} />;
  const { reports, flagged } = queue.data;

  const openManage = async (userId: string, email: string) => {
    try {
      const page = await api.admin.users({ q: email, pageSize: 10 });
      const row = page.items.find((u) => u.id === userId);
      if (row) setManaging(row);
      else toast.error("User not found.");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const markReviewed = async (report: ReportRow) => {
    try {
      await api.admin.updateReport(report.id, { status: "REVIEWED", note: null });
      toast.success("Marked as reviewed.");
      void queue.reload({ silent: true });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <section className="space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Flag className="size-4 text-rose-600" /> Open reports ({reports.length})
        </h3>
        {reports.length === 0 ? (
          <EmptyState icon={<CheckCircle2 />} title="No open reports" description="The community is in good shape." />
        ) : (
          reports.map((report) => (
            <article key={report.id} className="space-y-3 rounded-2xl border border-slate-100 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-900">
                    {report.reported.displayName} <span className="font-normal text-slate-500">({report.reported.email})</span>
                  </p>
                  <p className="text-xs text-slate-500">
                    Reported by {report.reporter.displayName} · {timeAgo(report.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <AccountStatusBadge status={report.reported.accountStatus} />
                  <span className="inline-flex h-5 items-center rounded-full border border-slate-200 px-2 text-[11px] font-semibold text-slate-600">
                    {report.status === "PENDING" ? "Pending" : "Reviewed"}
                  </span>
                </div>
              </div>
              <p className="rounded-xl bg-slate-50 p-3 text-sm whitespace-pre-wrap text-slate-700">{report.reason}</p>
              {report.resolutionNote && <p className="text-xs text-slate-500">Note: {report.resolutionNote}</p>}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="destructive" onClick={() => void openManage(report.reported.id, report.reported.email)}>
                  Take action on user
                </Button>
                {report.status === "PENDING" && (
                  <Button size="sm" variant="outline" onClick={() => void markReviewed(report)}>
                    Mark reviewed
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setNote("");
                    setResolving(report);
                  }}
                >
                  Resolve
                </Button>
              </div>
            </article>
          ))
        )}
      </section>

      <section className="space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <AlertTriangle className="size-4 text-amber-600" /> Unusual activity ({flagged.length})
        </h3>
        {flagged.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500">No accounts flagged.</p>
        ) : (
          flagged.map((item) => (
            <article key={item.user.id} className="space-y-2 rounded-2xl border border-amber-100 bg-white p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900">{item.user.displayName}</p>
                  <p className="truncate text-xs text-slate-500">{item.user.email}</p>
                </div>
                <AccountStatusBadge status={item.user.accountStatus} />
              </div>
              <ul className="space-y-1 text-xs text-amber-900">
                {item.signals.map((signal) => (
                  <li key={signal} className="flex items-center gap-1.5">
                    <AlertTriangle className="size-3" /> {signal}
                  </li>
                ))}
              </ul>
              <Button size="sm" variant="outline" className="w-full" onClick={() => void openManage(item.user.id, item.user.email)}>
                Review account
              </Button>
            </article>
          ))
        )}
      </section>

      <ConfirmDialog
        open={resolving !== null}
        onOpenChange={(open) => !open && setResolving(null)}
        title="Resolve report"
        description="Resolved reports leave the queue. The note is stored with the report and in the audit trail."
        confirmLabel="Resolve"
        onConfirm={async () => {
          if (!resolving) return;
          try {
            await api.admin.updateReport(resolving.id, { status: "RESOLVED", note: note.trim() || null });
            toast.success("Report resolved.");
            void queue.reload({ silent: true });
          } catch (err) {
            toast.error(errorMessage(err));
          }
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="resolution-note">Resolution note</Label>
          <Textarea id="resolution-note" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </ConfirmDialog>

      <AccountActionDialog user={managing} onClose={() => setManaging(null)} onUpdated={() => void queue.reload({ silent: true })} />
    </div>
  );
}
