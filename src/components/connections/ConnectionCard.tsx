import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, CheckCircle2, Circle, Flag, MessageSquare, ShieldCheck, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage } from "../../lib/api";
import type { ConnectionView } from "../../lib/contracts";
import { closedReasonLabel, counterpart, timeAgo, yourSide } from "../../lib/format";
import { cn } from "../../lib/utils";
import { ConfirmDialog } from "../shared/ConfirmDialog";
import { ProfileDetails } from "../shared/ProfileDetails";
import { ProtectedPhoto } from "../shared/ProtectedPhoto";
import { ReportDialog } from "../shared/ReportDialog";
import { StatusBadge } from "../shared/StatusBadge";
import { Badge } from "../ui/badge";
import { Button, buttonVariants } from "../ui/button";
import { Label } from "../ui/label";
import { NativeSelect } from "../ui/native-select";

interface Step {
  label: string;
  done: boolean;
}

function stepsFor(view: ConnectionView): Step[] {
  const senderVetted = view.senderGuardianApproved || view.status === "PENDING_MALE_PARENT";
  const steps: Step[] = [{ label: "Request sent", done: true }];
  if (senderVetted) steps.push({ label: `${view.sender.displayName}'s wali approved`, done: view.senderGuardianApproved });
  steps.push({ label: `${view.receiver.displayName} accepted`, done: view.receiverAccepted });
  if (view.receiverNeedsGuardian) {
    steps.push({ label: `${view.receiver.displayName}'s wali approved`, done: view.receiverGuardianApproved });
  }
  steps.push({ label: "Mahram assigned · chat unlocked", done: view.mahram !== null });
  return steps;
}

interface ConnectionCardProps {
  view: ConnectionView;
  onChange: (next: ConnectionView) => void;
  /** Show the counterpart's full profile details (walis reviewing a suitor). */
  expanded?: boolean;
}

