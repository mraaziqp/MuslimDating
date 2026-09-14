import type { ConnectionStatus } from "../../lib/contracts";
import { STATUS_LABELS } from "../../lib/format";
import { cn } from "../../lib/utils";

const TONES: Record<ConnectionStatus, string> = {
  PENDING_MALE_PARENT: "bg-amber-50 text-amber-700 border-amber-200",
  PENDING_FEMALE_PARENT: "bg-amber-50 text-amber-700 border-amber-200",
  APPROVED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  REJECTED: "bg-slate-100 text-slate-600 border-slate-200",
  TERMINATED: "bg-slate-100 text-slate-600 border-slate-200",
};

export function StatusBadge({ status, className }: { status: ConnectionStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-full border px-2 text-[11px] font-semibold whitespace-nowrap",
        TONES[status],
        className,
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
