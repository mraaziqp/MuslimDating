import { Bookmark, BookmarkCheck, Briefcase, Clock, Heart, MapPin, ShieldCheck, StickyNote, Utensils, X } from "lucide-react";
import type { Compatibility } from "../../lib/compatibility";
import type { DiscoverProfile } from "../../lib/contracts";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { CompatibilityBadge } from "./ProfileCard";
import { ProfileVisual } from "./ProfileVisual";

interface ProfileGridCardProps {
  profile: DiscoverProfile;
  compatibility: Compatibility;
  onOpen: (profile: DiscoverProfile) => void;
  onInterested: (profile: DiscoverProfile) => void;
  onPass?: (profile: DiscoverProfile) => void;
  onToggleSave?: (profile: DiscoverProfile) => void;
  /** Label for the pass button; the shortlist calls it "Remove". */
  passLabel?: string;
  requestDisabled: boolean;
  busy: boolean;
}

/** A profile in the grid view: the same information as a deck card, with explicit buttons instead of gestures. */
export function ProfileGridCard({
  profile,
  compatibility,
  onOpen,
  onInterested,
  onPass,
  onToggleSave,
  passLabel = "Pass",
  requestDisabled,
  busy,
}: ProfileGridCardProps) {
  return (
    <article className="flex flex-col overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-xs transition-shadow hover:shadow-md">
      <button
        type="button"
        onClick={() => onOpen(profile)}
        className="group relative block h-44 w-full text-left outline-none focus-visible:ring-3 focus-visible:ring-rose-400/60 focus-visible:ring-inset"
        aria-label={`View ${profile.displayName}'s full profile`}
      >
        <ProfileVisual profile={profile} className="absolute inset-0" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent" />
        <div className="absolute inset-x-3 top-3 flex items-start justify-between gap-2">
          <CompatibilityBadge compatibility={compatibility} />
          {profile.waliInvolved && (
            <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-600/90 px-2.5 py-1 text-xs font-semibold text-white">
              <ShieldCheck className="size-3.5" /> Wali involved
            </span>
          )}
        </div>
        <div className="absolute inset-x-4 bottom-3 text-white">
          <h2 className="text-xl leading-tight font-bold tracking-tight group-hover:underline">
            {profile.displayName}
            {profile.age !== null && <span className="font-normal text-white/80">, {profile.age}</span>}
          </h2>
          {profile.location && (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-white/85">
              <MapPin className="size-3.5" /> {profile.location}
            </p>
          )}
        </div>
      </button>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <ul className="space-y-1.5 text-sm text-slate-600">
          {profile.profession && (
            <li className="flex items-center gap-2">
              <Briefcase className="size-4 shrink-0 text-slate-400" />
              <span className="truncate">{[profile.profession, profile.education].filter(Boolean).join(" · ")}</span>
            </li>
          )}
          {profile.prayerFrequency && (
            <li className="flex items-center gap-2">
              <Clock className="size-4 shrink-0 text-slate-400" /> Prays {profile.prayerFrequency.toLowerCase()}
            </li>
          )}
          {profile.dietaryHabits && (
            <li className="flex items-center gap-2">
              <Utensils className="size-4 shrink-0 text-slate-400" /> {profile.dietaryHabits}
            </li>
          )}
        </ul>
        {profile.bio && <p className="line-clamp-2 text-sm text-slate-500">“{profile.bio}”</p>}
        {profile.note && (
          <p className="flex items-start gap-1.5 rounded-xl bg-amber-50 px-2.5 py-2 text-xs text-amber-900">
            <StickyNote className="mt-0.5 size-3.5 shrink-0" />
            <span className="line-clamp-2">{profile.note}</span>
          </p>
        )}

        <div className="mt-auto flex items-center gap-2 pt-1">
          {onPass && (
            <Button
              variant="outline"
              size="icon"
              className="size-10 rounded-xl text-slate-500"
              onClick={() => onPass(profile)}
              aria-label={`${passLabel} ${profile.displayName}`}
              title={passLabel}
            >
              <X />
            </Button>
          )}
          {onToggleSave && (
            <Button
              variant="outline"
              size="icon"
              className={cn(
                "size-10 rounded-xl",
                profile.saved ? "border-amber-300 bg-amber-50 text-amber-600" : "text-slate-500",
              )}
              onClick={() => onToggleSave(profile)}
              aria-pressed={profile.saved}
              aria-label={profile.saved ? `Remove ${profile.displayName} from saved` : `Save ${profile.displayName}`}
              title={profile.saved ? "Saved" : "Save for later"}
            >
              {profile.saved ? <BookmarkCheck /> : <Bookmark />}
            </Button>
          )}
          <Button
            className="h-10 flex-1 rounded-xl bg-rose-600 font-semibold text-white hover:bg-rose-700"
            disabled={requestDisabled || busy}
            onClick={() => onInterested(profile)}
          >
            <Heart /> {busy ? "Sending…" : "Send request"}
          </Button>
        </div>
      </div>
    </article>
  );
}
