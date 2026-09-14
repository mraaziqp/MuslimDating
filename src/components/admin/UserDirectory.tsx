import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Search, ShieldCheck } from "lucide-react";
import { useAsync } from "../../hooks/useAsync";
import { useDebouncedValue } from "../../hooks/useElementWidth";
import { api } from "../../lib/api";
import { ACCOUNT_STATUSES, ALL_ROLES, ROLE_LABELS, oneOf } from "../../lib/constants";
import type { AccountStatus, AdminUserRow, UserRole } from "../../lib/contracts";
import { timeAgo } from "../../lib/format";
import { cn } from "../../lib/utils";
import { ErrorState, PageLoader } from "../shared/PageState";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { NativeSelect } from "../ui/native-select";
import { AccountActionDialog } from "./AccountActionDialog";

const PAGE_SIZE = 20;

export function AccountStatusBadge({ status }: { status: AccountStatus }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-full border px-2 text-[11px] font-semibold",
        status === "ACTIVE" && "border-emerald-200 bg-emerald-50 text-emerald-700",
        status === "SUSPENDED" && "border-amber-200 bg-amber-50 text-amber-800",
        status === "BANNED" && "border-rose-200 bg-rose-50 text-rose-700",
      )}
    >
      {status === "ACTIVE" ? "Active" : status === "SUSPENDED" ? "Suspended" : "Banned"}
    </span>
  );
}

export function UserDirectory({ onViewUser }: { onViewUser: (userId: string) => void }) {
  const [search, setSearch] = useState("");
  const q = useDebouncedValue(search.trim(), 300);
  const [role, setRole] = useState<UserRole | null>(null);
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [page, setPage] = useState(1);
  const [managing, setManaging] = useState<AdminUserRow | null>(null);

  useEffect(() => setPage(1), [q, role, status]);

  const users = useAsync(
    () => api.admin.users({ page, pageSize: PAGE_SIZE, q: q || undefined, role: role ?? undefined, status: status ?? undefined }),
    [page, q, role, status],
  );

  const totalPages = users.data ? Math.max(1, Math.ceil(users.data.total / PAGE_SIZE)) : 1;
  const replace = (row: AdminUserRow) =>
    users.setData((prev) => (prev ? { ...prev, items: prev.items.map((u) => (u.id === row.id ? row : u)) } : prev));

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, username, email or phone"
            className="h-9 pl-8"
            aria-label="Search users"
          />
        </div>
        <NativeSelect className="sm:w-48" value={role ?? ""} onChange={(e) => setRole(oneOf(ALL_ROLES, e.target.value))} aria-label="Filter by role">
          <option value="">All roles</option>
          {ALL_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          className="sm:w-40"
          value={status ?? ""}
          onChange={(e) => setStatus(oneOf(ACCOUNT_STATUSES, e.target.value))}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          {ACCOUNT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.charAt(0) + s.slice(1).toLowerCase()}
            </option>
          ))}
        </NativeSelect>
      </div>

      {users.loading && !users.data ? (
        <PageLoader label="Loading users…" />
      ) : users.error || !users.data ? (
        <ErrorState error={users.error ?? new Error("No data")} onRetry={() => void users.reload()} />
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white">
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Member</th>
                  <th className="px-3 py-2 font-medium">Role</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 text-right font-medium">Reports</th>
                  <th className="px-3 py-2 text-right font-medium">Active chats</th>
                  <th className="px-3 py-2 font-medium">Joined</th>
                  <th className="px-3 py-2 font-medium">Last seen</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {users.data.items.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/60">
                    <td className="px-3 py-2.5">
                      <button type="button" onClick={() => onViewUser(u.id)} className="text-left hover:underline">
                        <span className="flex items-center gap-1 font-medium text-slate-900">
                          {u.displayName ?? <span className="text-slate-400 italic">No name</span>}
                          {u.readinessCompleted && <ShieldCheck className="size-3.5 text-emerald-500" aria-label="Readiness certified" />}
                        </span>
                        <span className="block text-xs text-slate-500">
                          {u.username && <span className="font-mono">@{u.username} · </span>}
                          {u.email}
                          {u.phone && ` · ${u.phone}`}
                        </span>
                      </button>
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">{ROLE_LABELS[u.role]}</td>
                    <td className="px-3 py-2.5">
                      <AccountStatusBadge status={u.accountStatus} />
                    </td>
                    <td className={cn("px-3 py-2.5 text-right tabular-nums", u.reportCount > 0 ? "font-semibold text-rose-700" : "text-slate-500")}>
                      {u.reportCount}
                    </td>
                    <td className="px-3 py-2.5 text-right text-slate-600 tabular-nums">{u.activeChats}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-500">{new Date(u.createdAt).toLocaleDateString()}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-500">{u.lastSeenAt ? timeAgo(u.lastSeenAt) : "—"}</td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      <Button variant="ghost" size="sm" onClick={() => onViewUser(u.id)}>
                        View
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setManaging(u)}>
                        Manage
                      </Button>
                    </td>
                  </tr>
                ))}
                {users.data.items.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-10 text-center text-slate-500">
                      No users match these filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-sm text-slate-500">
            <span>
              {users.data.total.toLocaleString()} user{users.data.total === 1 ? "" : "s"} · page {page} of {totalPages}
            </span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft /> Previous
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Next <ChevronRight />
              </Button>
            </div>
          </div>
        </>
      )}

      <AccountActionDialog user={managing} onClose={() => setManaging(null)} onUpdated={replace} />
    </div>
  );
}
