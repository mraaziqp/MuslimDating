import { Link } from "react-router-dom";
import { ChevronRight, Clock, MessageSquare, ShieldCheck } from "lucide-react";
import { EmptyState, ErrorState, PageHeader, PageLoader } from "../components/shared/PageState";
import { ProtectedPhoto } from "../components/shared/ProtectedPhoto";
import { StatusBadge } from "../components/shared/StatusBadge";
import { Badge } from "../components/ui/badge";
import { useCurrentUser } from "../context/AuthContext";
import { useAsync, usePolling } from "../hooks/useAsync";
import { api } from "../lib/api";
import { MAX_ACTIVE_CHATS, STALE_CONNECTION_DAYS } from "../lib/constants";
import type { ConnectionView } from "../lib/contracts";
import { closedReasonLabel, counterpart } from "../lib/format";

function ChatRow({ view }: { view: ConnectionView }) {
  const isMahram = view.perspective === "MAHRAM";
  const other = counterpart(view);
  const daysLeft = STALE_CONNECTION_DAYS - view.inactiveDays;

  return (
    <Link
      to={`/chat/${view.id}`}
      className="flex items-center gap-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm transition-colors hover:bg-slate-50"
    >
      {isMahram ? (
        <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <ShieldCheck className="size-5" />
        </div>
      ) : (
        <ProtectedPhoto userId={other.id} name={other.displayName} access={other.photoAccess} className="size-12 shrink-0 rounded-full" showLock={false} />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-slate-900">
          {isMahram ? `${view.sender.displayName} & ${view.receiver.displayName}` : other.displayName}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          {view.status === "APPROVED" ? (
            <>
              {isMahram ? <span>You are the chaperone</span> : view.mahram && <span>Chaperoned by {view.mahram.displayName}</span>}
              {daysLeft <= 3 && (
                <span className="flex items-center gap-1 text-amber-700">
                  <Clock className="size-3" />
                  {daysLeft <= 0 ? "Closes today if inactive" : `Closes in ${daysLeft} day${daysLeft === 1 ? "" : "s"} if inactive`}
                </span>
              )}
            </>
          ) : (
            <span>{closedReasonLabel(view.closedReason)}</span>
          )}
        </div>
      </div>
      <StatusBadge status={view.status} />
      <ChevronRight className="size-5 text-slate-300" />
    </Link>
  );
}

export function ChatListPage() {
  const user = useCurrentUser();
  const connections = useAsync(() => api.connections(), []);
  usePolling(() => void connections.reload({ silent: true }), 30_000);

  if (connections.loading && !connections.data) return <PageLoader />;
  if (connections.error || !connections.data) {
    return <ErrorState error={connections.error ?? new Error("No data")} onRetry={() => void connections.reload()} />;
  }

  const chats = connections.data.filter(
    (c) =>
      (c.status === "APPROVED" || (c.status === "TERMINATED" && c.mahram !== null)) &&
      (c.perspective === "SENDER" || c.perspective === "RECEIVER" || c.perspective === "MAHRAM"),
  );
  const active = chats.filter((c) => c.status === "APPROVED");
  const closed = chats.filter((c) => c.status === "TERMINATED");
  const isSeeker = user.role === "SOLO" || user.role === "DEPENDENT";
  const myActive = active.filter((c) => c.perspective !== "MAHRAM").length;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <PageHeader
        title="Conversations"
        description={`Chats close automatically after ${STALE_CONNECTION_DAYS} days without messages, to keep courtship intentional.`}
        actions={
          isSeeker && (
            <Badge variant="outline" className="h-7 px-3 text-slate-600">
              {myActive}/{MAX_ACTIVE_CHATS} active
            </Badge>
          )
        }
      />
      {chats.length === 0 ? (
        <EmptyState
          icon={<MessageSquare />}
          title="No conversations yet"
          description="A chat opens once both sides approve and a mahram is assigned."
        />
      ) : (
        <>
          <div className="space-y-3">{active.map((view) => <ChatRow key={view.id} view={view} />)}</div>
          {closed.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-bold tracking-wider text-slate-500 uppercase">Closed</h2>
              {closed.map((view) => (
                <ChatRow key={view.id} view={view} />
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
