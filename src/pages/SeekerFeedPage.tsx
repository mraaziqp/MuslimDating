import { useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, Flag, Heart, MapPin, ShieldCheck, Sparkles, Users } from "lucide-react";
import { toast } from "sonner";
import { ProfileDetails } from "../components/shared/ProfileDetails";
import { EmptyState, ErrorState, PageHeader, PageLoader } from "../components/shared/PageState";
import { ProtectedPhoto } from "../components/shared/ProtectedPhoto";
import { ReportDialog } from "../components/shared/ReportDialog";
import { Badge } from "../components/ui/badge";
import { Button, buttonVariants } from "../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { useAuth } from "../context/AuthContext";
import { useAsync } from "../hooks/useAsync";
import { ApiError, api, errorMessage } from "../lib/api";
import type { FeedGate, PublicProfile } from "../lib/contracts";
import { cn } from "../lib/utils";

function GateNotice({ gate }: { gate: FeedGate }) {
  if (!gate.readinessCompleted) {
    return (
      <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-start gap-2 text-sm text-amber-900">
          <BookOpen className="mt-0.5 size-4 shrink-0" />
          Complete “Etiquette of Halal Courtship” in the Readiness Hub to unlock connection requests.
        </p>
        <Link to="/readiness/intro" className={cn(buttonVariants(), "bg-amber-600 text-white hover:bg-amber-700")}>
          Start module
        </Link>
      </div>
    );
  }
  if (gate.needsWali) {
    return (
      <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-start gap-2 text-sm text-amber-900">
          <Users className="mt-0.5 size-4 shrink-0" />
          Your requests need wali approval. Invite your wali before sending requests.
        </p>
        <Link to="/family" className={cn(buttonVariants(), "bg-amber-600 text-white hover:bg-amber-700")}>
          Invite wali
        </Link>
      </div>
    );
  }
  return null;
}

export function SeekerFeedPage() {
  const { user } = useAuth();
  const feed = useAsync(() => api.feed(), []);
  const [sending, setSending] = useState<string | null>(null);
  const [limitMessage, setLimitMessage] = useState<string | null>(null);
  const [reporting, setReporting] = useState<PublicProfile | null>(null);

  if (feed.loading && !feed.data) return <PageLoader label="Curating your daily batch…" />;
  if (feed.error || !feed.data) return <ErrorState error={feed.error ?? new Error("No data")} onRetry={() => void feed.reload()} />;

  const { gate, profiles } = feed.data;
  const blocked =
    !gate.readinessCompleted ||
    gate.needsWali ||
    gate.activeChats >= gate.maxActiveChats ||
    gate.pendingOutgoing >= gate.maxPendingOutgoing;

  const removeProfile = (id: string) =>
    feed.setData((prev) => (prev ? { ...prev, profiles: prev.profiles.filter((p) => p.id !== id) } : prev));

  const sendRequest = async (profile: PublicProfile) => {
    setSending(profile.id);
    try {
      const view = await api.requestConnection(profile.id);
      toast.success(
        view.status === "PENDING_MALE_PARENT"
          ? "Request sent to your wali for review first."
          : `Request sent — awaiting ${profile.displayName}${profile.waliInvolved ? " and their wali" : ""}.`,
      );
      removeProfile(profile.id);
      void feed.reload({ silent: true });
    } catch (err) {
      if (err instanceof ApiError && (err.code === "ACTIVE_CHAT_LIMIT" || err.code === "PENDING_LIMIT")) {
        setLimitMessage(err.message);
      } else {
        toast.error(errorMessage(err));
        if (err instanceof ApiError && err.code === "RECIPIENT_UNAVAILABLE") removeProfile(profile.id);
      }
    } finally {
      setSending(null);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4">
      <PageHeader
        title="Daily curated batch"
        description="Up to five intentional introductions each day — no swiping, no endless scrolling."
        actions={
          <>
            <Badge variant="outline" className="h-7 px-3 text-slate-600">
              {gate.activeChats}/{gate.maxActiveChats} active chats
            </Badge>
            <Badge variant="outline" className="h-7 px-3 text-slate-600">
              {gate.pendingOutgoing}/{gate.maxPendingOutgoing} pending requests
            </Badge>
          </>
        }
      />

      <GateNotice gate={gate} />

      {!user?.gender ? null : profiles.length === 0 ? (
        <EmptyState
          icon={<Sparkles />}
          title="No new introductions today"
          description="New profiles are curated daily from members who have completed the Readiness Hub. Check back tomorrow, in shaa Allah."
          action={
            <Link to="/requests" className={buttonVariants({ variant: "outline" })}>
              View your requests
            </Link>
          }
        />
      ) : (
        <div className="grid gap-6">
          {profiles.map((profile) => (
            <article key={profile.id} className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-lg">
              <div className="grid sm:grid-cols-[220px_1fr]">
                <ProtectedPhoto
                  userId={profile.id}
                  name={profile.displayName}
                  access={profile.photoAccess}
                  className="aspect-[4/3] w-full sm:aspect-auto sm:h-full"
                />
                <div className="space-y-4 p-5 sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">
                        {profile.displayName}
                        {profile.age !== null && <span className="font-normal text-slate-400">, {profile.age}</span>}
                      </h2>
                      {profile.location && (
                        <p className="mt-0.5 flex items-center gap-1 text-sm text-slate-500">
                          <MapPin className="size-3.5" /> {profile.location}
                        </p>
                      )}
                    </div>
                    {profile.waliInvolved && (
                      <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                        <ShieldCheck /> Wali involved
                      </Badge>
                    )}
                  </div>

                  <ProfileDetails profile={profile} compact />

                  <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                    <Button
                      onClick={() => void sendRequest(profile)}
                      disabled={blocked || sending !== null}
                      className="h-10 flex-1 bg-rose-600 font-semibold text-white hover:bg-rose-700"
                    >
                      <Heart /> {sending === profile.id ? "Sending…" : "Send connection request"}
                    </Button>
                    <Button variant="ghost" className="h-10 text-slate-500" onClick={() => setReporting(profile)}>
                      <Flag /> Report
                    </Button>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <Dialog open={limitMessage !== null} onOpenChange={(open) => !open && setLimitMessage(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Intentionality limit reached</DialogTitle>
            <DialogDescription>{limitMessage}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setLimitMessage(null)} className="bg-rose-600 text-white hover:bg-rose-700">
              Understood
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {reporting && (
        <ReportDialog
          userId={reporting.id}
          name={reporting.displayName}
          open
          onOpenChange={(open) => {
            if (!open) {
              removeProfile(reporting.id);
              setReporting(null);
            }
          }}
        />
      )}
    </div>
  );
}
