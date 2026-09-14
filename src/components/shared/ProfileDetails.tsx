import { BookOpen, Briefcase, Clock, GraduationCap, Globe, Languages, MapPin, Ruler, ShieldCheck, Users, Utensils } from "lucide-react";
import type { ReactNode } from "react";
import type { PublicProfile } from "../../lib/contracts";
import { READINESS_MODULES } from "../../lib/readiness";
import { Badge } from "../ui/badge";

function Fact({ icon, label, value }: { icon: ReactNode; label: string; value: string | number | null }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
      <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold tracking-wider text-slate-400 uppercase">
        {icon}
        {label}
      </div>
      <p className="text-sm font-semibold text-slate-800">{value ?? <span className="font-normal text-slate-400">Private</span>}</p>
    </div>
  );
}

export function ProfileDetails({ profile, compact = false }: { profile: PublicProfile; compact?: boolean }) {
  const moduleTitles = profile.completedModules
    .map((id) => READINESS_MODULES.find((m) => m.id === id)?.title)
    .filter((title): title is string => Boolean(title));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Fact icon={<Clock className="size-3.5 text-rose-500" />} label="Prayer" value={profile.prayerFrequency} />
        <Fact icon={<Utensils className="size-3.5 text-rose-500" />} label="Diet" value={profile.dietaryHabits} />
        <Fact icon={<Briefcase className="size-3.5 text-rose-500" />} label="Profession" value={profile.profession} />
        {!compact && (
          <>
            <Fact icon={<MapPin className="size-3.5 text-rose-500" />} label="Location" value={profile.location} />
            <Fact icon={<GraduationCap className="size-3.5 text-rose-500" />} label="Education" value={profile.education} />
            <Fact icon={<Users className="size-3.5 text-rose-500" />} label="Marital status" value={profile.maritalStatus} />
            <Fact icon={<Ruler className="size-3.5 text-rose-500" />} label="Height" value={profile.height} />
            <Fact icon={<Globe className="size-3.5 text-rose-500" />} label="Nationality" value={profile.nationality} />
            <Fact
              icon={<Languages className="size-3.5 text-rose-500" />}
              label="Languages"
              value={profile.hiddenFields.includes("languages") ? null : profile.languages.join(", ") || "—"}
            />
          </>
        )}
      </div>

      {profile.bio && <p className="rounded-xl bg-rose-50/60 p-3 text-sm leading-relaxed text-slate-700 italic">“{profile.bio}”</p>}

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="flex items-center gap-1 text-[10px] font-bold tracking-wider text-slate-400 uppercase">
          <ShieldCheck className="size-3.5 text-emerald-500" /> Readiness
        </span>
        {moduleTitles.length > 0 ? (
          moduleTitles.map((title) => (
            <Badge key={title} variant="outline" className="border-emerald-100 bg-emerald-50 text-emerald-700">
              <BookOpen /> {title}
            </Badge>
          ))
        ) : (
          <span className="text-xs text-slate-400">No modules completed yet</span>
        )}
      </div>
    </div>
  );
}
