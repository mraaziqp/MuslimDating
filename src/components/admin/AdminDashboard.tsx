import { useSearchParams } from "react-router-dom";
import { Activity, Flag, LayoutDashboard, Users } from "lucide-react";
import { PageHeader } from "../shared/PageState";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { oneOf } from "../../lib/constants";
import { AuditTrail } from "./AuditTrail";
import { MetricsOverview } from "./MetricsOverview";
import { ModerationQueue } from "./ModerationQueue";
import { UserDirectory } from "./UserDirectory";

const TABS = ["overview", "users", "moderation", "audit"] as const;
type AdminTab = (typeof TABS)[number];

export function AdminDashboard() {
  const [params, setParams] = useSearchParams();
  const tab: AdminTab = oneOf(TABS, params.get("tab") ?? "") ?? "overview";

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4">
      <PageHeader title="Administration" description="Platform health, member management, moderation, and the immutable audit trail." />
      <Tabs
        value={tab}
        onValueChange={(value) => {
          const next = oneOf(TABS, String(value)) ?? "overview";
          setParams(next === "overview" ? {} : { tab: next }, { replace: true });
        }}
      >
        <TabsList className="grid w-full grid-cols-4 sm:w-auto sm:inline-flex">
          <TabsTrigger value="overview">
            <LayoutDashboard /> <span className="hidden sm:inline">Overview</span>
          </TabsTrigger>
          <TabsTrigger value="users">
            <Users /> <span className="hidden sm:inline">Users</span>
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
          {tab === "users" && <UserDirectory />}
        </TabsContent>
        <TabsContent value="moderation" className="mt-4">
          {tab === "moderation" && <ModerationQueue />}
        </TabsContent>
        <TabsContent value="audit" className="mt-4">
          {tab === "audit" && <AuditTrail />}
        </TabsContent>
      </Tabs>
    </div>
  );
}