export function ConnectionCard({ view, onChange, expanded = false }: ConnectionCardProps) {
  const other = counterpart(view);
  const isGuardian = view.perspective === "SENDER_GUARDIAN" || view.perspective === "RECEIVER_GUARDIAN";
  const canApprove = view.canAccept || view.canGuardianDecide;
  const willComplete =
    view.status === "PENDING_FEMALE_PARENT" &&
    ((view.canAccept && (!view.receiverNeedsGuardian || view.receiverGuardianApproved)) ||
      (view.canGuardianDecide && view.perspective === "RECEIVER_GUARDIAN" && view.receiverAccepted));

  const [mahramId, setMahramId] = useState(view.mahramOptions[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<"decline" | "withdraw" | null>(null);
  const [reporting, setReporting] = useState(false);

  const approve = async () => {
    setBusy(true);
    try {
      const next = await api.decide(view.id, {
        decision: "APPROVE",
        mahramId: willComplete && mahramId ? mahramId : undefined,
      });
      onChange(next);
      toast.success(next.status === "APPROVED" ? "Approved — the chaperoned chat is now open." : "Approval recorded.");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const decline = async () => {
    try {
      onChange(await api.decide(view.id, { decision: "REJECT" }));
      toast.success("Request declined respectfully.");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const withdraw = async () => {
    try {
      onChange(await api.withdraw(view.id));
      toast.success("Request withdrawn.");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const closedNote = closedReasonLabel(view.closedReason);

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:p-5">
        <ProtectedPhoto userId={other.id} name={other.displayName} access={other.photoAccess} className="size-20 shrink-0 rounded-2xl" />

        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-lg font-bold text-slate-900">
                {other.displayName}
                {other.age !== null && <span className="font-normal text-slate-500">, {other.age}</span>}
              </h3>
              <p className="text-xs text-slate-500">
                {isGuardian && <>For {yourSide(view).displayName} · </>}
                {view.perspective === "SENDER" || view.perspective === "SENDER_GUARDIAN" ? "Outgoing" : "Incoming"} ·{" "}
                {timeAgo(view.createdAt)}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {other.waliInvolved && (
                <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                  <ShieldCheck /> Wali involved
                </Badge>
              )}
              <StatusBadge status={view.status} />
            </div>
          </div>

          {(view.status === "PENDING_MALE_PARENT" || view.status === "PENDING_FEMALE_PARENT") && (
            <ol className="flex flex-wrap gap-x-4 gap-y-1.5" aria-label="Approval progress">
              {stepsFor(view).map((step) => (
                <li key={step.label} className={cn("flex items-center gap-1 text-xs", step.done ? "text-emerald-700" : "text-slate-400")}>
                  {step.done ? <CheckCircle2 className="size-3.5" /> : <Circle className="size-3.5" />}
                  {step.label}
                </li>
              ))}
            </ol>
          )}

          {view.awaiting.length > 0 && !canApprove && (
            <p className="text-xs text-amber-700">Waiting on: {view.awaiting.join(", ")}</p>
          )}
          {view.mahram && view.status === "APPROVED" && (
            <p className="text-xs text-emerald-700">Chaperoned by {view.mahram.displayName}</p>
          )}
          {closedNote && (view.status === "REJECTED" || view.status === "TERMINATED") && (
            <p className="text-xs text-slate-500">{closedNote}</p>
          )}

          {expanded && <ProfileDetails profile={other} />}

          {canApprove && willComplete && (
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
              {view.mahramOptions.length > 0 ? (
                <div className="space-y-1.5">
                  <Label htmlFor={`mahram-${view.id}`} className="text-emerald-900">
                    Mahram who will chaperone the chat
                  </Label>
                  <NativeSelect id={`mahram-${view.id}`} value={mahramId} onChange={(e) => setMahramId(e.target.value)}>
                    {view.mahramOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.displayName}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              ) : (
                <p className="text-xs text-amber-800">
                  A mahram must be linked before this chat can open. Invite a wali or mahram from the{" "}
                  <Link to="/family" className="font-semibold underline">
                    Family page
                  </Link>
                  , then approve.
                </p>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {canApprove && (
              <Button
                onClick={approve}
                disabled={busy || (willComplete && view.mahramOptions.length === 0)}
                className="bg-emerald-600 text-white hover:bg-emerald-700"
              >
                <Check /> {view.canAccept ? "Accept" : "Approve"}
              </Button>
            )}
            {view.canDecline && (
              <Button variant="outline" className="border-rose-200 text-rose-600" onClick={() => setConfirm("decline")}>
                <X /> Decline
              </Button>
            )}
            {view.canWithdraw && (
              <Button variant="outline" onClick={() => setConfirm("withdraw")}>
                <Undo2 /> Withdraw
              </Button>
            )}
            {view.status === "APPROVED" && (view.perspective === "SENDER" || view.perspective === "RECEIVER") && (
              <Link to={`/chat/${view.id}`} className={cn(buttonVariants(), "bg-rose-600 text-white hover:bg-rose-700")}>
                <MessageSquare /> Open chat
              </Link>
            )}
            <Button variant="ghost" className="text-slate-500" onClick={() => setReporting(true)}>
              <Flag /> Report
            </Button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirm === "decline"}
        onOpenChange={(open) => setConfirm(open ? "decline" : null)}
        title={`Decline ${other.displayName}?`}
        description="They will be told the request was declined, without any further detail. This cannot be undone."
        confirmLabel="Decline request"
        destructive
        onConfirm={decline}
      />
      <ConfirmDialog
        open={confirm === "withdraw"}
        onOpenChange={(open) => setConfirm(open ? "withdraw" : null)}
        title="Withdraw this request?"
        description="The request will be closed and frees up one of your pending slots."
        confirmLabel="Withdraw"
        onConfirm={withdraw}
      />
      <ReportDialog userId={other.id} name={other.displayName} open={reporting} onOpenChange={setReporting} />
    </article>
  );
}
