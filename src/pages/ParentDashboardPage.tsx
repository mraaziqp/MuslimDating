import { Link } from "react-router-dom";
import { ShieldAlert, UserCheck, Users } from "lucide-react";
import { ConnectionCard } from "../components/connections/ConnectionCard";
import { EmptyState, ErrorState, PageHeader, PageLoader } from "../components/shared/PageState";
import { Badge } from "../components/ui/badge";
import { buttonVariants } from "../components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { useAsync, usePolling } from "../hooks/useAsync";
import { api } from "../lib/api";
import type { ConnectionView } from "../lib/contracts";

export function ParentDashboardPage() {
  const data = useAsync(async () => {
    const [connections, family] = await Promise.all([api.connections(), api.family()]);
    return { connections, family };
  }, []);
  usePolling(() => void data.reload({ silent: true }), 30_000);

  if (data.loading && !data.data) return <PageLoader label="Loading your wali dashboard…" />;
  if (data.error || !data.data) return <ErrorState error={data.error ?? new Error("No data")} onRetry={() => void data.reload()} />;

  const { family } = data.data;
  const guarded = data.data.connections.filter(
    (c) => c.perspective === "SENDER_GUARDIAN" || c.perspective === "RECEIVER_GUARDIAN",
  );
  const pending = guarded.filter((c) => c.canGuardianDecide || c.canDecline);
  const inProgress = guarded.filter(
    (c) =>
      (c.status === "PENDING_MALE_PARENT" || c.status === "PENDING_FEMALE_PARENT") && !c.canGuardianDecide && !c.canDecline,
  );
  const active = guarded.filter((c) => c.status === "APPROVED");
  const history = guarded.filter((c) => c.status === "REJECTED" || c.status === "TERMINATED");
  const wards = family.dependents.filter((d) => d.kind === "WALI");

  const replace = (next: ConnectionView) =>
    data.setData((prev) =>
      prev ? { ...prev, connections: prev.connections.map((c) => (c.id === next.id ? next : c)) } : prev,
    );

  const list = (views: ConnectionView[], empty: string, expanded = false) =>
    views.length === 0 ? (
      <EmptyState icon={<UserCheck />} title={empty} />
    ) : (
      <div className="space-y-3">
        {views.map((view) => (
          <ConnectionCard key={view.id} view={view} onChange={replace} expanded={expanded} />
        ))}
      </div>
    );

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4">
      <PageHeader
        title="Wali dashboard"
        description="Review suitors, approve connections, and assign a mahram before any conversation begins."
        actions={
          <Badge variant="secondary" className="h-7 bg-rose-100 px-3 text-rose-700">
            <ShieldAlert /> {pending.length} awaiting your decision
          </Badge>
        }
      />

      <section className="rounded-2xl border border-slate-100 bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-semibold text-slate-800">
            <Users className="size-4 text-rose-500" /> Family members under your guardianship
          </h2>
          <Link to="/family" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Link a family member
          </Link>
        </div>
        {wards.length === 0 ? (
          <p className="text-sm text-slate-500">
            No one is linked yet. Ask your family member to create a wali invite code on their Family page, then enter it here.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {wards.map((w) => (
              <Badge key={w.linkId} variant="outline" className="h-7 px-3">
                {w.person.displayName}
              </Badge>
            ))}
          </div>
        )}
      </section>

      <Tabs defaultValue="pending">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="pending">Pending ({pending.length})</TabsTrigger>
          <TabsTrigger value="progress">In progress ({inProgress.length})</TabsTrigger>
          <TabsTrigger value="active">Active ({active.length})</TabsTrigger>
          <TabsTrigger value="history">History ({history.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="pending" className="mt-4">
          {list(pending, "No requests need your decision", true)}
        </TabsContent>
        <TabsContent value="progress" className="mt-4">
          {list(inProgress, "Nothing in progress")}
        </TabsContent>
        <TabsContent value="active" className="mt-4">
          {list(active, "No active chaperoned chats")}
        </TabsContent>
        <TabsContent value="history" className="mt-4">
          {list(history, "No past decisions yet")}
        </TabsContent>
      </Tabs>
    </div>
  );
}
