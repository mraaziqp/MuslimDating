import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Activity, Eye, Flag, HeartHandshake, LayoutDashboard, Users } from "lucide-react";
import { PageHeader } from "../shared/PageState";
import { buttonVariants } from "../ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { oneOf } from "../../lib/constants";
import type { AdminUserRow } from "../../lib/contracts";
import { cn } from "../../lib/utils";
import { AccountActionDialog } from "./AccountActionDialog";
import { AdminUserDetailDialog } from "./AdminUserDetailDialog";
import { AuditTrail } from "./AuditTrail";
import { ConnectionsExplorer, TranscriptDialog } from "./ConnectionsExplorer";
import { MetricsOverview } from "./MetricsOverview";
import { ModerationQueue } from "./ModerationQueue";
import { UserDirectory } from "./UserDirectory";

const TABS = ["overview", "users", "connections", "moderation", "audit"] as const;
type AdminTab = (typeof TABS)[number];

export function AdminDashboard() {
  const [params, setParams] = useSearchParams();
  const tab: AdminTab = oneOf(TABS, params.get("tab") ?? "") ?? "overview";
  const [viewingUser, setViewingUser] = useState<string | null>(null);
  const [managing, setManaging] = useState<AdminUserRow | null>(null);
  const [transcriptId, setTranscriptId] = useState<string | null>(null);
  const [accountsChanged, setAccountsChanged] = useState(0);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4">
      <PageHeader
        title="Administration"
        description="Platform health, every member and connection, moderation, and the immutable audit trail."
        actions={
          <Link to="/discover?tab=browse" className={cn(buttonVariants({ size: "sm" }), "gap-1.5 bg-rose-600 text-white hover:bg-rose-700")}>
            <Eye className="size-3.5" />
            Preview Discover as a member
          </Link>
        }
      />

      <Tabs
        value={tab}
        onValueChange={(value) => {
          const next = oneOf(TABS, String(value)) ?? "overview";
          setParams(next === "overview" ? {} : { tab: next }, { replace: true });
        }}
      >
        <TabsList className="grid w-full grid-cols-5 sm:inline-flex sm:w-auto">
          <TabsTrigger value="overview">
            <LayoutDashboard /> <span className="hidden sm:inline">Overview</span>
          </TabsTrigger>
          <TabsTrigger value="users">
            <Users /> <span className="hidden sm:inline">Users</span>
          </TabsTrigger>
          <TabsTrigger value="connections">
            <HeartHandshake /> <span className="hidden sm:inline">Connections</span>
          </TabsTrigger>
          <TabsTrigger value="moderation">
            <Flag /> <span className="hidden sm:inline">Moderation</span>
          </TabsTrigger>
          <TabsTrigger value="audit">
            <Activity /> <span className="hidden sm:inline">Audit trail</span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="mt-4">
          {tab === "overview" && <MetricsOverview />}
        </TabsContent>
        <TabsContent value="users" className="mt-4">
          {tab === "users" && <UserDirectory onViewUser={setViewingUser} refreshToken={accountsChanged} />}
        </TabsContent>
        <TabsContent value="connections" className="mt-4">
          {tab === "connections" && <ConnectionsExplorer onViewUser={setViewingUser} />}
        </TabsContent>
        <TabsContent value="moderation" className="mt-4">
          {tab === "moderation" && <ModerationQueue />}
        </TabsContent>
        <TabsContent value="audit" className="mt-4">
          {tab === "audit" && <AuditTrail />}
        </TabsContent>
      </Tabs>

      <AdminUserDetailDialog
        userId={viewingUser}
        onClose={() => setViewingUser(null)}
        onManage={(row) => {
          setViewingUser(null);
          setManaging(row);
        }}
        onViewConversation={(id) => {
          setViewingUser(null);
          setTranscriptId(id);
        }}
      />
      <AccountActionDialog user={managing} onClose={() => setManaging(null)} onUpdated={() => setAccountsChanged((n) => n + 1)} />
      <TranscriptDialog connectionId={transcriptId} onClose={() => setTranscriptId(null)} />
    </div>
  );
}
