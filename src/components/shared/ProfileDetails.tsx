import { BookOpen, Briefcase, Clock, GraduationCap, Globe, Languages, MapPin, Ruler, ShieldCheck, Users, Utensils } from "lucide-react";
import type { ReactNode } from "react";
import type { PrivacyFieldKey } from "../../lib/constants";
import type { PublicProfile } from "../../lib/contracts";
import { READINESS_MODULES } from "../../lib/readiness";
import { Badge } from "../ui/badge";

function Fact({ icon, label, value }: { icon: ReactNode; label: string; value: string | number | null }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
      <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold tracking-wider text-slate-400 uppercase [&_svg]:size-3.5 [&_svg]:text-rose-500">
        {icon}
        {label}
      </div>
      <p className="text-sm font-semibold text-slate-800">{value ?? <span className="font-normal text-slate-400">Private</span>}</p>
    </div>
  );
}

export function ProfileDetails({ profile }: { profile: PublicProfile }) {
  const hidden = new Set<PrivacyFieldKey>(profile.hiddenFields);
  const moduleTitles = profile.completedModules
    .map((id) => READINESS_MODULES.find((m) => m.id === id)?.title)
    .filter((title): title is string => Boolean(title));

  // "Private" means the member chose to hide it; a detail they never filled in is simply left out.
  const fact = (key: PrivacyFieldKey, icon: ReactNode, label: string, value: string | number | null) => {
    if (hidden.has(key)) return <Fact key={key} icon={icon} label={label} value={null} />;
    if (value === null || value === "") return null;
    return <Fact key={key} icon={icon} label={label} value={value} />;
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {fact("prayerFrequency", <Clock />, "Prayer", profile.prayerFrequency)}
        {fact("dietaryHabits", <Utensils />, "Diet", profile.dietaryHabits)}
        {fact("profession", <Briefcase />, "Profession", profile.profession)}
        {fact("location", <MapPin />, "Location", profile.location)}
        {fact("education", <GraduationCap />, "Education", profile.education)}
        {fact("maritalStatus", <Users />, "Marital status", profile.maritalStatus)}
        {fact("height", <Ruler />, "Height", profile.height)}
        {fact("nationality", <Globe />, "Nationality", profile.nationality)}
        {fact("languages", <Languages />, "Languages", profile.languages.join(", "))}
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
