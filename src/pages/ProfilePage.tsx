import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Camera, CheckCircle2, Circle, Lock, Save, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "../components/shared/PageState";
import { ProtectedPhoto } from "../components/shared/ProtectedPhoto";
import { Badge } from "../components/ui/badge";
import { Button, buttonVariants } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { NativeSelect } from "../components/ui/native-select";
import { Switch } from "../components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Textarea } from "../components/ui/textarea";
import { useAuth, useCurrentUser } from "../context/AuthContext";
import { api, errorMessage } from "../lib/api";
import {
  DIETARY_HABITS,
  EDUCATION_LEVELS,
  MARITAL_STATUSES,
  PRAYER_FREQUENCIES,
  PRIVACY_FIELD_KEYS,
  PRIVACY_FIELD_LABELS,
  ROLE_LABELS,
  type PrivacyFieldKey,
} from "../lib/constants";
import type { ProfileUpdateInput, SelfUser } from "../lib/contracts";
import { prepareProfilePhoto } from "../lib/image";
import { READINESS_MODULES } from "../lib/readiness";
import { cn } from "../lib/utils";

function pick<T extends string>(options: readonly T[], value: string): T | null {
  return options.find((o) => o === value) ?? null;
}

function OptionSelect({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <NativeSelect id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Prefer not to say</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}

function EditProfile({ user, onSaved }: { user: SelfUser; onSaved: (user: SelfUser) => void }) {
  const [form, setForm] = useState({
    displayName: user.displayName ?? "",
    age: user.age?.toString() ?? "",
    location: user.location ?? "",
    profession: user.profession ?? "",
    nationality: user.nationality ?? "",
    height: user.height ?? "",
    phone: user.phone ?? "",
    languages: user.languages.join(", "),
    bio: user.bio ?? "",
    prayerFrequency: user.prayerFrequency ?? "",
    dietaryHabits: user.dietaryHabits ?? "",
    maritalStatus: user.maritalStatus ?? "",
    education: user.education ?? "",
  });
  const [saving, setSaving] = useState(false);
  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    const age = form.age ? Number.parseInt(form.age, 10) : null;
    if (age !== null && (!Number.isInteger(age) || age < 18 || age > 99)) {
      toast.error("Age must be between 18 and 99.");
      return;
    }
    const patch: ProfileUpdateInput = {
      displayName: form.displayName.trim(),
      age,
      location: form.location.trim() || null,
      profession: form.profession.trim() || null,
      nationality: form.nationality.trim() || null,
      height: form.height.trim() || null,
      phone: form.phone.trim() || null,
      bio: form.bio.trim() || null,
      languages: form.languages.split(",").map((l) => l.trim()).filter(Boolean),
      prayerFrequency: pick(PRAYER_FREQUENCIES, form.prayerFrequency),
      dietaryHabits: pick(DIETARY_HABITS, form.dietaryHabits),
      maritalStatus: pick(MARITAL_STATUSES, form.maritalStatus),
      education: pick(EDUCATION_LEVELS, form.education),
    };
    setSaving(true);
    try {
      onSaved(await api.updateProfile(patch));
      toast.success("Profile saved.");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const text = (key: keyof typeof form, label: string, props: { type?: string; placeholder?: string; maxLength?: number } = {}) => (
    <div className="space-y-1.5">
      <Label htmlFor={`profile-${key}`}>{label}</Label>
      <Input id={`profile-${key}`} value={form[key]} onChange={(e) => set(key)(e.target.value)} {...props} />
    </div>
  );

  return (
    <Card className="border-none shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Personal & deen details</CardTitle>
        <CardDescription>Shown to potential matches unless you hide a field in Privacy.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {text("displayName", "Display name", { maxLength: 80 })}
          {text("age", "Age", { type: "number" })}
          {text("location", "Location", { placeholder: "City, Country", maxLength: 120 })}
          {text("nationality", "Nationality", { maxLength: 80 })}
          {text("profession", "Profession", { maxLength: 120 })}
          {text("height", "Height", { placeholder: "e.g. 173 cm", maxLength: 40 })}
          <OptionSelect id="prayer" label="Prayer frequency" value={form.prayerFrequency} options={PRAYER_FREQUENCIES} onChange={set("prayerFrequency")} />
          <OptionSelect id="diet" label="Dietary habits" value={form.dietaryHabits} options={DIETARY_HABITS} onChange={set("dietaryHabits")} />
          <OptionSelect id="marital" label="Marital status" value={form.maritalStatus} options={MARITAL_STATUSES} onChange={set("maritalStatus")} />
          <OptionSelect id="education" label="Education" value={form.education} options={EDUCATION_LEVELS} onChange={set("education")} />
          {text("languages", "Languages (comma separated)", { placeholder: "English, Arabic" })}
          {text("phone", "Phone (private — never shown)", { type: "tel", maxLength: 32 })}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="profile-bio">Bio</Label>
          <Textarea
            id="profile-bio"
            rows={4}
            maxLength={1000}
            value={form.bio}
            onChange={(e) => set("bio")(e.target.value)}
            placeholder="A short introduction and what you hope for in a spouse…"
          />
        </div>
        <Button onClick={() => void save()} disabled={saving} className="w-full bg-rose-600 text-white hover:bg-rose-700">
          <Save /> {saving ? "Saving…" : "Save changes"}
        </Button>
      </CardContent>
    </Card>
  );
}

function PhotoAndPrivacy({ user, onSaved }: { user: SelfUser; onSaved: (user: SelfUser) => void }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [photoVersion, setPhotoVersion] = useState(0);
  const isSeeker = user.role === "SOLO" || user.role === "DEPENDENT";

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      onSaved(await api.uploadPhoto(await prepareProfilePhoto(file)));
      setPhotoVersion((v) => v + 1);
      toast.success("Photo updated. It stays private until you consent in an approved chat.");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const update = async (patch: ProfileUpdateInput) => {
    try {
      onSaved(await api.updateProfile(patch));
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const toggleHidden = (key: PrivacyFieldKey) => {
    const hidden = user.hiddenFields.includes(key)
      ? user.hiddenFields.filter((f) => f !== key)
      : [...user.hiddenFields, key];
    void update({ hiddenFields: hidden });
  };

  return (
    <div className="space-y-4">
      <Card className="border-none shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Camera className="size-4 text-rose-500" /> Profile photo
          </CardTitle>
          <CardDescription>
            Photos are stored privately and never shown in full until both of you consent inside an approved, chaperoned chat.
            Location metadata is stripped on upload.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4 sm:flex-row">
          <ProtectedPhoto
            userId={user.id}
            name={user.displayName ?? user.email}
            access={user.hasPhoto ? "FULL" : "NONE"}
            className="size-32 rounded-2xl"
            showLock={false}
            version={photoVersion}
          />
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => void upload(e.target.files?.[0])}
            />
            <Button disabled={uploading} onClick={() => fileInput.current?.click()} className="bg-rose-600 text-white hover:bg-rose-700">
              <Camera /> {uploading ? "Uploading…" : user.hasPhoto ? "Replace photo" : "Upload photo"}
            </Button>
            {user.hasPhoto && (
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    onSaved(await api.deletePhoto());
                    toast.success("Photo removed.");
                  } catch (err) {
                    toast.error(errorMessage(err));
                  }
                }}
              >
                <Trash2 /> Remove
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-none shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Lock className="size-4 text-rose-500" /> Privacy controls
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between gap-4 rounded-xl bg-slate-50 p-3">
            <div>
              <p className="text-sm font-semibold">Modesty blur</p>
              <p className="text-xs text-slate-500">
                On: no photo at all in match introductions. Off: a heavily blurred preview is shown.
              </p>
            </div>
            <Switch checked={user.modestyBlurEnabled} onCheckedChange={(checked) => void update({ modestyBlurEnabled: checked })} />
          </div>
          {isSeeker && (
            <div className="flex items-center justify-between gap-4 rounded-xl bg-slate-50 p-3">
              <div>
                <p className="text-sm font-semibold">Wali vetting</p>
                <p className="text-xs text-slate-500">
                  {user.role === "DEPENDENT"
                    ? "Always on for seekers with a wali."
                    : "Your wali approves outgoing requests, and incoming requests also need their approval."}
                </p>
              </div>
              <Switch
                checked={user.requiresParentalVetting}
                disabled={user.role === "DEPENDENT"}
                onCheckedChange={(checked) => void update({ requiresParentalVetting: checked })}
              />
            </div>
          )}
          <div className="pt-2">
            <p className="mb-2 text-sm font-semibold">Field visibility</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {PRIVACY_FIELD_KEYS.map((key) => {
                const hidden = user.hiddenFields.includes(key);
                return (
                  <label
                    key={key}
                    className={cn(
                      "flex cursor-pointer items-center justify-between rounded-xl border p-2.5 text-sm",
                      hidden ? "border-slate-200 bg-slate-50 text-slate-400" : "border-slate-100",
                    )}
                  >
                    <span>
                      {PRIVACY_FIELD_LABELS[key]}
                      <span className="block text-[11px]">{hidden ? "Hidden from others" : "Visible"}</span>
                    </span>
                    <Switch checked={!hidden} onCheckedChange={() => toggleHidden(key)} />
                  </label>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function ProfilePage() {
  const user = useCurrentUser();
  const { setUser } = useAuth();
  const completed = new Set(user.completedModules);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <PageHeader
        title={user.displayName ?? "Your profile"}
        description={user.email}
        actions={
          <>
            <Badge variant="secondary" className="h-7 bg-rose-100 px-3 text-rose-700">
              {ROLE_LABELS[user.role]}
            </Badge>
            {user.readinessCompleted && (
              <Badge variant="secondary" className="h-7 bg-emerald-100 px-3 text-emerald-700">
                <ShieldCheck /> Readiness certified
              </Badge>
            )}
          </>
        }
      />

      <Tabs defaultValue="edit">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="edit">Profile</TabsTrigger>
          <TabsTrigger value="privacy">Photo & privacy</TabsTrigger>
          <TabsTrigger value="account">Account</TabsTrigger>
        </TabsList>
        <TabsContent value="edit" className="mt-4">
          <EditProfile user={user} onSaved={setUser} />
        </TabsContent>
        <TabsContent value="privacy" className="mt-4">
          <PhotoAndPrivacy user={user} onSaved={setUser} />
        </TabsContent>
        <TabsContent value="account" className="mt-4 space-y-4">
          <Card className="border-none shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Marriage readiness</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {READINESS_MODULES.map((module) => (
                <div key={module.id} className="flex items-center justify-between border-b border-slate-50 py-1.5 text-sm last:border-0">
                  <span>{module.title}</span>
                  {completed.has(module.id) ? (
                    <CheckCircle2 className="size-4 text-emerald-500" />
                  ) : (
                    <Circle className="size-4 text-slate-300" />
                  )}
                </div>
              ))}
              <Link to="/readiness" className={cn(buttonVariants({ variant: "outline" }), "mt-2 w-full")}>
                Open Readiness Hub
              </Link>
            </CardContent>
          </Card>
          <Card className="border-none shadow-sm">
            <CardContent className="divide-y divide-slate-50 pt-4 text-sm">
              {[
                ["Email", user.email],
                ["Sign-in method", user.authProvider === "google" ? "Google" : "Email & password"],
                ["Role", ROLE_LABELS[user.role]],
                ["Gender", user.gender ? user.gender.charAt(0).toUpperCase() + user.gender.slice(1) : "—"],
                ["Member since", new Date(user.createdAt).toLocaleDateString(undefined, { month: "long", year: "numeric" })],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4 py-2.5">
                  <span className="text-slate-400">{label}</span>
                  <span className="truncate text-right font-medium text-slate-700">{value}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
