import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Bookmark,
  CircleHelp,
  Heart,
  Info,
  LayoutGrid,
  Layers,
  RefreshCw,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Undo2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { FilterSheet } from "../components/discover/FilterSheet";
import { GateNotice, gateBlockReason } from "../components/discover/GateNotice";
import { ProfileCard } from "../components/discover/ProfileCard";
import { ProfileGridCard } from "../components/discover/ProfileGridCard";
import { ProfileSheet } from "../components/discover/ProfileSheet";
import { SwipeDeck, type SwipeDeckHandle, type SwipeDirection } from "../components/discover/SwipeDeck";
import {
  EMPTY_FILTERS,
  activeFilters,
  toQuery,
  withoutFilter,
  type DiscoverFilters,
} from "../components/discover/filters";
import { EmptyState, ErrorState, PageLoader } from "../components/shared/PageState";
import { ReportDialog } from "../components/shared/ReportDialog";
import { Badge } from "../components/ui/badge";
import { Button, buttonVariants } from "../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { useCurrentUser } from "../context/AuthContext";
import { useAsync } from "../hooks/useAsync";
import { useDebouncedValue } from "../hooks/useElementWidth";
import { ApiError, api, errorMessage } from "../lib/api";
import { compatibility } from "../lib/compatibility";
import { MAX_ACTIVE_CHATS, MAX_PENDING_OUTGOING } from "../lib/constants";
import type { DiscoverProfile, FeedGate } from "../lib/contracts";
import { cn } from "../lib/utils";

type Tab = "today" | "browse" | "saved";
type ViewMode = "deck" | "grid";
/** Why a profile has left every list for the rest of this visit. */
type GoneReason = "passed" | "requested" | "reported" | "unavailable";

type LastAction =
  | { kind: "pass"; profile: DiscoverProfile }
  | { kind: "save"; profile: DiscoverProfile }
  | { kind: "request"; profile: DiscoverProfile; connectionId: string };

const PAGE_SIZE = 12;
const DECK_REFILL_AT = 3;
const VIEW_KEY = "nikahpath_discover_view";
const INTRO_KEY = "nikahpath_discover_intro_seen";
const TABS: readonly Tab[] = ["today", "browse", "saved"];

const OPEN_GATE: FeedGate = {
  readinessCompleted: true,
  needsWali: false,
  activeChats: 0,
  pendingOutgoing: 0,
  maxActiveChats: MAX_ACTIVE_CHATS,
  maxPendingOutgoing: MAX_PENDING_OUTGOING,
};

function stored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function store(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage unavailable (private mode): the preference lasts for this visit only.
  }
}

function mergeById(existing: DiscoverProfile[], incoming: DiscoverProfile[]): { merged: DiscoverProfile[]; added: number } {
  const known = new Set(existing.map((p) => p.id));
  const fresh = incoming.filter((p) => !known.has(p.id));
  return { merged: [...existing, ...fresh], added: fresh.length };
}

interface BrowseState {
  profiles: DiscoverProfile[];
  total: number;
  passedCount: number;
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  error: Error | null;
}

const EMPTY_BROWSE: BrowseState = {
  profiles: [],
  total: 0,
  passedCount: 0,
  hasMore: false,
  loading: true,
  loadingMore: false,
  error: null,
};

