import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  BookOpen,
  Bookmark,
  BookmarkCheck,
  Briefcase,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Filter,
  Flag,
  GraduationCap,
  Heart,
  Lock,
  MapPin,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  Utensils,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { EmptyState, ErrorState, PageHeader } from "../components/shared/PageState";
import { ProtectedPhoto } from "../components/shared/ProtectedPhoto";
import { ReportDialog } from "../components/shared/ReportDialog";
import { Badge } from "../components/ui/badge";
import { Button, buttonVariants } from "../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { NativeSelect } from "../components/ui/native-select";
import { useAuth } from "../context/AuthContext";
import { ApiError, api, errorMessage } from "../lib/api";
import {
  DIETARY_HABITS,
  EDUCATION_LEVELS,
  MARITAL_STATUSES,
  PRAYER_FREQUENCIES,
} from "../lib/constants";
import type { FeedGate, PublicProfile, SeekerSearchQuery, SelfUser } from "../lib/contracts";
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

/** Islamic Ta'aruf Protocol guiding card */
function TaarufMethodGuide() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="overflow-hidden rounded-3xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/90 via-white to-teal-50/50 shadow-xs">
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100/80 px-3 py-1 text-xs font-semibold text-emerald-800">
              <ShieldCheck className="size-3.5 text-emerald-700" />
              The Halal Ta&apos;aruf Protocol
            </div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
              Spouse Seeking Grounded in Deen &amp; Sunnah
            </h2>
            <p className="text-sm text-slate-600">
              NikahPath is designed for intentional marriage (Nikah), not superficial dating. Follow our five principles to keep your search blessed and dignified.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setExpanded((prev) => !prev)}
            className="shrink-0 border-emerald-200 bg-white text-emerald-800 hover:bg-emerald-50"
          >
            {expanded ? (
              <>
                <ChevronUp className="size-4" /> Close guide
              </>
            ) : (
              <>
                <ChevronDown className="size-4" /> View 5 steps
              </>
            )}
          </Button>
        </div>

        {expanded && (
          <div className="mt-6 grid gap-4 border-t border-emerald-100 pt-6 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-2xl border border-emerald-100/60 bg-white/80 p-4 shadow-2xs">
              <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-emerald-800 uppercase">
                <span className="flex size-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-800">1</span>
                Sincere Intention (Niyyah)
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-600">
                Begin in the name of Allah with the intention to complete half your deen and build a pious household. Accompany your search with Istikhara.
              </p>
            </div>

            <div className="rounded-2xl border border-emerald-100/60 bg-white/80 p-4 shadow-2xs">
              <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-emerald-800 uppercase">
                <span className="flex size-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-800">2</span>
                Deen &amp; Akhlaq First
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-600">
                The Prophet ﷺ advised: &ldquo;Marry the one of piety.&rdquo; Focus on prayer commitment, halal lifestyle, character, and shared life goals.
              </p>
            </div>

            <div className="rounded-2xl border border-emerald-100/60 bg-white/80 p-4 shadow-2xs">
              <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-emerald-800 uppercase">
                <span className="flex size-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-800">3</span>
                Preserved Modesty (Haya&apos;)
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-600">
                Photos are protected by default to lower the gaze and foster respect. Mutual consent is required before photos are unveiled in an approved courtship.
              </p>
            </div>

            <div className="rounded-2xl border border-emerald-100/60 bg-white/80 p-4 shadow-2xs">
              <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-emerald-800 uppercase">
                <span className="flex size-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-800">4</span>
                Wali &amp; Family Involvement
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-600">
                Guardians protect and advocate. Involving walis early avoids disappointment and preserves family honour and divine blessing (barakah).
              </p>
            </div>

            <div className="rounded-2xl border border-emerald-100/60 bg-white/80 p-4 shadow-2xs sm:col-span-2 lg:col-span-2">
              <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-emerald-800 uppercase">
                <span className="flex size-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-800">5</span>
                Purposeful Pacing &amp; 3-Day Rule
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-600">
                Chats feature family lounge discussions and direct suitor chats. To prevent ghosting, connections without messages for 3 days unmatch automatically.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Calculates an authentic Islamic deen and values alignment percentage */
function calculateDeenMatch(profile: PublicProfile, currentUser: SelfUser | null): number {
  if (!currentUser) return 85;
  let score = 50;

  // Prayer alignment (+20%)
  if (currentUser.prayerFrequency && profile.prayerFrequency) {
    if (currentUser.prayerFrequency === profile.prayerFrequency) score += 20;
    else if (
      (currentUser.prayerFrequency === "Always" && profile.prayerFrequency === "Usually") ||
      (currentUser.prayerFrequency === "Usually" && profile.prayerFrequency === "Always")
    ) {
      score += 12;
    }
  } else {
    score += 10;
  }

  // Dietary habits alignment (+15%)
  if (currentUser.dietaryHabits && profile.dietaryHabits) {
    if (currentUser.dietaryHabits === profile.dietaryHabits) score += 15;
    else score += 8;
  } else {
    score += 8;
  }

  // Readiness modules completed (+15%)
  const modulesCount = profile.completedModules?.length ?? 0;
  score += Math.min(15, modulesCount * 5);

  return Math.min(99, Math.max(65, score));
}

const CITY_PRESETS = ["Cape Town", "Johannesburg", "Durban", "Pretoria", "London", "Birmingham"];

export function SearchPage() {
  const { user } = useAuth();

  // Search state
  const [q, setQ] = useState("");
  const [location, setLocation] = useState("");
  const [gender, setGender] = useState<"male" | "female" | "">("");
  const [minAge, setMinAge] = useState<number | undefined>(undefined);
  const [maxAge, setMaxAge] = useState<number | undefined>(undefined);
  const [prayerFrequency, setPrayerFrequency] = useState<string>("");
  const [dietaryHabits, setDietaryHabits] = useState<string>("");
  const [maritalStatus, setMaritalStatus] = useState<string>("");
  const [education, setEducation] = useState<string>("");
  const [waliInvolved, setWaliInvolved] = useState<boolean | undefined>(undefined);
  const [sortBy, setSortBy] = useState<"recent" | "age_asc" | "age_desc" | "readiness">("recent");

  // Advanced filters visibility
  const [showFilters, setShowFilters] = useState(false);

  // Shortlisting (Favorites) stored in localStorage
  const [shortlist, setShortlist] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("nikahpath_shortlist") || "[]") as string[];
    } catch {
      return [];
    }
  });
  const [activeTab, setActiveTab] = useState<"all" | "shortlist">("all");

  const toggleShortlist = (id: string) => {
    setShortlist((prev) => {
      const next = prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id];
      try {
        localStorage.setItem("nikahpath_shortlist", JSON.stringify(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  };

  // Pagination & items
  const [page, setPage] = useState(1);
  const [profiles, setProfiles] = useState<PublicProfile[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [gate, setGate] = useState<FeedGate>({
    readinessCompleted: true,
    needsWali: false,
    activeChats: 0,
    pendingOutgoing: 0,
    maxActiveChats: 3,
    maxPendingOutgoing: 5,
  });

  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Interaction modals
  const [selectedBiodata, setSelectedBiodata] = useState<PublicProfile | null>(null);
  const [biodataTab, setBiodataTab] = useState<"deen" | "background" | "family">("deen");
  const [confirmRequestFor, setConfirmRequestFor] = useState<PublicProfile | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const [limitMessage, setLimitMessage] = useState<string | null>(null);
  const [reporting, setReporting] = useState<PublicProfile | null>(null);

  const fetchResults = useCallback(
    async (targetPage: number, append = false) => {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const query: Partial<SeekerSearchQuery> = {
          page: targetPage,
          pageSize: 12,
          sortBy,
          gender: (gender as "male" | "female") || undefined,
          q: q.trim() || undefined,
          location: location.trim() || undefined,
          minAge: minAge || undefined,
          maxAge: maxAge || undefined,
          prayerFrequency: (prayerFrequency as SeekerSearchQuery["prayerFrequency"]) || undefined,
          dietaryHabits: (dietaryHabits as SeekerSearchQuery["dietaryHabits"]) || undefined,
          maritalStatus: (maritalStatus as SeekerSearchQuery["maritalStatus"]) || undefined,
          education: (education as SeekerSearchQuery["education"]) || undefined,
          waliInvolved,
        };

        const res = await api.searchSeekers(query);
        setGate(res.gate);
        setTotal(res.total);
        setTotalPages(res.totalPages);
        setPage(targetPage);

        if (append) {
          setProfiles((prev) => {
            const existingIds = new Set(prev.map((p) => p.id));
            const newOnes = res.profiles.filter((p) => !existingIds.has(p.id));
            return [...prev, ...newOnes];
          });
        } else {
          setProfiles(res.profiles);
        }
      } catch (err) {
        setError(err instanceof Error ? err : new Error("Failed to load profiles"));
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [q, location, gender, minAge, maxAge, prayerFrequency, dietaryHabits, maritalStatus, education, waliInvolved, sortBy],
  );

  useEffect(() => {
    void fetchResults(1, false);
  }, [fetchResults]);

  const removeProfile = (id: string) => {
    setProfiles((prev) => prev.filter((p) => p.id !== id));
    setTotal((prev) => Math.max(0, prev - 1));
    if (selectedBiodata?.id === id) setSelectedBiodata(null);
    if (confirmRequestFor?.id === id) setConfirmRequestFor(null);
  };

  const handleSendRequest = async (profile: PublicProfile) => {
    if (user?.role === "ADMIN") {
      toast.info(
        "Admin Mode: Connection requests can only be sent by seeker accounts. Sign in as a seeker (e.g. yusuf@nikahpath.test) to test two-way courtship chats.",
      );
      setConfirmRequestFor(null);
      return;
    }
    setSending(profile.id);
    try {
      const view = await api.requestConnection(profile.id);
      toast.success(
        view.status === "PENDING_MALE_PARENT"
          ? "Request sent to your wali for review first."
          : `Request sent — awaiting ${profile.displayName}${profile.waliInvolved ? " and their wali" : ""}.`,
      );
      removeProfile(profile.id);
      setConfirmRequestFor(null);
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

  const resetFilters = () => {
    setQ("");
    setLocation("");
    setGender("");
    setMinAge(undefined);
    setMaxAge(undefined);
    setPrayerFrequency("");
    setDietaryHabits("");
    setMaritalStatus("");
    setEducation("");
    setWaliInvolved(undefined);
    setSortBy("recent");
  };

  const activeFiltersCount =
    (location ? 1 : 0) +
    (minAge !== undefined ? 1 : 0) +
    (maxAge !== undefined ? 1 : 0) +
    (prayerFrequency ? 1 : 0) +
    (dietaryHabits ? 1 : 0) +
    (maritalStatus ? 1 : 0) +
    (education ? 1 : 0) +
    (waliInvolved !== undefined ? 1 : 0) +
    (sortBy !== "recent" ? 1 : 0);

  const blocked =
    !gate.readinessCompleted ||
    gate.needsWali ||
    gate.activeChats >= gate.maxActiveChats ||
    gate.pendingOutgoing >= gate.maxPendingOutgoing;

  const displayedProfiles =
    activeTab === "shortlist" ? profiles.filter((p) => shortlist.includes(p.id)) : profiles;

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-4 sm:p-6">
      <PageHeader
        title="Halal Match Discovery"
        description="Explore members committed to marriage in accordance with Islamic principles. Respectful, chaperoned, and focused on compatibility."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {user?.role === "ADMIN" && (
              <Badge className="h-8 border-purple-200 bg-purple-100 px-3 font-semibold text-purple-800">
                Admin Discovery Mode
              </Badge>
            )}
            <Badge variant="outline" className="h-8 border-slate-200 bg-white px-3 font-medium text-slate-700 shadow-2xs">
              <span className="mr-1 size-2 rounded-full bg-emerald-500" />
              {gate.activeChats}/{gate.maxActiveChats} active chats
            </Badge>
            <Badge variant="outline" className="h-8 border-slate-200 bg-white px-3 font-medium text-slate-700 shadow-2xs">
              <span className="mr-1 size-2 rounded-full bg-rose-500" />
              {gate.pendingOutgoing}/{gate.maxPendingOutgoing} pending requests
            </Badge>
          </div>
        }
      />

      <GateNotice gate={gate} />
      <TaarufMethodGuide />

      {/* Main Search & Filter Controller */}
      <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-xs space-y-4">
        {/* Top Controls: Search Input + Filter Toggle */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              type="search"
              placeholder="Search by city, profession, background keywords..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="h-11 rounded-2xl border-slate-200 bg-slate-50/70 pl-10 text-sm focus:bg-white"
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ("")}
                className="absolute top-1/2 right-3 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant={showFilters ? "default" : "outline"}
              onClick={() => setShowFilters((prev) => !prev)}
              className={cn(
                "h-11 rounded-2xl font-medium",
                showFilters
                  ? "bg-rose-600 text-white hover:bg-rose-700"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
              )}
            >
              <Filter className="size-4" />
              Filters
              {activeFiltersCount > 0 && (
                <span className="ml-1 flex size-5 items-center justify-center rounded-full bg-rose-100 text-xs font-bold text-rose-700">
                  {activeFiltersCount}
                </span>
              )}
            </Button>

            {activeFiltersCount > 0 && (
              <Button
                type="button"
                variant="ghost"
                onClick={resetFilters}
                className="h-11 rounded-2xl text-slate-500 hover:text-slate-800"
                title="Reset filters"
              >
                <RotateCcw className="size-4" />
                <span className="hidden sm:inline">Reset</span>
              </Button>
            )}
          </div>
        </div>

        {/* City Presets */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-xs font-semibold text-slate-400 mr-1">Cities:</span>
          {CITY_PRESETS.map((city) => (
            <button
              key={city}
              type="button"
              onClick={() => setLocation((prev) => (prev === city ? "" : city))}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-all",
                location === city
                  ? "bg-rose-600 text-white shadow-2xs"
                  : "border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100",
              )}
            >
              {city}
            </button>
          ))}
        </div>

        {/* Admin Gender Filter */}
        {user?.role === "ADMIN" && (
          <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100">
            <span className="text-xs font-semibold text-purple-700 mr-1">Admin Preview:</span>
            <button
              type="button"
              onClick={() => setGender("")}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-all",
                gender === ""
                  ? "bg-purple-600 text-white shadow-2xs font-semibold"
                  : "border border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100",
              )}
            >
              All Suitors
            </button>
            <button
              type="button"
              onClick={() => setGender("male")}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-all",
                gender === "male"
                  ? "bg-purple-600 text-white shadow-2xs font-semibold"
                  : "border border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100",
              )}
            >
              Brothers Only
            </button>
            <button
              type="button"
              onClick={() => setGender("female")}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-all",
                gender === "female"
                  ? "bg-purple-600 text-white shadow-2xs font-semibold"
                  : "border border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100",
              )}
            >
              Sisters Only
            </button>
          </div>
        )}

        {/* Quick Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-100">
          <span className="text-xs font-semibold text-slate-400 mr-1">Pillars:</span>

          <button
            type="button"
            onClick={() => setPrayerFrequency((prev) => (prev === "Always" ? "" : "Always"))}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-all",
              prayerFrequency === "Always"
                ? "bg-rose-600 text-white shadow-2xs"
                : "border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100",
            )}
          >
            <Clock className="size-3" /> Prays Always
          </button>

          <button
            type="button"
            onClick={() => setDietaryHabits((prev) => (prev === "Strictly Halal" ? "" : "Strictly Halal"))}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-all",
              dietaryHabits === "Strictly Halal"
                ? "bg-rose-600 text-white shadow-2xs"
                : "border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100",
            )}
          >
            <Utensils className="size-3" /> Strictly Halal
          </button>

          <button
            type="button"
            onClick={() => setWaliInvolved((prev) => (prev === true ? undefined : true))}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-all",
              waliInvolved === true
                ? "bg-emerald-600 text-white shadow-2xs"
                : "border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100",
            )}
          >
            <ShieldCheck className="size-3" /> Wali Involved
          </button>

          <button
            type="button"
            onClick={() => setMaritalStatus((prev) => (prev === "Never Married" ? "" : "Never Married"))}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-all",
              maritalStatus === "Never Married"
                ? "bg-rose-600 text-white shadow-2xs"
                : "border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100",
            )}
          >
            <Heart className="size-3" /> Never Married
          </button>

          <button
            type="button"
            onClick={() => setEducation((prev) => (prev === "Master's" ? "" : "Master's"))}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-all",
              education === "Master's"
                ? "bg-rose-600 text-white shadow-2xs"
                : "border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100",
            )}
          >
            <GraduationCap className="size-3" /> Master&apos;s Degree
          </button>
        </div>

        {/* Expandable Advanced Filter Panel */}
        {showFilters && (
          <div className="grid gap-4 rounded-2xl border border-slate-100 bg-slate-50/70 p-4 pt-5 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Location / City</label>
              <Input
                placeholder="e.g. Cape Town, London"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="h-9 rounded-xl bg-white text-xs"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Age Range</label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  placeholder="Min"
                  min={18}
                  max={99}
                  value={minAge ?? ""}
                  onChange={(e) => setMinAge(e.target.value ? Number(e.target.value) : undefined)}
                  className="h-9 rounded-xl bg-white text-xs"
                />
                <span className="text-slate-400 text-xs">to</span>
                <Input
                  type="number"
                  placeholder="Max"
                  min={18}
                  max={99}
                  value={maxAge ?? ""}
                  onChange={(e) => setMaxAge(e.target.value ? Number(e.target.value) : undefined)}
                  className="h-9 rounded-xl bg-white text-xs"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Prayer Frequency</label>
              <NativeSelect
                value={prayerFrequency}
                onChange={(e) => setPrayerFrequency(e.target.value)}
                className="h-9 rounded-xl bg-white text-xs"
              >
                <option value="">Any practice level</option>
                {PRAYER_FREQUENCIES.map((freq) => (
                  <option key={freq} value={freq}>
                    {freq}
                  </option>
                ))}
              </NativeSelect>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Dietary Habits</label>
              <NativeSelect
                value={dietaryHabits}
                onChange={(e) => setDietaryHabits(e.target.value)}
                className="h-9 rounded-xl bg-white text-xs"
              >
                <option value="">Any dietary habit</option>
                {DIETARY_HABITS.map((diet) => (
                  <option key={diet} value={diet}>
                    {diet}
                  </option>
                ))}
              </NativeSelect>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Marital Status</label>
              <NativeSelect
                value={maritalStatus}
                onChange={(e) => setMaritalStatus(e.target.value)}
                className="h-9 rounded-xl bg-white text-xs"
              >
                <option value="">Any status</option>
                {MARITAL_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </NativeSelect>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Education</label>
              <NativeSelect
                value={education}
                onChange={(e) => setEducation(e.target.value)}
                className="h-9 rounded-xl bg-white text-xs"
              >
                <option value="">Any level</option>
                {EDUCATION_LEVELS.map((edu) => (
                  <option key={edu} value={edu}>
                    {edu}
                  </option>
                ))}
              </NativeSelect>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Wali Involvement</label>
              <NativeSelect
                value={waliInvolved === undefined ? "" : String(waliInvolved)}
                onChange={(e) =>
                  setWaliInvolved(
                    e.target.value === "true" ? true : e.target.value === "false" ? false : undefined,
                  )
                }
                className="h-9 rounded-xl bg-white text-xs"
              >
                <option value="">All profiles</option>
                <option value="true">Wali involved only</option>
                <option value="false">Independent seekers only</option>
              </NativeSelect>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Sort Results</label>
              <NativeSelect
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="h-9 rounded-xl bg-white text-xs"
              >
                <option value="recent">Recently Active</option>
                <option value="readiness">Most Readiness Badges</option>
                <option value="age_asc">Age: Youngest First</option>
                <option value="age_desc">Age: Oldest First</option>
              </NativeSelect>
            </div>
          </div>
        )}
      </div>

      {/* Discovery View Selector: All Profiles vs My Shortlist */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("all")}
            className={cn(
              "rounded-xl px-4 py-2 text-sm font-bold transition-all",
              activeTab === "all"
                ? "bg-slate-900 text-white shadow-xs"
                : "text-slate-600 hover:bg-slate-100",
            )}
          >
            All Suitors ({total})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("shortlist")}
            className={cn(
              "flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold transition-all",
              activeTab === "shortlist"
                ? "bg-slate-900 text-white shadow-xs"
                : "text-slate-600 hover:bg-slate-100",
            )}
          >
            <Bookmark className="size-4" />
            My Shortlist ({shortlist.length})
          </button>
        </div>

        <Link to="/feed" className="text-xs font-medium text-rose-600 hover:underline">
          View Daily 5 Batch &rarr;
        </Link>
      </div>

      {/* Results Section */}
      <div className="space-y-4">
        {loading ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-2">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-80 animate-pulse rounded-3xl border border-slate-100 bg-white p-6 shadow-xs"
              />
            ))}
          </div>
        ) : error ? (
          <ErrorState error={error} onRetry={() => void fetchResults(1, false)} />
        ) : displayedProfiles.length === 0 ? (
          <EmptyState
            icon={<Sparkles className="size-8 text-rose-400" />}
            title={activeTab === "shortlist" ? "Your shortlist is empty" : "No matching suitors found"}
            description={
              activeTab === "shortlist"
                ? "Tap the bookmark icon on any suitor's profile to save them here for thoughtful family review."
                : "Try broadening your search filters. May Allah bless your search and grant you a pious spouse."
            }
            action={
              activeTab === "shortlist" ? (
                <Button onClick={() => setActiveTab("all")} variant="outline" className="rounded-xl">
                  Browse All Suitors
                </Button>
              ) : (
                <Button onClick={resetFilters} variant="outline" className="rounded-xl">
                  <RotateCcw className="size-4" /> Reset Filters
                </Button>
              )
            }
          />
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-2">
            {displayedProfiles.map((profile) => {
              const deenScore = calculateDeenMatch(profile, user);
              const isShortlisted = shortlist.includes(profile.id);

              return (
                <article
                  key={profile.id}
                  className="flex flex-col justify-between overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-xs transition-all hover:shadow-md"
                >
                  <div>
                    {/* Photo Header */}
                    <div className="relative aspect-[16/9] w-full overflow-hidden bg-slate-900">
                      <ProtectedPhoto
                        userId={profile.id}
                        name={profile.displayName}
                        access={profile.photoAccess}
                        className="size-full"
                      />

                      {/* Top Badges */}
                      <div className="absolute top-3 right-3 flex items-center gap-1.5">
                        {profile.waliInvolved && (
                          <Badge className="border-emerald-200 bg-emerald-600/90 text-white backdrop-blur-xs font-semibold">
                            <ShieldCheck className="size-3.5" /> Wali involved
                          </Badge>
                        )}
                        <button
                          type="button"
                          onClick={() => toggleShortlist(profile.id)}
                          className={cn(
                            "flex size-8 items-center justify-center rounded-full backdrop-blur-xs transition",
                            isShortlisted
                              ? "bg-rose-600 text-white shadow-xs"
                              : "bg-black/40 text-white hover:bg-black/60",
                          )}
                          title={isShortlisted ? "Remove from shortlist" : "Save to shortlist"}
                        >
                          {isShortlisted ? <BookmarkCheck className="size-4" /> : <Bookmark className="size-4" />}
                        </button>
                      </div>

                      {/* Bottom Alignment Tag */}
                      <div className="absolute bottom-3 left-3">
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-900/80 px-2.5 py-1 text-xs font-semibold text-emerald-400 backdrop-blur-xs">
                          <Sparkles className="size-3" />
                          {deenScore}% Deen Match
                        </span>
                      </div>
                    </div>

                    {/* Body Content */}
                    <div className="space-y-4 p-5 sm:p-6">
                      <div>
                        <div className="flex items-baseline justify-between gap-2">
                          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
                            {profile.displayName}
                            {profile.age !== null && <span className="font-normal text-slate-400">, {profile.age}</span>}
                          </h2>
                        </div>
                        {profile.location && (
                          <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                            <MapPin className="size-3.5 text-rose-500 shrink-0" /> {profile.location}
                          </p>
                        )}
                      </div>

                      {/* Islamic Deen & Character Highlights */}
                      <div className="flex flex-wrap gap-1.5">
                        {profile.prayerFrequency && (
                          <Badge variant="outline" className="border-rose-100 bg-rose-50/70 text-rose-700 text-xs font-medium">
                            <Clock className="size-3" /> Prays {profile.prayerFrequency}
                          </Badge>
                        )}
                        {profile.dietaryHabits && (
                          <Badge variant="outline" className="border-amber-100 bg-amber-50/70 text-amber-800 text-xs font-medium">
                            <Utensils className="size-3" /> {profile.dietaryHabits}
                          </Badge>
                        )}
                        {profile.completedModules.length > 0 && (
                          <Badge variant="outline" className="border-emerald-100 bg-emerald-50/70 text-emerald-700 text-xs font-medium">
                            <BookOpen className="size-3" /> {profile.completedModules.length} Modules Passed
                          </Badge>
                        )}
                      </div>

                      {/* Facts Grid */}
                      <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 rounded-2xl bg-slate-50/80 p-3">
                        <div>
                          <span className="block text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                            Profession
                          </span>
                          <span className="font-semibold text-slate-800 truncate block">
                            {profile.profession || "—"}
                          </span>
                        </div>
                        <div>
                          <span className="block text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                            Education
                          </span>
                          <span className="font-semibold text-slate-800 truncate block">
                            {profile.education || "—"}
                          </span>
                        </div>
                        <div>
                          <span className="block text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                            Status
                          </span>
                          <span className="font-semibold text-slate-800 truncate block">
                            {profile.maritalStatus || "—"}
                          </span>
                        </div>
                        <div>
                          <span className="block text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                            Languages
                          </span>
                          <span className="font-semibold text-slate-800 truncate block">
                            {profile.languages.length > 0 ? profile.languages.join(", ") : "—"}
                          </span>
                        </div>
                      </div>

                      {profile.bio && (
                        <p className="line-clamp-2 rounded-xl border border-slate-100 bg-white p-3 text-xs italic text-slate-600">
                          &ldquo;{profile.bio}&rdquo;
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Card Actions */}
                  <div className="border-t border-slate-100 p-4 sm:p-5 flex flex-wrap gap-2 bg-slate-50/50">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setSelectedBiodata(profile);
                        setBiodataTab("deen");
                      }}
                      className="h-10 rounded-xl text-xs font-semibold text-slate-700 hover:bg-white"
                    >
                      View Biodata
                    </Button>
                    <Button
                      onClick={() => setConfirmRequestFor(profile)}
                      disabled={blocked || sending === profile.id}
                      className="h-10 flex-1 rounded-xl bg-rose-600 text-xs font-semibold text-white shadow-xs hover:bg-rose-700"
                    >
                      <Heart className="size-3.5" />
                      {sending === profile.id ? "Sending…" : "Connect with Wali"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setReporting(profile)}
                      className="h-10 w-10 text-slate-400 hover:text-slate-600"
                      title="Report profile"
                    >
                      <Flag className="size-4" />
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {/* Load More Pagination */}
        {page < totalPages && activeTab === "all" && (
          <div className="pt-6 text-center">
            <Button
              onClick={() => void fetchResults(page + 1, true)}
              disabled={loadingMore}
              variant="outline"
              className="h-11 rounded-2xl px-6 border-slate-200 bg-white font-medium text-slate-700 hover:bg-slate-50"
            >
              {loadingMore ? (
                <>
                  <RefreshCw className="size-4 animate-spin" /> Loading more suitors…
                </>
              ) : (
                <>Scroll / Load More Profiles ({total - profiles.length} remaining)</>
              )}
            </Button>
          </div>
        )}
      </div>

      {/* Comprehensive Biodata Modal with Tabs */}
      {selectedBiodata && (
        <Dialog open onOpenChange={(open) => !open && setSelectedBiodata(null)}>
          <DialogContent className="max-h-[90vh] overflow-y-auto max-w-2xl rounded-3xl p-6">
            <DialogHeader>
              <div className="flex items-center gap-2">
                <DialogTitle className="text-2xl font-extrabold text-slate-900">
                  {selectedBiodata.displayName}
                  {selectedBiodata.age !== null && (
                    <span className="font-normal text-slate-400">, {selectedBiodata.age}</span>
                  )}
                </DialogTitle>
                {selectedBiodata.waliInvolved && (
                  <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                    <ShieldCheck className="size-3" /> Wali involved
                  </Badge>
                )}
              </div>
              <DialogDescription>
                Comprehensive matrimonial biodata, deen profile, and family arrangements.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5 pt-2">
              <div className="relative aspect-[16/9] w-full overflow-hidden rounded-2xl bg-slate-900">
                <ProtectedPhoto
                  userId={selectedBiodata.id}
                  name={selectedBiodata.displayName}
                  access={selectedBiodata.photoAccess}
                  className="size-full"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 text-xs text-white/90">
                  <span className="flex items-center gap-1.5 font-medium">
                    <Lock className="size-3.5" />
                    Modesty Protection: Full photo visible only after mutual consent in an approved courtship.
                  </span>
                </div>
              </div>

              {/* Biodata Tabs */}
              <div className="grid grid-cols-3 gap-1 rounded-2xl bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setBiodataTab("deen")}
                  className={cn(
                    "rounded-xl py-2 text-xs font-bold transition",
                    biodataTab === "deen" ? "bg-white text-emerald-800 shadow-2xs" : "text-slate-600 hover:text-slate-900",
                  )}
                >
                  🕌 Deen &amp; Akhlaq
                </button>
                <button
                  type="button"
                  onClick={() => setBiodataTab("background")}
                  className={cn(
                    "rounded-xl py-2 text-xs font-bold transition",
                    biodataTab === "background" ? "bg-white text-rose-700 shadow-2xs" : "text-slate-600 hover:text-slate-900",
                  )}
                >
                  🎓 Life &amp; Career
                </button>
                <button
                  type="button"
                  onClick={() => setBiodataTab("family")}
                  className={cn(
                    "rounded-xl py-2 text-xs font-bold transition",
                    biodataTab === "family" ? "bg-white text-slate-800 shadow-2xs" : "text-slate-600 hover:text-slate-900",
                  )}
                >
                  🛡️ Family Setup
                </button>
              </div>

              {biodataTab === "deen" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-3.5">
                      <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">Prayer Regularity</span>
                      <p className="mt-1 text-sm font-semibold text-slate-800">{selectedBiodata.prayerFrequency || "—"}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-3.5">
                      <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">Dietary Habits</span>
                      <p className="mt-1 text-sm font-semibold text-slate-800">{selectedBiodata.dietaryHabits || "—"}</p>
                    </div>
                  </div>

                  {selectedBiodata.bio && (
                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4">
                      <h4 className="text-xs font-bold text-emerald-900 uppercase">About &amp; Islamic Outlook</h4>
                      <p className="mt-1.5 text-sm leading-relaxed text-slate-700">&ldquo;{selectedBiodata.bio}&rdquo;</p>
                    </div>
                  )}

                  <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4 space-y-2">
                    <h4 className="text-xs font-bold text-slate-700 uppercase">Verified Marriage Readiness</h4>
                    <p className="text-xs text-slate-500">
                      Has completed {selectedBiodata.completedModules.length} core preparation module(s) including Etiquette of Halal Courtship.
                    </p>
                  </div>
                </div>
              )}

              {biodataTab === "background" && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-3.5">
                    <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase flex items-center gap-1">
                      <Briefcase className="size-3 text-rose-500" /> Profession
                    </span>
                    <p className="mt-1 text-sm font-semibold text-slate-800">{selectedBiodata.profession || "—"}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-3.5">
                    <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase flex items-center gap-1">
                      <GraduationCap className="size-3 text-rose-500" /> Education
                    </span>
                    <p className="mt-1 text-sm font-semibold text-slate-800">{selectedBiodata.education || "—"}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-3.5">
                    <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase flex items-center gap-1">
                      <MapPin className="size-3 text-rose-500" /> Location
                    </span>
                    <p className="mt-1 text-sm font-semibold text-slate-800">{selectedBiodata.location || "—"}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-3.5">
                    <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">Marital Status</span>
                    <p className="mt-1 text-sm font-semibold text-slate-800">{selectedBiodata.maritalStatus || "—"}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-3.5">
                    <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">Nationality</span>
                    <p className="mt-1 text-sm font-semibold text-slate-800">{selectedBiodata.nationality || "—"}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-3.5">
                    <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">Languages</span>
                    <p className="mt-1 text-sm font-semibold text-slate-800">
                      {selectedBiodata.languages.length > 0 ? selectedBiodata.languages.join(", ") : "—"}
                    </p>
                  </div>
                </div>
              )}

              {biodataTab === "family" && (
                <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="size-5 text-emerald-600" />
                    <h4 className="text-sm font-bold text-slate-900">
                      {selectedBiodata.waliInvolved ? "Guardian (Wali) Actively Involved" : "Independent Seeker Setup"}
                    </h4>
                  </div>
                  <p className="text-xs leading-relaxed text-slate-600">
                    {selectedBiodata.waliInvolved
                      ? "This sister's/brother's proposal involves a linked guardian who reviews requests and participates in the Family Lounge."
                      : "This seeker conducts their proposal with chaperone oversight. In approved courtships, conversations take place across both the Family Lounge and direct chats."}
                  </p>
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                    <strong>Courtship Protocol:</strong> All courtships observe the 3-day response rule. Either party may conclude the courtship with a kind du&apos;a at any point.
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="mt-6 flex flex-col sm:flex-row gap-2 border-t border-slate-100 pt-4">
              <Button variant="outline" onClick={() => setSelectedBiodata(null)} className="rounded-xl">
                Close
              </Button>
              <Button
                onClick={() => {
                  setConfirmRequestFor(selectedBiodata);
                  setSelectedBiodata(null);
                }}
                disabled={blocked}
                className="rounded-xl bg-rose-600 text-white hover:bg-rose-700"
              >
                <Heart className="size-4" /> Connect with Wali
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Confirmation Dialog before sending Connection Request */}
      {confirmRequestFor && (
        <Dialog open onOpenChange={(open) => !open && setConfirmRequestFor(null)}>
          <DialogContent className="rounded-3xl max-w-md">
            <DialogHeader>
              <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-2xl bg-rose-100 text-rose-600">
                <Heart className="size-6" />
              </div>
              <DialogTitle className="text-center text-xl font-bold">
                Initiate Halal Ta&apos;aruf
              </DialogTitle>
              <DialogDescription className="text-center text-slate-600">
                You are sending a connection request to{" "}
                <strong className="text-slate-900">{confirmRequestFor.displayName}</strong>.
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-xs text-slate-700 space-y-2.5">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="size-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  {user?.requiresParentalVetting
                    ? "Your request will first be reviewed and approved by your Wali before being delivered."
                    : confirmRequestFor.waliInvolved
                      ? `Once accepted, ${confirmRequestFor.displayName}'s wali will review before the chat opens.`
                      : "Once accepted, a Mahram chaperone is assigned before your conversation can begin."}
                </span>
              </div>
              <div className="flex items-start gap-2">
                <Users className="size-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>Features a Family &amp; Wali Lounge for guardian discussions and a Direct Chat between suitors.</span>
              </div>
              <div className="flex items-start gap-2">
                <Clock className="size-4 text-amber-600 shrink-0 mt-0.5" />
                <span>3-Day Inactivity Rule: If either party does not reply within 3 days, the connection closes automatically.</span>
              </div>
            </div>

            <DialogFooter className="mt-4 flex flex-col sm:flex-row gap-2">
              <Button
                variant="outline"
                onClick={() => setConfirmRequestFor(null)}
                className="rounded-xl flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={() => void handleSendRequest(confirmRequestFor)}
                disabled={sending !== null}
                className="rounded-xl flex-1 bg-rose-600 font-semibold text-white hover:bg-rose-700"
              >
                {sending ? "Sending…" : "Bismillah, Send"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Limit Alert Dialog */}
      <Dialog open={limitMessage !== null} onOpenChange={(open) => !open && setLimitMessage(null)}>
        <DialogContent className="rounded-3xl max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">Intentionality Limit Reached</DialogTitle>
            <DialogDescription className="text-sm text-slate-600">{limitMessage}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setLimitMessage(null)} className="rounded-xl bg-rose-600 text-white hover:bg-rose-700">
              Understood
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Safety Report Dialog */}
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

export default SearchPage;
