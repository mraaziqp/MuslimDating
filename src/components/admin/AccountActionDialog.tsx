import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useCurrentUser } from "../../context/AuthContext";
import { api, errorMessage } from "../../lib/api";
import { ALL_ROLES, ROLE_LABELS, oneOf } from "../../lib/constants";
import type { AdminUserRow, UserRole } from "../../lib/contracts";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Label } from "../ui/label";
import { NativeSelect } from "../ui/native-select";
import { Textarea } from "../ui/textarea";

type ActionKey = "SUSPEND" | "BAN" | "REINSTATE" | "RESET_ROLE" | "ASSIGN_ROLE" | "REMOVE_PHOTO";

const ACTION_COPY: Record<ActionKey, { label: string; description: string; destructive: boolean }> = {
  SUSPEND: { label: "Suspend", description: "Temporarily blocks sign-in. Lifts automatically when the period ends.", destructive: true },
  BAN: {
    label: "Ban",
    description: "Permanently blocks sign-in and closes every pending request and active chat involving this user.",
    destructive: true,
  },
  REINSTATE: { label: "Reinstate", description: "Restores full access immediately.", destructive: false },
  RESET_ROLE: {
    label: "Reset role",
    description: "Returns the account to Independent Seeker and removes any wali/mahram links they hold.",
    destructive: true,
  },
  ASSIGN_ROLE: { label: "Assign role", description: "Explicitly change this user's role, including elevation to Administrator.", destructive: false },
  REMOVE_PHOTO: { label: "Remove photo", description: "Deletes the user's profile photo (e.g. for inappropriate content).", destructive: true },
};

const SUSPENSION_DAYS = [1, 3, 7, 14, 30, 90];

interface AccountActionDialogProps {
  user: AdminUserRow | null;
  onClose: () => void;
  onUpdated: (row: AdminUserRow) => void;
}

export function AccountActionDialog({ user, onClose, onUpdated }: AccountActionDialogProps) {
  const me = useCurrentUser();
  const [action, setAction] = useState<ActionKey>("SUSPEND");
  const [reason, setReason] = useState("");
  const [days, setDays] = useState(7);
  const [role, setRole] = useState<UserRole>("SOLO");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    setAction(user.accountStatus === "ACTIVE" ? "SUSPEND" : "REINSTATE");
    setReason("");
    setDays(7);
    setRole(user.role);
  }, [user]);

  if (!user) return null;

  const isSelf = user.id === me.id;
  const available: ActionKey[] = [
    ...(user.accountStatus !== "SUSPENDED" ? (["SUSPEND"] as const) : []),
    ...(user.accountStatus !== "BANNED" ? (["BAN"] as const) : []),
    ...(user.accountStatus !== "ACTIVE" ? (["REINSTATE"] as const) : []),
    ...(user.role !== "SOLO" ? (["RESET_ROLE"] as const) : []),
    "ASSIGN_ROLE",
    ...(user.hasPhoto ? (["REMOVE_PHOTO"] as const) : []),
  ];
  const copy = ACTION_COPY[action];
  const valid = reason.trim().length >= 3 && (action !== "ASSIGN_ROLE" || role !== user.role);

  const submit = async () => {
    setBusy(true);
    try {
      const trimmed = reason.trim();
      let updated: AdminUserRow;
      switch (action) {
        case "SUSPEND":
          updated = await api.admin.setStatus(user.id, { action: "SUSPEND", reason: trimmed, durationDays: days });
          break;
        case "BAN":
        case "REINSTATE":
        case "RESET_ROLE":
          updated = await api.admin.setStatus(user.id, { action, reason: trimmed });
          break;
        case "ASSIGN_ROLE":
          updated = await api.admin.assignRole(user.id, { role, reason: trimmed });
          break;
        case "REMOVE_PHOTO":
          updated = await api.admin.removePhoto(user.id, trimmed);
          break;
      }
      onUpdated(updated);
      toast.success(`${copy.label} applied to ${user.displayName ?? user.email}. Recorded in the audit trail.`);
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Manage {user.displayName ?? user.email}</DialogTitle>
          <DialogDescription>
            {user.email} · {ROLE_LABELS[user.role]} · {user.accountStatus.toLowerCase()}
          </DialogDescription>
        </DialogHeader>

        {isSelf ? (
          <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
            You cannot run moderation actions on your own account. Ask another administrator.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Action">
              {available.map((key) => (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={action === key}
                  onClick={() => setAction(key)}
                  className={cn(
                    "rounded-lg border px-2.5 py-1 text-xs font-medium",
                    action === key
                      ? ACTION_COPY[key].destructive
                        ? "border-rose-300 bg-rose-50 text-rose-700"
                        : "border-emerald-300 bg-emerald-50 text-emerald-700"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50",
                  )}
                >
                  {ACTION_COPY[key].label}
                </button>
              ))}
            </div>
            <p className="text-sm text-slate-600">{copy.description}</p>

            {action === "SUSPEND" && (
              <div className="space-y-1.5">
                <Label htmlFor="suspend-days">Duration</Label>
                <NativeSelect id="suspend-days" value={days} onChange={(e) => setDays(Number(e.target.value))}>
                  {SUSPENSION_DAYS.map((d) => (
                    <option key={d} value={d}>
                      {d} day{d === 1 ? "" : "s"}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            )}
            {action === "ASSIGN_ROLE" && (
              <div className="space-y-1.5">
                <Label htmlFor="assign-role">New role</Label>
                <NativeSelect id="assign-role" value={role} onChange={(e) => setRole(oneOf(ALL_ROLES, e.target.value) ?? user.role)}>
                  {ALL_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="action-reason">Reason (stored in the immutable audit log)</Label>
              <Textarea id="action-reason" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          {!isSelf && (
            <Button
              variant={copy.destructive ? "destructive" : "default"}
              className={copy.destructive ? undefined : "bg-emerald-600 text-white hover:bg-emerald-700"}
              disabled={!valid || busy}
              onClick={() => void submit()}
            >
              {busy ? "Applying…" : copy.label}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
