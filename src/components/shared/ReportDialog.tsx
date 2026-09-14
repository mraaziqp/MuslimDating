import { useState } from "react";
import { toast } from "sonner";
import { api, errorMessage } from "../../lib/api";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";

interface ReportDialogProps {
  userId: string;
  name: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ReportDialog({ userId, name, open, onOpenChange }: ReportDialogProps) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const valid = reason.trim().length >= 10;

  const submit = async () => {
    setSubmitting(true);
    try {
      await api.report({ reportedId: userId, reason: reason.trim() });
      toast.success("Report submitted. Our moderators will review it confidentially.");
      setReason("");
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report {name}</DialogTitle>
          <DialogDescription>
            Reports are confidential. {name} won't be told who reported them, and they will no longer appear in your matches.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="report-reason">What happened?</Label>
          <Textarea
            id="report-reason"
            rows={4}
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Describe the behaviour (at least 10 characters)…"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={!valid || submitting} onClick={submit}>
            {submitting ? "Submitting…" : "Submit report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