function RoundAction({
  label,
  shortcut,
  className,
  children,
  ...props
}: {
  label: string;
  shortcut?: string;
  className?: string;
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={shortcut ? `${label} (${shortcut})` : label}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full border bg-white shadow-md transition outline-none hover:scale-105 focus-visible:ring-4 focus-visible:ring-rose-300/60 active:scale-95 disabled:pointer-events-none disabled:opacity-35",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function DiscoverPage() {
  const user = useCurrentUser();
  const isSeeker = user.role === "SOLO" || user.role === "DEPENDENT";

  const [params, setParams] = useSearchParams();
  const requestedTab = params.get("tab");
  const tab: Tab = TABS.find((t) => t === requestedTab) ?? "today";
  const setTab = (next: Tab) => setParams(next === "today" ? {} : { tab: next }, { replace: true });

  const [view, setViewState] = useState<ViewMode>(() => (stored(VIEW_KEY) === "grid" ? "grid" : "deck"));
  const setView = (next: ViewMode) => {
    setViewState(next);
    store(VIEW_KEY, next);
  };
  const deckMode = view === "deck" && tab !== "saved";

  const [filters, setFilters] = useState<DiscoverFilters>(EMPTY_FILTERS);
  const debouncedFilters = useDebouncedValue(filters, 350);
  const query = useMemo(() => toQuery(debouncedFilters), [debouncedFilters]);
  const queryKey = JSON.stringify(query);
  const chips = activeFilters(filters);
  const filterCount = chips.length + (filters.q.trim() ? 1 : 0);

  const [gate, setGate] = useState<FeedGate>(OPEN_GATE);
  const [gone, setGone] = useState<ReadonlyMap<string, GoneReason>>(new Map());
  /** Saved from the deck this visit: still on the shortlist, but not shown in the deck again. */
  const [deckSeen, setDeckSeen] = useState<ReadonlySet<string>>(new Set());
  const [lastAction, setLastAction] = useState<LastAction | null>(null);

  const [detail, setDetail] = useState<DiscoverProfile | null>(null);
  const [reporting, setReporting] = useState<DiscoverProfile | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [introOpen, setIntroOpen] = useState(() => stored(INTRO_KEY) === null);

  const deck = useRef<SwipeDeckHandle>(null);

  // ── Data ────────────────────────────────────────────────────────────────────

  const today = useAsync(async () => {
    const feed = await api.feed();
    setGate(feed.gate);
    return feed.profiles;
  }, []);
  const saved = useAsync(async () => (await api.savedProfiles()).profiles, []);

  const [browse, setBrowse] = useState<BrowseState>(EMPTY_BROWSE);
  const browseRequest = useRef(0);
  const latest = useRef({ browse, gone, query });
  latest.current = { browse, gone, query };

  const browseNeeded = tab === "browse";
  const hideSaved = view === "deck";

  const loadBrowse = useCallback(
    async (mode: "replace" | "append") => {
      const id = ++browseRequest.current;
      const held = latest.current;
      setBrowse((s) => ({ ...s, loading: mode === "replace", loadingMore: mode === "append", error: null }));

      // Passing, saving (in the deck) and requesting all remove a profile from
      // the server's result set, so "the next page" is whatever follows the
      // profiles we still hold that the server still counts.
      let offset = 0;
      if (mode === "append") {
        if (!isSeeker) offset = held.browse.profiles.length;
        else if (!hideSaved) offset = held.browse.profiles.filter((p) => !held.gone.has(p.id)).length;
      }

      try {
        const res = await api.searchSeekers({ ...held.query, pageSize: PAGE_SIZE, offset, hideSaved: hideSaved || undefined });
        if (id !== browseRequest.current) return;
        setGate(res.gate);
        setBrowse((s) => {
          const { merged, added } =
            mode === "replace" ? { merged: res.profiles, added: res.profiles.length } : mergeById(s.profiles, res.profiles);
          return {
            profiles: merged,
            total: res.total,
            passedCount: res.passedCount,
            hasMore: res.profiles.length === PAGE_SIZE && added > 0,
            loading: false,
            loadingMore: false,
            error: null,
          };
        });
      } catch (err) {
        if (id !== browseRequest.current) return;
        const error = err instanceof Error ? err : new Error("Failed to load profiles");
        if (mode === "append") toast.error(error.message);
        setBrowse((s) => ({
          ...s,
          loading: false,
          loadingMore: false,
          hasMore: mode === "append" ? false : s.hasMore,
          error: mode === "replace" ? error : null,
        }));
      }
    },
    [isSeeker, hideSaved],
  );

  useEffect(() => {
    if (browseNeeded) void loadBrowse("replace");
  }, [browseNeeded, queryKey, loadBrowse]);

  // ── Derived lists ───────────────────────────────────────────────────────────

  const present = (profiles: DiscoverProfile[] | null) => (profiles ?? []).filter((p) => !gone.has(p.id));
  const todayList = present(today.data);
  const browseList = present(browse.profiles);
  const savedList = present(saved.data);
  const tabList = tab === "today" ? todayList : tab === "browse" ? browseList : savedList;
  const deckItems = deckMode ? tabList.filter((p) => !deckSeen.has(p.id)) : [];
  const topCard = deckItems[0] ?? null;

  const blockedReason = isSeeker
    ? gateBlockReason(gate)
    : "Preview mode: only seeker accounts can send requests, save or pass.";

  // Top the deck up before it runs dry.
  const deckRunningLow =
    deckMode && tab === "browse" && deckItems.length <= DECK_REFILL_AT && browse.hasMore && !browse.loading && !browse.loadingMore;
  useEffect(() => {
    if (deckRunningLow) void loadBrowse("append");
  }, [deckRunningLow, loadBrowse]);

  // ── Mutations ───────────────────────────────────────────────────────────────

  const markGone = (id: string, reason: GoneReason) => setGone((prev) => new Map(prev).set(id, reason));
  const restore = (id: string) =>
    setGone((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });

  /** Applies a change to one profile wherever it is currently shown. */
  const patchProfile = (id: string, change: Partial<DiscoverProfile>) => {
    const patch = (list: DiscoverProfile[] | null) => (list ? list.map((p) => (p.id === id ? { ...p, ...change } : p)) : list);
    today.setData(patch);
    setBrowse((s) => ({ ...s, profiles: patch(s.profiles) ?? s.profiles }));
    saved.setData(patch);
    setDetail((open) => (open?.id === id ? { ...open, ...change } : open));
  };

  /** Keeps the saved flag (and the shortlist itself) consistent across all three tabs. A note only exists while saved. */
  const applySaved = (profile: DiscoverProfile, isSaved: boolean, note: string | null = null) => {
    patchProfile(profile.id, { saved: isSaved, note: isSaved ? note : null });
    saved.setData((list) => {
      const others = (list ?? []).filter((p) => p.id !== profile.id);
      return isSaved ? [{ ...profile, saved: true, note }, ...others] : others;
    });
  };

  /** Restores a save that an action replaced, including the note that went with it. */
  const resave = async (profile: DiscoverProfile) => {
    await api.react(profile.id, "SAVED");
    if (profile.note) await api.saveNote(profile.id, profile.note);
    applySaved(profile, true, profile.note);
  };

  const saveNote = async (profile: DiscoverProfile, text: string) => {
    const note = text.trim() || null;
    if (note === profile.note) return;
    patchProfile(profile.id, { note });
    try {
      await api.saveNote(profile.id, note);
      toast.success(note ? "Note saved. Only you can see it." : "Note removed.");
    } catch (err) {
      patchProfile(profile.id, { note: profile.note });
      toast.error(errorMessage(err));
    }
  };

  const pass = async (profile: DiscoverProfile) => {
    markGone(profile.id, "passed");
    setLastAction({ kind: "pass", profile });
    setDetail(null);
    if (!isSeeker) return;
    try {
      await api.react(profile.id, "PASSED");
    } catch (err) {
      restore(profile.id);
      toast.error(errorMessage(err));
    }
  };

  /** Deck swipe-up: keep them on the shortlist and move on to the next card. */
  const saveAndContinue = async (profile: DiscoverProfile) => {
    setDeckSeen((prev) => new Set(prev).add(profile.id));
    setLastAction({ kind: "save", profile });
    setDetail(null);
    if (profile.saved) return;
    applySaved(profile, true);
    try {
      await api.react(profile.id, "SAVED");
    } catch (err) {
      applySaved(profile, false);
      toast.error(errorMessage(err));
    }
  };

  const toggleSave = async (profile: DiscoverProfile) => {
    const next = !profile.saved;
    applySaved(profile, next);
    try {
      if (next) await api.react(profile.id, "SAVED");
      else await api.clearReaction(profile.id);
    } catch (err) {
      applySaved(profile, !next, profile.note);
      toast.error(errorMessage(err));
    }
  };

  const undo = async (action: LastAction) => {
    setLastAction((current) => (current === action ? null : current));
    const { profile } = action;
    try {
      if (action.kind === "pass") {
        restore(profile.id);
        if (isSeeker) {
          // A pass replaced whatever reaction was there, so put the save back if there was one.
          if (profile.saved) await resave(profile);
          else await api.clearReaction(profile.id);
        }
      } else if (action.kind === "save") {
        setDeckSeen((prev) => {
          const next = new Set(prev);
          next.delete(profile.id);
          return next;
        });
        if (!profile.saved) {
          applySaved(profile, false);
          await api.clearReaction(profile.id);
        }
      } else {
        await api.withdraw(action.connectionId);
        restore(profile.id);
        setGate((g) => ({ ...g, pendingOutgoing: Math.max(0, g.pendingOutgoing - 1) }));
        // Sending a request took them off the shortlist; put them back where they were.
        if (profile.saved) await resave(profile);
        toast.info(`Request to ${profile.displayName} withdrawn.`);
      }
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const sendRequest = async (profile: DiscoverProfile) => {
    if (blockedReason) {
      setNotice(blockedReason);
      return;
    }
    setSending(profile.id);
    markGone(profile.id, "requested");
    setDetail(null);
    try {
      const connection = await api.requestConnection(profile.id);
      const action: LastAction = { kind: "request", profile, connectionId: connection.id };
      setLastAction(action);
      setGate((g) => ({ ...g, pendingOutgoing: g.pendingOutgoing + 1 }));
      if (profile.saved) applySaved(profile, false);
      toast.success(
        connection.status === "PENDING_MALE_PARENT"
          ? `Sent to your wali first — they review it before ${profile.displayName} sees it.`
          : `Request sent to ${profile.displayName}${profile.waliInvolved ? " and their wali" : ""}.`,
        { action: { label: "Undo", onClick: () => void undo(action) } },
      );
    } catch (err) {
      const code = err instanceof ApiError ? err.code : "";
      if (code === "RECIPIENT_UNAVAILABLE" || code === "CONNECTION_EXISTS") {
        markGone(profile.id, "unavailable");
        toast.error(errorMessage(err));
      } else {
        restore(profile.id);
        if (code === "ACTIVE_CHAT_LIMIT" || code === "PENDING_LIMIT" || code === "WALI_REQUIRED" || code === "READINESS_REQUIRED") {
          setNotice(errorMessage(err));
        } else {
          toast.error(errorMessage(err));
        }
      }
    } finally {
      setSending(null);
    }
  };

  const bringBackPassed = async () => {
    try {
      await api.resetPasses();
      setGone((prev) => new Map([...prev].filter(([, reason]) => reason !== "passed")));
      setLastAction(null);
      void today.reload({ silent: true });
      if (browseNeeded) void loadBrowse("replace");
      toast.success("Passed profiles are back in Discover.");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  // ── Deck wiring ─────────────────────────────────────────────────────────────

  const canSwipe = (_profile: DiscoverProfile, direction: SwipeDirection) => {
    if (direction === "left") return true;
    if (direction === "up") {
      if (!isSeeker) setNotice("Preview mode: only seeker accounts can save profiles.");
      return isSeeker;
    }
    if (blockedReason) setNotice(blockedReason);
    return blockedReason === null;
  };

  const onSwipe = (profile: DiscoverProfile, direction: SwipeDirection) => {
    if (direction === "left") void pass(profile);
    else if (direction === "up") void saveAndContinue(profile);
    else void sendRequest(profile);
  };

  const introVisible = introOpen && deckMode;
  const dialogOpen = detail !== null || reporting !== null || notice !== null || filtersOpen || introVisible;
  const shortcuts = useRef({ undo, lastAction, topCard });
  shortcuts.current = { undo, lastAction, topCard };

  useEffect(() => {
    if (!deckMode || dialogOpen) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest("input, textarea, select, [contenteditable]")) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      // Enter and Space keep their normal meaning on a focused button or link.
      const onControl = target?.closest("button, a") != null;
      const { topCard: top, lastAction: last, undo: undoLast } = shortcuts.current;
      if (event.key === "ArrowLeft") deck.current?.swipe("left");
      else if (event.key === "ArrowRight") deck.current?.swipe("right");
      else if (event.key === "ArrowUp") deck.current?.swipe("up");
      else if ((event.key === "Enter" || event.key === " ") && top && !onControl) setDetail(top);
      else if ((event.key === "Backspace" || event.key.toLowerCase() === "z") && last) void undoLast(last);
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deckMode, dialogOpen]);

  const closeIntro = () => {
    setIntroOpen(false);
    store(INTRO_KEY, "1");
  };

  // ── Rendering ───────────────────────────────────────────────────────────────

  const loading = tab === "today" ? today.loading && !today.data : tab === "browse" ? browse.loading : saved.loading && !saved.data;
  const error = tab === "today" ? today.error : tab === "browse" ? browse.error : saved.error;
  const retry = () => {
    if (tab === "today") void today.reload();
    else if (tab === "browse") void loadBrowse("replace");
    else void saved.reload();
  };
  const passedThisVisit = [...gone.values()].some((reason) => reason === "passed");
  const canBringBack = isSeeker && (browse.passedCount > 0 || passedThisVisit);

  const emptyState = () => {
    if (tab === "saved") {
      return (
        <EmptyState
          icon={<Bookmark />}
          title="Nothing saved yet"
          description="Swipe a card up, or tap the bookmark, to keep someone here while you think it over or talk to your family."
          action={
            <Button onClick={() => setTab("browse")} className="bg-rose-600 text-white hover:bg-rose-700">
              Browse profiles
            </Button>
          }
        />
      );
    }
    if (tab === "today") {
      return (
        <EmptyState
          icon={<Sparkles />}
          title="That's everyone for today"
          description="Your picks refresh every day. In the meantime you can browse everyone who is available."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => setTab("browse")} className="bg-rose-600 text-white hover:bg-rose-700">
                <Search /> Browse everyone
              </Button>
              <Link to="/requests" className={buttonVariants({ variant: "outline" })}>
                View your requests
              </Link>
            </div>
          }
        />
      );
    }
    return (
      <EmptyState
        icon={<Sparkles />}
        title={chips.length > 0 || filters.q ? "No one matches these filters" : "You have seen everyone for now"}
        description={
          chips.length > 0 || filters.q
            ? "Try widening your filters. New members join regularly."
            : "New members join regularly — check back soon, or revisit the profiles you saved."
        }
        action={
          <div className="flex flex-wrap justify-center gap-2">
            {(chips.length > 0 || filters.q) && (
              <Button variant="outline" onClick={() => setFilters(EMPTY_FILTERS)}>
                <RotateCcw /> Clear filters
              </Button>
            )}
            {canBringBack && (
              <Button variant="outline" onClick={() => void bringBackPassed()}>
                <RefreshCw /> Review passed profiles again
              </Button>
            )}
            {deckSeen.size > 0 && (
              <Button variant="outline" onClick={() => setTab("saved")}>
                <Bookmark /> View saved
              </Button>
            )}
          </div>
        }
      />
    );
  };

  const tabButton = (value: Tab, label: string, count?: number) => (
    <button
      key={value}
      type="button"
      role="tab"
      aria-selected={tab === value}
      onClick={() => setTab(value)}
      className={cn(
        "flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl px-2 text-sm font-semibold whitespace-nowrap transition-colors sm:px-3",
        tab === value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800",
      )}
    >
      {label}
      {count !== undefined && count > 0 && (
        <span className={cn("rounded-full px-1.5 text-xs", tab === value ? "bg-rose-100 text-rose-700" : "bg-slate-200 text-slate-600")}>
          {count}
        </span>
      )}
    </button>
  );

  const body = () => {
    if (loading) return deckMode ? <DeckSkeleton /> : <PageLoader label="Finding profiles…" />;
    if (error) return <ErrorState error={error} onRetry={retry} />;

    if (deckMode) {
      if (deckItems.length === 0) {
        if (tab === "browse" && (browse.loadingMore || browse.hasMore)) return <DeckSkeleton />;
        return <div className="flex flex-1 items-center justify-center">{emptyState()}</div>;
      }
      return (
        <>
          <div className="flex min-h-0 flex-1 items-center justify-center pb-3">
            <SwipeDeck
              ref={deck}
              items={deckItems}
              getKey={(profile) => profile.id}
              renderCard={(profile) => <ProfileCard profile={profile} compatibility={compatibility(user, profile)} />}
              canSwipe={canSwipe}
              onSwipe={onSwipe}
              onOpen={setDetail}
              className="h-full max-h-[40rem] w-full max-w-sm"
            />
          </div>
          <div className="flex shrink-0 items-center justify-center gap-2.5 min-[380px]:gap-3 sm:gap-4">
            <RoundAction
              label="Undo"
              shortcut="Z"
              disabled={lastAction === null}
              onClick={() => lastAction && void undo(lastAction)}
              className="size-10 border-slate-200 text-slate-500 min-[380px]:size-11"
            >
              <Undo2 className="size-5" />
            </RoundAction>
            <RoundAction label="Pass" shortcut="←" onClick={() => deck.current?.swipe("left")} className="size-13 border-slate-200 text-slate-600 min-[380px]:size-14">
              <X className="size-7" strokeWidth={2.5} />
            </RoundAction>
            <RoundAction
              label="Save for later"
              shortcut="↑"
              onClick={() => deck.current?.swipe("up")}
              className="size-11 border-amber-200 text-amber-500 min-[380px]:size-12"
            >
              <Bookmark className="size-5 fill-current" />
            </RoundAction>
            <RoundAction
              label="Send a connection request"
              shortcut="→"
              disabled={sending !== null}
              onClick={() => deck.current?.swipe("right")}
              className="size-15 border-rose-600 bg-rose-600 text-white shadow-lg shadow-rose-600/30 min-[380px]:size-16"
            >
              <Heart className="size-7 fill-current" />
            </RoundAction>
            <RoundAction
              label="View full profile"
              shortcut="Enter"
              onClick={() => topCard && setDetail(topCard)}
              className="size-10 border-slate-200 text-slate-500 min-[380px]:size-11"
            >
              <Info className="size-5" />
            </RoundAction>
          </div>
        </>
      );
    }

    if (tabList.length === 0) return emptyState();
    return (
      <>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {tabList.map((profile) => (
            <ProfileGridCard
              key={profile.id}
              profile={profile}
              compatibility={compatibility(user, profile)}
              onOpen={setDetail}
              onInterested={(p) => void sendRequest(p)}
              onPass={tab === "saved" ? (p) => void toggleSave(p) : (p) => void pass(p)}
              passLabel={tab === "saved" ? "Remove" : "Pass"}
              onToggleSave={isSeeker && tab !== "saved" ? (p) => void toggleSave(p) : undefined}
              requestDisabled={!isSeeker}
              busy={sending === profile.id}
            />
          ))}
        </div>
        {tab === "browse" && browse.hasMore && (
          <div className="pt-2 text-center">
            <Button variant="outline" className="h-10 rounded-xl px-5" disabled={browse.loadingMore} onClick={() => void loadBrowse("append")}>
              {browse.loadingMore ? (
                <>
                  <RefreshCw className="animate-spin" /> Loading…
                </>
              ) : (
                "Show more profiles"
              )}
            </Button>
          </div>
        )}
      </>
    );
  };

  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 pt-3 sm:gap-4 sm:px-6 sm:pt-6",
        // The deck fills the viewport between the top bar and the mobile tab bar.
        deckMode && "h-[max(calc(100dvh-var(--nav-h)-var(--tabbar-h)-var(--safe-bottom)-var(--page-pb)),26rem)]",
      )}
    >
      <header className={cn("flex-wrap items-end justify-between gap-3", deckMode ? "hidden sm:flex" : "flex")}>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Discover</h1>
          <p className="text-sm text-slate-600">
            Swipe with intention: every request is reviewed, chaperoned, and limited to a few at a time.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!isSeeker && <Badge className="h-7 bg-purple-100 px-3 text-purple-800">Preview mode</Badge>}
          <Badge variant="outline" className="h-7 bg-white px-3 text-slate-600">
            {gate.activeChats}/{gate.maxActiveChats} active chats
          </Badge>
          <Badge variant="outline" className="h-7 bg-white px-3 text-slate-600">
            {gate.pendingOutgoing}/{gate.maxPendingOutgoing} pending requests
          </Badge>
        </div>
      </header>

      {isSeeker && <GateNotice gate={gate} />}

      {/* Stacked on phones and tablets; side by side on wide screens, where height is the scarcer resource for the deck. */}
      <div className="flex shrink-0 flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
        <div role="tablist" aria-label="Discover" className="flex shrink-0 gap-1 rounded-2xl bg-slate-200/70 p-1 sm:max-w-md lg:w-96">
          {tabButton("today", "Today", todayList.length)}
          {tabButton("browse", "Browse")}
          {tabButton("saved", "Saved", savedList.length)}
        </div>

        {/* One utility row for every tab, so the deck below never shifts when switching. */}
        <div className="flex min-h-10 min-w-0 shrink-0 items-center gap-2 lg:flex-1">
          {tab === "browse" ? (
            <>
              {/* In the phone deck the keyword box lives in the filter sheet, leaving the height to the card. */}
              <div className={cn("relative flex-1", deckMode && "hidden sm:block")}>
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
                <Input
                  type="search"
                  value={filters.q}
                  onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
                  placeholder="Search name, city, profession…"
                  maxLength={120}
                  aria-label="Search profiles"
                  className="h-10 rounded-xl bg-white pl-9"
                />
              </div>
              <Button
                variant="outline"
                className={cn("h-10 rounded-xl bg-white px-3", deckMode && "max-sm:flex-1 max-sm:justify-start")}
                onClick={() => setFiltersOpen(true)}
              >
                <SlidersHorizontal />
                {deckMode ? (
                  <>
                    <span className="truncate sm:hidden">{filters.q.trim() ? `“${filters.q.trim()}”` : "Search & filters"}</span>
                    <span className="hidden sm:inline">Filters</span>
                  </>
                ) : (
                  "Filters"
                )}
                {filterCount > 0 && (
                  <span className="ml-auto flex size-5 shrink-0 items-center justify-center rounded-full bg-rose-600 text-xs font-bold text-white">
                    {filterCount}
                  </span>
                )}
              </Button>
            </>
          ) : (
            <p className="min-w-0 flex-1 truncate text-sm text-slate-500">
              {tab === "today"
                ? "Chosen for you today"
                : savedList.length === 0
                  ? "Your private shortlist"
                  : `${savedList.length} saved · only you can see this list`}
            </p>
          )}
          {tab !== "saved" && (
            <div className="flex shrink-0 items-center gap-1 rounded-2xl bg-slate-200/70 p-1">
              {(
                [
                  ["deck", "Card view", <Layers key="deck" className="size-4" />],
                  ["grid", "Grid view", <LayoutGrid key="grid" className="size-4" />],
                ] as const
              ).map(([mode, label, icon]) => (
                <button
                  key={mode}
                  type="button"
                  aria-label={label}
                  aria-pressed={view === mode}
                  title={label}
                  onClick={() => setView(mode)}
                  className={cn(
                    "flex h-9 w-10 items-center justify-center rounded-xl transition-colors",
                    view === mode ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800",
                  )}
                >
                  {icon}
                </button>
              ))}
            </div>
          )}
          {deckMode && (
            <button
              type="button"
              aria-label="How Discover works"
              title="How Discover works"
              onClick={() => setIntroOpen(true)}
              className="flex size-10 shrink-0 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-200/70 hover:text-slate-800"
            >
              <CircleHelp className="size-5" />
            </button>
          )}
        </div>

      </div>

      {tab === "browse" && chips.length > 0 && (
        <div className={cn("no-scrollbar -mx-4 shrink-0 items-center gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0", deckMode ? "hidden sm:flex" : "flex")}>
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => setFilters((f) => withoutFilter(f, chip.key))}
              className="flex h-8 shrink-0 items-center gap-1 rounded-full border border-rose-200 bg-rose-50 pr-2 pl-3 text-xs font-medium text-rose-700 hover:bg-rose-100"
              aria-label={`Remove filter: ${chip.label}`}
            >
              {chip.label} <X className="size-3.5" />
            </button>
          ))}
          <button
            type="button"
            onClick={() => setFilters((f) => ({ ...EMPTY_FILTERS, q: f.q }))}
            className="h-8 shrink-0 px-2 text-xs font-medium text-slate-500 hover:text-slate-800"
          >
            Clear all
          </button>
        </div>
      )}

      {body()}

      <ProfileSheet
        profile={detail}
        compatibility={detail ? compatibility(user, detail) : null}
        onClose={() => setDetail(null)}
        onInterested={(profile) => void sendRequest(profile)}
        onPass={tab === "saved" ? undefined : (profile) => void pass(profile)}
        onToggleSave={isSeeker ? (profile) => void toggleSave(profile) : undefined}
        onSaveNote={isSeeker ? (profile, text) => void saveNote(profile, text) : undefined}
        onReport={(profile) => {
          setDetail(null);
          setReporting(profile);
        }}
        blockedReason={blockedReason}
        busy={sending !== null}
      />

      <FilterSheet
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        filters={filters}
        onChange={setFilters}
        resultCount={browse.loading || filters !== debouncedFilters ? null : browse.total}
        showGender={!isSeeker}
      />

      <Dialog open={notice !== null} onOpenChange={(open) => !open && setNotice(null)}>
        <DialogContent className="rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">Not just yet</DialogTitle>
            <DialogDescription className="text-sm text-slate-600">{notice}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setNotice(null)} className="bg-rose-600 text-white hover:bg-rose-700">
              Understood
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={introVisible} onOpenChange={(open) => !open && closeIntro()}>
        <DialogContent className="rounded-3xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">How Discover works</DialogTitle>
            <DialogDescription>Three gestures, each one deliberate. Buttons and arrow keys do the same.</DialogDescription>
          </DialogHeader>
          <ul className="space-y-3 text-sm text-slate-700">
            <li className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-rose-600 text-white">
                <Heart className="size-4 fill-current" />
              </span>
              <span>
                <strong className="block text-slate-900">Swipe right to send a request</strong>
                It is a real request, reviewed by walis where they are involved. You can hold {gate.maxPendingOutgoing} at a
                time and undo straight away.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                <Bookmark className="size-4 fill-current" />
              </span>
              <span>
                <strong className="block text-slate-900">Swipe up to save for later</strong>
                Keep someone on your shortlist while you make istikhara or talk to your family.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                <X className="size-4" strokeWidth={2.5} />
              </span>
              <span>
                <strong className="block text-slate-900">Swipe left to pass</strong>
                Private and kind: they are never told, and the profile stays out of your way.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                <Info className="size-4" />
              </span>
              <span>
                <strong className="block text-slate-900">Tap a card for the full profile</strong>
                Read the whole biodata and what you have in common before deciding.
              </span>
            </li>
          </ul>
          <DialogFooter>
            <Button onClick={closeIntro} className="h-9 bg-rose-600 px-4 text-white hover:bg-rose-700">
              Bismillah, let's begin
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {reporting && (
        <ReportDialog
          userId={reporting.id}
          name={reporting.displayName}
          open
          onOpenChange={(open) => !open && setReporting(null)}
          onReported={() => markGone(reporting.id, "reported")}
        />
      )}
    </div>
  );
}

function DeckSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center pb-3" role="status" aria-label="Loading profiles">
      <div className="h-full max-h-[40rem] w-full max-w-sm animate-pulse rounded-[1.75rem] bg-slate-200/80" />
    </div>
  );
}
