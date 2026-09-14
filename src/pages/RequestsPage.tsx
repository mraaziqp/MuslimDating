import { Link } from "react-router-dom";
import { Send } from "lucide-react";
import { ConnectionCard } from "../components/connections/ConnectionCard";
import { EmptyState, ErrorState, PageHeader, PageLoader } from "../components/shared/PageState";
import { buttonVariants } from "../components/ui/button";
import { useAsync, usePolling } from "../hooks/useAsync";
import { api } from "../lib/api";
import type { ConnectionView } from "../lib/contracts";

function Section({
  title,
  views,
  onChange,
  expanded = false,
}: {
  title: string;
  views: ConnectionView[];
  onChange: (next: ConnectionView) => void;
  expanded?: boolean;
}) {
  if (views.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-bold tracking-wider text-slate-500 uppercase">
        {title} <span className="text-slate-400">({views.length})</span>
      </h2>
      {views.map((view) => (
        <ConnectionCard key={view.id} view={view} onChange={onChange} expanded={expanded} />
      ))}
    </section>
  );
}

export function RequestsPage() {
  const connections = useAsync(() => api.connections(), []);
  usePolling(() => void connections.reload({ silent: true }), 20_000);

  if (connections.loading && !connections.data) return <PageLoader />;
  if (connections.error || !connections.data) {
    return <ErrorState error={connections.error ?? new Error("No data")} onRetry={() => void connections.reload()} />;
  }

  const mine = connections.data.filter((c) => c.perspective === "SENDER" || c.perspective === "RECEIVER");
  const replace = (next: ConnectionView) =>
    connections.setData((prev) => (prev ? prev.map((c) => (c.id === next.id ? next : c)) : prev));

  const needsYou = mine.filter((c) => c.canAccept || c.canDecline);
  const waiting = mine.filter(
    (c) => (c.status === "PENDING_MALE_PARENT" || c.status === "PENDING_FEMALE_PARENT") && !c.canAccept && !c.canDecline,
  );
  const active = mine.filter((c) => c.status === "APPROVED");
  const past = mine.filter((c) => c.status === "REJECTED" || c.status === "TERMINATED");

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-4">
      <PageHeader
        title="Connection requests"
        description="Every connection moves through wali review and recipient consent before a chaperoned chat opens."
      />
      {mine.length === 0 ? (
        <EmptyState
          icon={<Send />}
          title="No requests yet"
          description="When you send or receive a connection request it will appear here with its approval progress."
          action={
            <Link to="/feed" className={buttonVariants({ variant: "outline" })}>
              Browse today's introductions
            </Link>
          }
        />
      ) : (
        <>
          <Section title="Needs your response" views={needsYou} onChange={replace} expanded />
          <Section title="Awaiting others" views={waiting} onChange={replace} />
          <Section title="Active chats" views={active} onChange={replace} />
          <Section title="Past" views={past} onChange={replace} />
        </>
      )}
    </div>
  );
}
