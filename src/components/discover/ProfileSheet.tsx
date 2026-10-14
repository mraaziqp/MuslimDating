import { useState } from "react";
import { Bookmark, BookmarkCheck, CheckCircle2, Flag, Heart, Lock, MapPin, ShieldCheck, StickyNote, Users, X } from "lucide-react";
import type { Compatibility } from "../../lib/compatibility";
import type { DiscoverProfile } from "../../lib/contracts";
import { ProfileDetails } from "../shared/ProfileDetails";
import { Button } from "../ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "../ui/dialog";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { ProfileVisual } from "./ProfileVisual";

interface ProfileSheetProps {
  profile: DiscoverProfile | null;
  compatibility: Compatibility | null;
  onClose: () => void;
  onInterested: (profile: DiscoverProfile) => void;
  onPass?: (profile: DiscoverProfile) => void;
  onToggleSave?: (profile: DiscoverProfile) => void;
  /** Present for members who can keep a shortlist; called with the edited text when the note box loses focus. */
  onSaveNote?: (profile: DiscoverProfile, text: string) => void;
  onReport: (profile: DiscoverProfile) => void;
  /** Why a request cannot be sent right now, if it cannot. */
  blockedReason: string | null;
  busy: boolean;
}

/** A private reminder on a saved profile. It saves itself when the member leaves the box. */
function PrivateNote({ profile, onSave }: { profile: DiscoverProfile; onSave: (profile: DiscoverProfile, text: string) => void }) {
  const [draft, setDraft] = useState(profile.note ?? "");
  return (
    <section className="space-y-2 rounded-2xl border border-amber-100 bg-amber-50/60 p-4">
      <Label htmlFor="saved-note" className="flex items-center gap-1.5 text-sm font-bold text-amber-900">
        <StickyNote className="size-4" /> Your private note
      </Label>
      <Textarea
        id="saved-note"
        rows={2}
        maxLength={500}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => onSave(profile, draft)}
        placeholder="Something to remember, or to raise with your family…"
        className="bg-white"
      />
      <p className="text-xs text-amber-800/70">Only you can see this. It saves when you leave the box.</p>
    </section>
  );
}

/** The full biodata, opened from a card. Every decision available on the deck is available here too. */
export function ProfileSheet({
  profile,
  compatibility,
  onClose,
  onInterested,
  onPass,
  onToggleSave,
  onSaveNote,
  onReport,
  blockedReason,
  busy,
}: ProfileSheetProps) {
  return (
    <Dialog open={profile !== null} onOpenChange={(open) => !open && onClose()}>
      {profile && (
        <DialogContent showCloseButton={false} className="max-h-[92dvh] gap-0 overflow-y-auto rounded-3xl p-0 max-sm:pb-0 sm:max-w-xl">
          <div className="relative h-44 shrink-0 sm:h-52">
            <ProfileVisual profile={profile} className="absolute inset-0" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent" />
            <DialogClose
              aria-label="Close profile"
              className="absolute top-3 right-3 flex size-9 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-md transition hover:bg-black/65"
            >
              <X className="size-4" />
            </DialogClose>
            <div className="absolute inset-x-5 bottom-4 text-white">
              <DialogTitle className="text-2xl leading-tight font-extrabold tracking-tight">
                {profile.displayName}
                {profile.age !== null && <span className="font-normal text-white/80">, {profile.age}</span>}
              </DialogTitle>
              <DialogDescription className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/85">
                {profile.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="size-3.5" /> {profile.location}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  {profile.waliInvolved ? <ShieldCheck className="size-3.5" /> : <Users className="size-3.5" />}
                  {profile.waliInvolved ? "Wali involved" : "Independent seeker"}
                </span>
              </DialogDescription>
            </div>
          </div>

          <div className="space-y-5 p-5">
            {compatibility && (compatibility.score !== null || compatibility.reasons.length > 0) && (
              <section className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-bold text-emerald-900">What you have in common</h3>
                  {compatibility.score !== null && (
                    <span className="text-lg font-extrabold text-emerald-700">{compatibility.score}%</span>
                  )}
                </div>
                {compatibility.score !== null && (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-emerald-100">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${compatibility.score}%` }} />
                  </div>
                )}
                {compatibility.reasons.length > 0 && (
                  <ul className="mt-3 space-y-1.5">
                    {compatibility.reasons.map((reason) => (
                      <li key={reason} className="flex items-start gap-2 text-sm text-emerald-900">
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" /> {reason}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-3 text-xs text-emerald-800/70">
                  Compared only on details you have both chosen to share. A guide for conversation, not a verdict.
                </p>
              </section>
            )}

            {profile.saved && onSaveNote && <PrivateNote key={profile.id} profile={profile} onSave={onSaveNote} />}

            <ProfileDetails profile={profile} />

            <section className="space-y-2 rounded-2xl border border-slate-100 bg-slate-50/80 p-4 text-sm text-slate-600">
              <p className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                {profile.waliInvolved
                  ? `${profile.displayName}'s wali reviews every request and joins the Family Lounge once a chat opens.`
                  : "A mahram chaperone is assigned before any conversation opens."}
              </p>
              {profile.photoAccess !== "FULL" && (
                <p className="flex items-start gap-2">
                  <Lock className="mt-0.5 size-4 shrink-0 text-slate-400" />
                  Photos are revealed only when you both consent inside an approved chat.
                </p>
              )}
            </section>

            <button
              type="button"
              onClick={() => onReport(profile)}
              className="mx-auto flex h-9 items-center gap-1.5 rounded-full px-3 text-xs text-slate-400 hover:bg-slate-50 hover:text-slate-600"
            >
              <Flag className="size-3.5" /> Report this profile
            </button>

            {blockedReason && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{blockedReason}</p>}
          </div>

          <div className="sticky bottom-0 z-10 flex items-center gap-2 border-t border-slate-100 bg-white/95 px-5 pt-3 pb-[max(0.75rem,var(--safe-bottom))] backdrop-blur-md sm:pb-3">
            {onPass && (
              <Button variant="outline" className="h-11 rounded-xl px-4" onClick={() => onPass(profile)} aria-label="Pass">
                <X /> <span className="max-[359px]:sr-only">Pass</span>
              </Button>
            )}
            {onToggleSave && (
              <Button
                variant="outline"
                className="h-11 rounded-xl border-amber-200 px-4 text-amber-700 hover:bg-amber-50 hover:text-amber-800"
                onClick={() => onToggleSave(profile)}
                aria-pressed={profile.saved}
              >
                {profile.saved ? <BookmarkCheck /> : <Bookmark />}
                <span className="max-[359px]:sr-only">{profile.saved ? "Saved" : "Save"}</span>
              </Button>
            )}
            <Button
              className="h-11 min-w-0 flex-1 shrink rounded-xl bg-rose-600 px-4 font-semibold text-white hover:bg-rose-700"
              disabled={busy || blockedReason !== null}
              onClick={() => onInterested(profile)}
            >
              <Heart /> <span className="truncate">{busy ? "Sending…" : "Send request"}</span>
            </Button>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
