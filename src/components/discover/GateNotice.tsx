import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { BookOpen, Hourglass, MessageSquare, Users } from "lucide-react";
import type { FeedGate } from "../../lib/contracts";
import { cn } from "../../lib/utils";
import { buttonVariants } from "../ui/button";

/** Why the viewer cannot send a request right now, or null when they can. */
export function gateBlockReason(gate: FeedGate): string | null {
  if (!gate.readinessCompleted) {
    return "Complete “Etiquette of Halal Courtship” in the Readiness Hub to unlock connection requests.";
  }
  if (gate.needsWali) return "Your requests need wali approval. Link your wali on the Family page first.";
  if (gate.activeChats >= gate.maxActiveChats) {
    return `You have ${gate.maxActiveChats} active chats, the most allowed at once. Conclude one to start another.`;
  }
  if (gate.pendingOutgoing >= gate.maxPendingOutgoing) {
    return `You have ${gate.maxPendingOutgoing} requests awaiting a reply. Wait for an answer or withdraw one first.`;
  }
  return null;
}

/** A banner with the next step whenever requests are blocked. Renders nothing otherwise. */
export function GateNotice({ gate }: { gate: FeedGate }) {
  const reason = gateBlockReason(gate);
  if (!reason) return null;

  let icon: ReactNode;
  let action: { to: string; label: string };
  if (!gate.readinessCompleted) {
    icon = <BookOpen />;
    action = { to: "/readiness/intro", label: "Start module" };
  } else if (gate.needsWali) {
    icon = <Users />;
    action = { to: "/family", label: "Invite wali" };
  } else if (gate.activeChats >= gate.maxActiveChats) {
    icon = <MessageSquare />;
    action = { to: "/chats", label: "Open chats" };
  } else {
    icon = <Hourglass />;
    action = { to: "/requests", label: "View requests" };
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-3.5 sm:flex-row sm:items-center sm:justify-between">
      <p className="flex items-start gap-2 text-sm text-amber-900 [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0">
        {icon}
        {reason}
      </p>
      <Link to={action.to} className={cn(buttonVariants(), "shrink-0 bg-amber-600 text-white hover:bg-amber-700")}>
        {action.label}
      </Link>
    </div>
  );
}
