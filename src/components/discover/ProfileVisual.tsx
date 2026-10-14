import { useId } from "react";
import type { PublicProfile } from "../../lib/contracts";
import { cn } from "../../lib/utils";
import { ProtectedPhoto } from "../shared/ProtectedPhoto";

const PALETTES = [
  "from-rose-400 via-rose-500 to-fuchsia-800",
  "from-emerald-400 via-teal-500 to-cyan-800",
  "from-amber-400 via-orange-500 to-rose-700",
  "from-sky-400 via-indigo-500 to-violet-800",
  "from-teal-400 via-emerald-600 to-slate-800",
  "from-fuchsia-400 via-purple-500 to-indigo-800",
] as const;

function paletteFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTES[hash % PALETTES.length] ?? PALETTES[0];
}

/**
 * The large picture area of a profile card. Photos stay private until mutual
 * consent, so most members appear as a colour wash (their blurred thumbnail,
 * or a palette derived from their id) under a geometric pattern and star motif.
 */
export function ProfileVisual({ profile, className }: { profile: PublicProfile; className?: string }) {
  // useId output is not always a valid URL fragment, so keep only the safe characters.
  const patternId = `pattern-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <div className={cn("relative overflow-hidden", className)}>
      <ProtectedPhoto
        userId={profile.id}
        name={profile.displayName}
        access={profile.photoAccess}
        showLock={false}
        className={cn("size-full", paletteFor(profile.id))}
        // The name is printed over this area, so initials would only compete with it.
        initialsClassName="hidden"
      />
      <svg className="pointer-events-none absolute inset-0 size-full text-white opacity-[0.13] mix-blend-overlay" aria-hidden>
        <defs>
          <pattern id={patternId} width="56" height="56" patternUnits="userSpaceOnUse">
            <path
              d="M28 4 34 22 52 28 34 34 28 52 22 34 4 28 22 22Z M0 0h56v56H0Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${patternId})`} />
      </svg>
      <svg
        viewBox="0 0 100 100"
        className="pointer-events-none absolute top-[36%] left-1/2 size-[42%] max-h-40 max-w-40 -translate-x-1/2 -translate-y-1/2 text-white opacity-25"
        aria-hidden
      >
        <path
          d="M50 4 62 38 96 50 62 62 50 96 38 62 4 50 38 38Z M50 20 71 29 80 50 71 71 50 80 29 71 20 50 29 29Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
