import type { ReactNode } from "react";
import { MessageSquare, Settings2, ShieldCheck } from "lucide-react";
import { format } from "date-fns";
import { useAsync } from "../../hooks/useAsync";
import { api } from "../../lib/api";
import { PRIVACY_FIELD_LABELS, ROLE_LABELS } from "../../lib/constants";
import type { AdminUserRow } from "../../lib/contracts";
import { timeAgo } from "../../lib/format";
import { READINESS_MODULES } from "../../lib/readiness";
import { ErrorState, PageLoader } from "../shared/PageState";
import { ProtectedPhoto } from "../shared/ProtectedPhoto";
import { StatusBadge } from "../shared/StatusBadge";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { AccountStatusBadge } from "./UserDirectory";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-bold tracking-wider text-slate-500 uppercase">{title}</h3>
      {children}
    </section>
  );
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg bg-slate-50 px-2.5 py-1.5">
      <p className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">{label}</p>
      <p className="text-sm break-words text-slate-800">{value === null || value === "" ? "—" : value}</p>
    </div>
  );
}

interface AdminUserDetailDialogProps {
  userId: string | null;
  onClose: () => void;
  onManage: (row: AdminUserRow) => void;
  onViewConversation: (connectionId: string) => void;
}

function DetailBody({ userId, onManage, onViewConversation }: Omit<AdminUserDetailDialogProps, "userId" | "onClose"> & { userId: string }) {
  const detail = useAsync(() => api.admin.userDetail(userId), [userId]);

  if (detail.loading && !detail.data) return <PageLoader label="Loading member record…" />;
  if (detail.error || !detail.data) return <ErrorState error={detail.error ?? new Error("No data")} onRetry={() => void detail.reload()} />;

  const { account, profile, family, connections, reportsAgainst, reportsFiled, recentActivity } = detail.data;
  const completed = new Set(profile.completedModules);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <ProtectedPhoto
          userId={profile.id}
          name={profile.displayName ?? profile.email}
          access={profile.hasPhoto ? "FULL" : "NONE"}
          className="size-24 shrink-0 rounded-2xl"
          showLock={false}
        />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-lg font-bold text-slate-900">{profile.displayName ?? "No name"}</p>
          <p className="text-sm text-slate-500">
            {profile.username && <span className="font-mono">@{profile.username} · </span>}
            {profile.email}
            {profile.phone && ` · ${profile.phone}`}
          </p>
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <Badge variant="secondary" className="bg-rose-100 text-rose-700">
              {ROLE_LABELS[profile.role]}
            </Badge>
            <AccountStatusBadge status={profile.accountStatus} />
            {profile.readinessCompleted && (
              <Badge variant="secondary" className="bg-emerald-100 text-emerald-700">
                <ShieldCheck /> Readiness certified
              </Badge>
            )}
          </div>
        </div>
        <Button variant="outline" onClick={() => onManage(account)}>
          <Settings2 /> Manage account
        </Button>
      </div>

      <Section title="Profile">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Field label="Gender" value={profile.gender} />
          <Field label="Age" value={profile.age} />
          <Field label="Location" value={profile.location} />
          <Field label="Profession" value={profile.profession} />
          <Field label="Prayer" value={profile.prayerFrequency} />
          <Field label="Diet" value={profile.dietaryHabits} />
          <Field label="Education" value={profile.education} />
          <Field label="Marital status" value={profile.maritalStatus} />
          <Field label="Height" value={profile.height} />
          <Field label="Nationality" value={profile.nationality} />
          <Field label="Languages" value={profile.languages.join(", ")} />
          <Field label="Sign-in" value={profile.authProvider === "google" ? "Google" : "Email / username + password"} />
          <Field label="Wali vetting" value={profile.requiresParentalVetting ? "On" : "Off"} />
          <Field label="Modesty blur" value={profile.modestyBlurEnabled ? "On" : "Off"} />
          <Field label="Onboarded" value={profile.onboardingCompleted ? "Yes" : "No"} />
          <Field label="Joined" value={format(new Date(profile.createdAt), "d MMM yyyy")} />
          <Field label="Last seen" value={account.lastSeenAt ? timeAgo(account.lastSeenAt) : null} />
          <Field
            label="Suspended until"
            value={profile.suspendedUntil ? format(new Date(profile.suspendedUntil), "d MMM yyyy") : null}
          />
        </div>
        {profile.bio && <p className="rounded-lg bg-slate-50 p-2.5 text-sm whitespace-pre-wrap text-slate-700">{profile.bio}</p>}
        <p className="text-xs text-slate-500">
          Hidden from other members:{" "}
          {profile.hiddenFields.length === 0 ? "nothing" : profile.hiddenFields.map((f) => PRIVACY_FIELD_LABELS[f]).join(", ")}
        </p>
        <p className="text-xs text-slate-500">
          Readiness modules:{" "}
          {READINESS_MODULES.map((m) => `${m.title} ${completed.has(m.id) ? "✓" : "✗"}`).join(" · ")}
        </p>
      </Section>

      <Section title={`Family links (${family.length})`}>
        {family.length === 0 ? (
          <p className="text-sm text-slate-500">No wali or mahram links.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {family.map((link) => (
              <li key={link.linkId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5">
                <span>
                  <span className="font-medium">{link.person.displayName}</span>{" "}
                  <span className="text-xs text-slate-500">({link.person.email})</span>
                </span>
                <span className="text-xs text-slate-600">
                  {link.relation === "GUARDIAN" ? `Is this member's ${link.kind.toLowerCase()}` : `This member is their ${link.kind.toLowerCase()}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Connections (${connections.length})`}>
        {connections.length === 0 ? (
          <p className="text-sm text-slate-500">No connections.</p>
        ) : (
          <ul className="space-y-1">
            {connections.map((c) => {
              const other = c.sender.id === profile.id ? c.receiver : c.receiver.id === profile.id ? c.sender : null;
              return (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-sm">
                  <span className="min-w-0">
                    {other ? (
                      <>
                        with <span className="font-medium">{other.displayName}</span>
                      </>
                    ) : (
                      <>
                        Chaperoning <span className="font-medium">{c.sender.displayName}</span> &{" "}
                        <span className="font-medium">{c.receiver.displayName}</span>
                      </>
                    )}
                    <span className="ml-2 text-xs text-slate-500">{c.messageCount} messages</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <StatusBadge status={c.status} />
                    <Button variant="ghost" size="sm" onClick={() => onViewConversation(c.id)}>
                      <MessageSquare /> View
                    </Button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title={`Reports against this member (${reportsAgainst.length}) · filed by them: ${reportsFiled}`}>
        {reportsAgainst.length === 0 ? (
          <p className="text-sm text-slate-500">No reports.</p>
        ) : (
          <ul className="space-y-1.5">
            {reportsAgainst.map((r) => (
              <li key={r.id} className="rounded-lg bg-slate-50 p-2.5 text-sm">
                <p className="text-xs text-slate-500">
                  {r.reporter.displayName} · {timeAgo(r.createdAt)} · {r.status.toLowerCase()}
                </p>
                <p className="whitespace-pre-wrap text-slate-800">{r.reason}</p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Recent activity">
        {recentActivity.length === 0 ? (
          <p className="text-sm text-slate-500">No recorded activity.</p>
        ) : (
          <ul className="divide-y divide-slate-100 text-xs">
            {recentActivity.map((log) => (
              <li key={log.id} className="flex flex-wrap justify-between gap-2 py-1.5">
                <span className="font-mono text-slate-700">{log.action}</span>
                <span className="text-slate-500">
                  {log.actor ? log.actor.displayName : "System"} · {timeAgo(log.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

export function AdminUserDetailDialog({ userId, onClose, onManage, onViewConversation }: AdminUserDetailDialogProps) {
  if (!userId) return null;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Member record</DialogTitle>
          <DialogDescription>Everything held about this member, including private fields.</DialogDescription>
        </DialogHeader>
        <DetailBody userId={userId} onManage={onManage} onViewConversation={onViewConversation} />
      </DialogContent>
    </Dialog>
  );
}
