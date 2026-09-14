import { useState, type FormEvent } from "react";
import { Copy, KeyRound, ShieldCheck, Trash2, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "../components/shared/ConfirmDialog";
import { ErrorState, PageHeader, PageLoader } from "../components/shared/PageState";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { useCurrentUser } from "../context/AuthContext";
import { useAsync } from "../hooks/useAsync";
import { api, errorMessage } from "../lib/api";
import { ROLE_LABELS } from "../lib/constants";
import type { FamilyLink, InviteCreated, LinkKind } from "../lib/contracts";

const KIND_LABEL: Record<LinkKind, string> = { WALI: "Wali", MAHRAM: "Mahram" };

function LinkRow({ link, onRemove }: { link: FamilyLink; onRemove: (link: FamilyLink) => void }) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-3">
      <div className="min-w-0">
        <p className="truncate font-medium text-slate-800">{link.person.displayName}</p>
        <p className="text-xs text-slate-500">{ROLE_LABELS[link.person.role]}</p>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant="outline" className={link.kind === "WALI" ? "border-rose-200 text-rose-700" : "border-emerald-200 text-emerald-700"}>
          {KIND_LABEL[link.kind]}
        </Badge>
        <Button variant="ghost" size="icon-sm" aria-label={`Remove ${link.person.displayName}`} onClick={() => onRemove(link)}>
          <Trash2 className="text-slate-400" />
        </Button>
      </div>
    </li>
  );
}

export function FamilyPage() {
  const user = useCurrentUser();
  const family = useAsync(() => api.family(), []);
  const [created, setCreated] = useState<InviteCreated | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<FamilyLink | null>(null);

  const isSeeker = user.role === "SOLO" || user.role === "DEPENDENT";
  const canRedeem = user.role === "PARENT" || user.role === "MAHRAM";

  if (family.loading && !family.data) return <PageLoader />;
  if (family.error || !family.data) return <ErrorState error={family.error ?? new Error("No data")} onRetry={() => void family.reload()} />;
  const { guardians, dependents, activeInvites } = family.data;

  const createInvite = async (kind: LinkKind) => {
    setBusy(true);
    try {
      setCreated(await api.createInvite(kind));
      void family.reload({ silent: true });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const redeem = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const link = await api.redeemInvite(code.trim());
      toast.success(`You are now linked to ${link.person.displayName} as their ${KIND_LABEL[link.kind].toLowerCase()}.`);
      setCode("");
      void family.reload({ silent: true });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Code copied");
    } catch {
      toast.error("Copy failed — please copy the code manually.");
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <PageHeader
        title="Family & chaperones"
        description="Walis approve connections; mahrams chaperone conversations. Links are made with single-use invite codes."
      />

      {isSeeker && (
        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UserPlus className="size-4 text-rose-500" /> Invite your wali or mahram
            </CardTitle>
            <CardDescription>
              Create a code and share it privately. Your wali must register as <strong>Parent / Wali</strong>; a mahram registers as{" "}
              <strong>Mahram</strong>. Codes expire after 72 hours.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {user.requiresParentalVetting && !guardians.some((g) => g.kind === "WALI") && (
              <p className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
                <ShieldCheck className="mt-0.5 size-4 shrink-0" /> Your requests require wali approval — link your wali to start connecting.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button disabled={busy} onClick={() => void createInvite("WALI")} className="bg-rose-600 text-white hover:bg-rose-700">
                Create wali invite
              </Button>
              <Button disabled={busy} variant="outline" onClick={() => void createInvite("MAHRAM")}>
                Create mahram invite
              </Button>
            </div>
            {created && (
              <div className="flex flex-col gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold text-emerald-800 uppercase">{KIND_LABEL[created.kind]} invite code</p>
                  <p className="font-mono text-2xl font-bold tracking-widest text-emerald-900">{created.code}</p>
                  <p className="text-xs text-emerald-700">Expires {new Date(created.expiresAt).toLocaleString()}</p>
                </div>
                <Button variant="outline" onClick={() => void copy(created.code)}>
                  <Copy /> Copy
                </Button>
              </div>
            )}
            {activeInvites.length > 0 && (
              <ul className="space-y-1 text-sm text-slate-600">
                {activeInvites.map((invite) => (
                  <li key={invite.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                    <span>
                      Unused {KIND_LABEL[invite.kind].toLowerCase()} code · expires {new Date(invite.expiresAt).toLocaleDateString()}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        try {
                          await api.revokeInvite(invite.id);
                          void family.reload({ silent: true });
                        } catch (err) {
                          toast.error(errorMessage(err));
                        }
                      }}
                    >
                      Revoke
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {canRedeem && (
        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <KeyRound className="size-4 text-rose-500" /> Enter an invite code
            </CardTitle>
            <CardDescription>Your family member creates this code on their Family page.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={redeem} className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="invite-code">Invite code</Label>
                <Input
                  id="invite-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="ABCD-2345"
                  maxLength={9}
                  autoComplete="off"
                  className="font-mono tracking-widest"
                />
              </div>
              <Button type="submit" disabled={busy || code.trim().length < 8} className="bg-rose-600 text-white hover:bg-rose-700">
                Link family member
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {isSeeker && (
        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="size-4 text-rose-500" /> Your guardians
            </CardTitle>
          </CardHeader>
          <CardContent>
            {guardians.length === 0 ? (
              <p className="text-sm text-slate-500">No wali or mahram linked yet.</p>
            ) : (
              <ul className="space-y-2">
                {guardians.map((link) => (
                  <LinkRow key={link.linkId} link={link} onRemove={setRemoving} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {canRedeem && (
        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="size-4 text-rose-500" /> Family members you look after
            </CardTitle>
          </CardHeader>
          <CardContent>
            {dependents.length === 0 ? (
              <p className="text-sm text-slate-500">No one is linked yet.</p>
            ) : (
              <ul className="space-y-2">
                {dependents.map((link) => (
                  <LinkRow key={link.linkId} link={link} onRemove={setRemoving} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Remove ${removing?.person.displayName ?? "link"}?`}
        description="They will no longer be able to approve connections or chaperone chats for this family member."
        confirmLabel="Remove link"
        destructive
        onConfirm={async () => {
          if (!removing) return;
          try {
            await api.removeLink(removing.linkId);
            toast.success("Link removed.");
            void family.reload({ silent: true });
          } catch (err) {
            toast.error(errorMessage(err));
          }
        }}
      />
    </div>
  );
}
