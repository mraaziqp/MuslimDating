import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Activity, Flag, Heart, HeartHandshake, LayoutDashboard, MessageSquare, Search, Sparkles, Users } from "lucide-react";
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

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4">
      <PageHeader
        title="Administration"
        description="Platform health, every member and connection, moderation, and the immutable audit trail."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/search"
              className={cn(buttonVariants({ size: "sm" }), "bg-rose-600 text-white hover:bg-rose-700 shadow-xs gap-1.5")}
            >
              <Search className="size-3.5" />
              Open Search App
            </Link>
            <Link
              to="/feed"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "border-slate-300 text-slate-700 hover:bg-slate-100 gap-1.5")}
            >
              <Heart className="size-3.5 text-rose-500" />
              Matches Feed
            </Link>
          </div>
        }
      />

      <div className="flex flex-col gap-4 rounded-3xl border border-rose-200 bg-gradient-to-r from-rose-50 via-white to-pink-50/50 p-5 shadow-xs sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-800">
            <Sparkles className="size-3.5 text-rose-600" />
            Live Seeker App Discovery
          </div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">Experience Search &amp; Courtship Discovery</h2>
          <p className="text-sm text-slate-600">
            Explore suitor biodata cards, halal Ta&apos;aruf search filters, deen compatibility scoring, and suitor profiles.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/search"
            className={cn(buttonVariants({ size: "default" }), "bg-rose-600 text-white hover:bg-rose-700 shadow-sm gap-2")}
          >
            <Search className="size-4" />
            Launch Search &amp; Discovery
          </Link>
          <Link
            to="/feed"
            className={cn(buttonVariants({ variant: "outline", size: "default" }), "border-rose-200 text-rose-700 hover:bg-rose-50 gap-2")}
          >
            <Heart className="size-4" />
            Matches Feed
          </Link>
          <Link
            to="/chats"
            className={cn(buttonVariants({ variant: "outline", size: "default" }), "text-slate-700 hover:bg-slate-100 gap-2")}
          >
            <MessageSquare className="size-4" />
            Chats
          </Link>
        </div>
      </div>
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
          {tab === "users" && <UserDirectory onViewUser={setViewingUser} />}
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
      <AccountActionDialog user={managing} onClose={() => setManaging(null)} onUpdated={() => undefined} />
      <TranscriptDialog connectionId={transcriptId} onClose={() => setTranscriptId(null)} />
    </div>
  );
}
