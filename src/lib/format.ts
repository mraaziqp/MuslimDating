import { formatDistanceToNowStrict } from "date-fns";
import type { ConnectionStatus, ConnectionView, PublicProfile } from "./contracts";

export function timeAgo(iso: string): string {
  return `${formatDistanceToNowStrict(new Date(iso))} ago`;
}

export function initials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");
}

export const STATUS_LABELS: Record<ConnectionStatus, string> = {
  PENDING_MALE_PARENT: "Awaiting sender's wali",
  PENDING_FEMALE_PARENT: "Awaiting recipient side",
  APPROVED: "Active chat",
  REJECTED: "Declined",
  TERMINATED: "Closed",
};

export function closedReasonLabel(reason: string | null): string | null {
  if (!reason) return null;
  if (reason === "INACTIVITY") return "Unmatched automatically after 3 days without replies";
  if (reason === "WITHDRAWN") return "Request withdrawn";
  if (reason === "ACCOUNT_BANNED") return "Closed by moderation";
  if (reason === "ROLE_CHANGED" || reason === "MAHRAM_ROLE_REMOVED") return "Closed after an account change";
  if (reason.startsWith("DECLINED_BY_RECEIVER_GUARDIAN")) return "Declined by the recipient's wali";
  if (reason.startsWith("DECLINED_BY_SENDER_GUARDIAN")) return "Declined by the sender's wali";
  if (reason.startsWith("DECLINED_BY_RECEIVER")) return "Declined by the recipient";
  if (reason.startsWith("ENDED_BY_")) {
    const note = reason.split(": ").slice(1).join(": ");
    return note ? `Ended — “${note}”` : "Ended by a participant";
  }
  return reason;
}

/** The other seeker from the viewer's point of view (guardians see the non-child party). */
export function counterpart(view: ConnectionView): PublicProfile {
  switch (view.perspective) {
    case "SENDER":
    case "SENDER_GUARDIAN":
      return view.receiver;
    default:
      return view.sender;
  }
}

export function yourSide(view: ConnectionView): PublicProfile {
  return counterpart(view).id === view.sender.id ? view.receiver : view.sender;
}
