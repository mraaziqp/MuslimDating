import type { ReactNode } from "react";
import { BookmarkCheck, BookOpen, Briefcase, Clock, GraduationCap, Lock, MapPin, ShieldCheck, Sparkles, Users, Utensils } from "lucide-react";
import type { Compatibility } from "../../lib/compatibility";
import type { DiscoverProfile } from "../../lib/contracts";
import { cn } from "../../lib/utils";
import { ProfileVisual } from "./ProfileVisual";

function Chip({ icon, children, className }: { icon: ReactNode; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium [&_svg]:size-3.5 [&_svg]:shrink-0",
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

export function CompatibilityBadge({ compatibility, className }: { compatibility: Compatibility; className?: string }) {
  if (compatibility.score === null) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-black/45 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-md",
        className,
      )}
      title="Based only on the details you have both shared"
    >
      <Sparkles className="size-3.5 text-amber-300" />
      {compatibility.score}% in common
    </span>
  );
}

/**
 * The face of a card in the swipe deck: everything needed for a first impression, nothing interactive.
 * The card is a size container: on a short phone it drops the bio and extra chips
 * (they are one tap away in the full profile) instead of clipping or overflowing.
 */
export function ProfileCard({ profile, compatibility }: { profile: DiscoverProfile; compatibility: Compatibility }) {
  const facts = [profile.profession, profile.education].filter(Boolean).join(" · ");

  return (
    <article className="flex size-full flex-col overflow-hidden rounded-[1.75rem] bg-white shadow-xl ring-1 shadow-slate-900/10 ring-slate-900/5 select-none [container-type:size]">
      <div className="relative min-h-28 flex-1">
        <ProfileVisual profile={profile} className="absolute inset-0" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-black/10" />

        <div className="absolute inset-x-3 top-3 flex items-start justify-between gap-2">
          <CompatibilityBadge compatibility={compatibility} />
          <div className="ml-auto flex flex-col items-end gap-1.5">
            {profile.waliInvolved && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600/90 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-md">
                <ShieldCheck className="size-3.5" /> Wali involved
              </span>
            )}
            {profile.saved && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/95 px-2.5 py-1 text-xs font-semibold text-white">
                <BookmarkCheck className="size-3.5" /> Saved
              </span>
            )}
          </div>
        </div>

        <div className="absolute inset-x-4 bottom-3 text-white">
          <h2 className="text-2xl leading-tight font-extrabold tracking-tight drop-shadow-sm [@container_(min-height:400px)]:text-[1.7rem]">
            {profile.displayName}
            {profile.age !== null && <span className="font-normal text-white/80">, {profile.age}</span>}
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/85">
            {profile.location && (
              <span className="flex items-center gap-1">
                <MapPin className="size-3.5" /> {profile.location}
              </span>
            )}
            {profile.photoAccess !== "FULL" && (
              <span className="hidden items-center gap-1 text-xs text-white/65 [@container_(min-height:340px)]:flex">
                <Lock className="size-3" /> Photo shared after mutual consent
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="shrink-0 space-y-2.5 p-4">
        {/* One row of chips on a short card, two when there is room. */}
        <div className="flex max-h-7 flex-wrap gap-1.5 overflow-hidden [@container_(min-height:400px)]:max-h-[3.9rem]">
          {profile.prayerFrequency && (
            <Chip icon={<Clock />} className="border-rose-100 bg-rose-50 text-rose-700">
              Prays {profile.prayerFrequency.toLowerCase()}
            </Chip>
          )}
          {profile.dietaryHabits && (
            <Chip icon={<Utensils />} className="border-amber-100 bg-amber-50 text-amber-800">
              {profile.dietaryHabits}
            </Chip>
          )}
          {profile.maritalStatus && (
            <Chip icon={<Users />} className="border-slate-200 bg-slate-50 text-slate-700">
              {profile.maritalStatus}
            </Chip>
          )}
          {profile.completedModules.length > 1 && (
            <Chip icon={<BookOpen />} className="border-emerald-100 bg-emerald-50 text-emerald-700">
              {profile.completedModules.length} readiness modules
            </Chip>
          )}
        </div>

        {facts && (
          <p className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
            {profile.profession ? (
              <Briefcase className="size-4 shrink-0 text-slate-400" />
            ) : (
              <GraduationCap className="size-4 shrink-0 text-slate-400" />
            )}
            <span className="truncate">{facts}</span>
          </p>
        )}

        {profile.bio && (
          <div className="hidden [@container_(min-height:440px)]:block">
            <p className="line-clamp-2 text-sm leading-relaxed text-slate-600 [@container_(min-height:540px)]:line-clamp-3">
              “{profile.bio}”
            </p>
          </div>
        )}

        {compatibility.reasons.length > 0 && (
          <p className="hidden items-start gap-1.5 text-xs font-medium text-emerald-700 [@container_(min-height:360px)]:flex">
            <Sparkles className="mt-0.5 size-3.5 shrink-0" />
            <span className="line-clamp-2">{compatibility.reasons.slice(0, 2).join(" · ")}</span>
          </p>
        )}
      </div>
    </article>
  );
}
