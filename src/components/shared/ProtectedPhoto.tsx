import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { fetchPhoto } from "../../lib/api";
import type { PhotoAccess } from "../../lib/contracts";
import { initials } from "../../lib/format";
import { cn } from "../../lib/utils";

interface ProtectedPhotoProps {
  userId: string;
  name: string;
  access: PhotoAccess;
  className?: string;
  /** Show the lock badge when the photo is not fully revealed. */
  showLock?: boolean;
  /** Changes when the photo is replaced so the image re-fetches. */
  version?: string | number;
}

/**
 * Photos are fetched with the bearer token and the server decides what may be
 * returned. BLUR only ever receives a ~24px thumbnail, so there is nothing to
 * "unblur" client-side.
 */
export function ProtectedPhoto({ userId, name, access, className, showLock = true, version }: ProtectedPhotoProps) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (access === "NONE") {
      setSrc(null);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    fetchPhoto(userId, access === "FULL" ? "full" : "blur")
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setSrc(null);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [userId, access, version]);

  return (
    <div
      className={cn(
        "relative flex items-center justify-center overflow-hidden bg-gradient-to-br from-slate-600 to-slate-900 select-none",
        className,
      )}
    >
      {src ? (
        <img
          src={src}
          alt={access === "FULL" ? `Photo of ${name}` : ""}
          draggable={false}
          onContextMenu={(e) => e.preventDefault()}
          className={cn("size-full object-cover", access === "BLUR" && "scale-125 blur-xl saturate-50")}
        />
      ) : (
        <span className="text-lg font-semibold text-white/85" aria-hidden>
          {initials(name)}
        </span>
      )}
      {showLock && access !== "FULL" && (
        <span
          className="absolute right-1 bottom-1 flex size-5 items-center justify-center rounded-full bg-black/40 text-white"
          title="Photo stays private until mutual consent"
        >
          <Lock className="size-3" aria-hidden />
          <span className="sr-only">Photo private</span>
        </span>
      )}
    </div>
  );
}
