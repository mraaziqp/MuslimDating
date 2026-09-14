import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Eye, MessageSquare, Search, ShieldCheck } from "lucide-react";
import { format } from "date-fns";
import { useAsync } from "../../hooks/useAsync";
import { useDebouncedValue } from "../../hooks/useElementWidth";
import { api } from "../../lib/api";
import { CONNECTION_STATUSES, oneOf } from "../../lib/constants";
import type { AdminTranscriptMessage, ConnectionStatus } from "../../lib/contracts";
import { STATUS_LABELS, closedReasonLabel, timeAgo } from "../../lib/format";
import { cn } from "../../lib/utils";
import { ErrorState, PageLoader } from "../shared/PageState";
import { StatusBadge } from "../shared/StatusBadge";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";
import { NativeSelect } from "../ui/native-select";

const PAGE_SIZE = 25;

const ROLE_TONE: Record<AdminTranscriptMessage["senderRole"], string> = {
  SENDER: "bg-white border-slate-200",
  RECEIVER: "bg-rose-50 border-rose-100",
  MAHRAM: "bg-emerald-50 border-emerald-200",
  OTHER: "bg-slate-50 border-slate-200",
};

function TranscriptBody({ connectionId }: { connectionId: string }) {
  const transcript = useAsync(() => api.admin.transcript(connectionId), [connectionId]);

  if (transcript.loading && !transcript.data) return <PageLoader label="Loading conversation…" />;
  if (transcript.error || !transcript.data) {
    return <ErrorState error={transcript.error ?? new Error("No data")} onRetry={() => void transcript.reload()} />;
  }
  const { connection, messages } = transcript.data;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <StatusBadge status={connection.status} />
        {connection.mahram && (
          <span className="flex items-center gap-1 text-emerald-700">
            <ShieldCheck className="size-3.5" /> Mahram: {connection.mahram.displayName}
          </span>
        )}
        <span>
          Photos: {connection.senderPhotoConsent && connection.receiverPhotoConsent ? "mutually revealed" : "private"}
        </span>
        {closedReasonLabel(connection.closedReason) && <span>· {closedReasonLabel(connection.closedReason)}</span>}
      </div>
      <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
        This view has been recorded in the audit trail.
      </p>
      <div className="max-h-[55vh] space-y-2 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50/50 p-3">
        {messages.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">No messages in this conversation.</p>
        ) : (
          messages.map((message) => (
            <div key={message.id} className={cn("rounded-xl border p-2.5", ROLE_TONE[message.senderRole])}>
              <div className="mb-0.5 flex items-center justify-between gap-2 text-[11px] text-slate-500">
                <span className="font-semibold text-slate-700">
                  {message.senderName}
                  {message.senderRole === "MAHRAM" && " · Mahram"}
                </span>
                <time dateTime={message.createdAt}>{format(new Date(message.createdAt), "d MMM yyyy, HH:mm")}</time>
              </div>
              <p className="text-sm break-words whitespace-pre-wrap text-slate-800">{message.text}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function TranscriptDialog({ connectionId, onClose }: { connectionId: string | null; onClose: () => void }) {
  if (!connectionId) return null;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Conversation transcript</DialogTitle>
          <DialogDescription>Full message history for moderation and safety review.</DialogDescription>
        </DialogHeader>
        <TranscriptBody connectionId={connectionId} />
      </DialogContent>
    </Dialog>
  );
}

export function ConnectionsExplorer({ onViewUser }: { onViewUser: (userId: string) => void }) {
  const [search, setSearch] = useState("");
  const q = useDebouncedValue(search.trim(), 300);
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [page, setPage] = useState(1);
  const [transcriptId, setTranscriptId] = useState<string | null>(null);

  useEffect(() => setPage(1), [q, status]);

  const list = useAsync(
    () => api.admin.connections({ page, pageSize: PAGE_SIZE, q: q || undefined, status: status ?? undefined }),
    [page, q, status],
  );
  const totalPages = list.data ? Math.max(1, Math.ceil(list.data.total / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by member name or email"
            className="h-9 pl-8"
            aria-label="Search connections"
          />
        </div>
        <NativeSelect
          className="sm:w-60"
          value={status ?? ""}
          onChange={(e) => setStatus(oneOf(CONNECTION_STATUSES, e.target.value))}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          {CONNECTION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </NativeSelect>
      </div>

      {list.loading && !list.data ? (
        <PageLoader label="Loading connections…" />
      ) : list.error || !list.data ? (
        <ErrorState error={list.error ?? new Error("No data")} onRetry={() => void list.reload()} />
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Sender</th>
                  <th className="px-3 py-2 font-medium">Recipient</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Mahram</th>
                  <th className="px-3 py-2 text-right font-medium">Messages</th>
                  <th className="px-3 py-2 font-medium">Last activity</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {list.data.items.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/60">
                    {[c.sender, c.receiver].map((p) => (
                      <td key={p.id} className="px-3 py-2.5">
                        <button type="button" onClick={() => onViewUser(p.id)} className="text-left hover:underline">
                          <span className="block font-medium text-slate-900">{p.displayName}</span>
                          <span className="block text-xs text-slate-500">{p.email}</span>
                        </button>
                      </td>
                    ))}
                    <td className="px-3 py-2.5">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">{c.mahram?.displayName ?? "—"}</td>
                    <td className="px-3 py-2.5 text-right text-slate-600 tabular-nums">{c.messageCount}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-500">{timeAgo(c.lastActivityAt)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <Button variant="outline" size="sm" onClick={() => setTranscriptId(c.id)}>
                        {c.messageCount > 0 ? <MessageSquare /> : <Eye />} Conversation
                      </Button>
                    </td>
                  </tr>
                ))}
                {list.data.items.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-10 text-center text-slate-500">
                      No connections match these filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between text-sm text-slate-500">
            <span>
              {list.data.total.toLocaleString()} connection{list.data.total === 1 ? "" : "s"} · page {page} of {totalPages}
            </span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft /> Previous
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Next <ChevronRight />
              </Button>
            </div>
          </div>
        </>
      )}

      <TranscriptDialog connectionId={transcriptId} onClose={() => setTranscriptId(null)} />
    </div>
  );
}
