import React, { useState, useEffect } from 'react';
import { useAuth } from './AuthProvider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Switch } from './ui/switch';
import { Separator } from './ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import {
  User, Shield, Save, ShieldCheck, BookOpen, Heart, MessageSquare,
  CheckCircle2, AlertCircle, Eye, EyeOff, MapPin, Briefcase,
  GraduationCap, Globe, Languages, Ruler, Users, Lock,
} from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';

const ROLE_LABELS: Record<string, string> = {
  SOLO: 'Independent Seeker',
  DEPENDENT: 'Dependent Seeker (Wali Involved)',
  PARENT: 'Parent / Guardian',
  MAHRAM: 'Mahram (Chaperone)',
};

const PRIVACY_FIELDS: { key: string; label: string; icon: React.ReactNode }[] = [
  { key: 'age',            label: 'Age',               icon: <User className="h-4 w-4" /> },
  { key: 'location',      label: 'Location',           icon: <MapPin className="h-4 w-4" /> },
  { key: 'profession',    label: 'Profession',         icon: <Briefcase className="h-4 w-4" /> },
  { key: 'education',     label: 'Education',          icon: <GraduationCap className="h-4 w-4" /> },
  { key: 'height',        label: 'Height',             icon: <Ruler className="h-4 w-4" /> },
  { key: 'nationality',   label: 'Nationality',        icon: <Globe className="h-4 w-4" /> },
  { key: 'languages',     label: 'Languages',          icon: <Languages className="h-4 w-4" /> },
  { key: 'maritalStatus', label: 'Marital Status',     icon: <Users className="h-4 w-4" /> },
  { key: 'prayerFrequency', label: 'Prayer Frequency', icon: <Shield className="h-4 w-4" /> },
  { key: 'dietaryHabits', label: 'Dietary Habits',     icon: <Shield className="h-4 w-4" /> },
  { key: 'bio',           label: 'Bio',                icon: <User className="h-4 w-4" /> },
];

const MODULES = ['intro', 'wali', 'finance'];
const MODULE_LABELS: Record<string, string> = {
  intro: 'Etiquette of Halal Courtship',
  wali: 'The Role of the Wali',
  finance: 'Financial Responsibilities',
};

function ProfileCompleteness({ dbUser }: { dbUser: any }) {
  const fields = [
    dbUser?.displayName, dbUser?.age, dbUser?.location, dbUser?.profession,
    dbUser?.bio, dbUser?.prayerFrequency, dbUser?.dietaryHabits, dbUser?.gender,
    dbUser?.maritalStatus, dbUser?.education,
  ];
  const filled = fields.filter(Boolean).length;
  const pct = Math.round((filled / fields.length) * 100);
  const color = pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-400' : 'bg-rose-400';
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span className="font-medium text-slate-700">Profile Completeness</span>
        <span className={`font-bold ${pct >= 80 ? 'text-emerald-600' : pct >= 50 ? 'text-amber-600' : 'text-rose-600'}`}>{pct}%</span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      {pct < 100 && <p className="text-xs text-slate-400">Fill in all profile fields to increase your visibility</p>}
    </div>
  );
}

export const ProfilePage: React.FC = () => {
  const { firebaseUser, dbUser, setDbUser } = useAuth();

  const [displayName, setDisplayName] = useState(dbUser?.displayName ?? firebaseUser?.displayName ?? '');
  const [age, setAge] = useState(dbUser?.age?.toString() ?? '');
  const [location, setLocation] = useState(dbUser?.location ?? '');
  const [profession, setProfession] = useState(dbUser?.profession ?? '');
  const [prayerFrequency, setPrayerFrequency] = useState(dbUser?.prayerFrequency ?? '');
  const [dietaryHabits, setDietaryHabits] = useState(dbUser?.dietaryHabits ?? '');
  const [bio, setBio] = useState(dbUser?.bio ?? '');
  const [height, setHeight] = useState((dbUser as any)?.height ?? '');
  const [maritalStatus, setMaritalStatus] = useState((dbUser as any)?.maritalStatus ?? '');
  const [education, setEducation] = useState((dbUser as any)?.education ?? '');
  const [nationality, setNationality] = useState((dbUser as any)?.nationality ?? '');
  const [languages, setLanguages] = useState<string>((dbUser as any)?.languages?.join(', ') ?? '');
  const [modestyBlurEnabled, setModestyBlurEnabled] = useState(dbUser?.modestyBlurEnabled ?? false);
  const [requiresParentalVetting, setRequiresParentalVetting] = useState(dbUser?.requiresParentalVetting ?? false);
  const [hiddenFields, setHiddenFields] = useState<string[]>((dbUser as any)?.hiddenFields ?? []);
  const [activeConnections, setActiveConnections] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!firebaseUser) return;
    fetch(`/api/users/connections/count?firebaseUid=${encodeURIComponent(firebaseUser.uid)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.count !== undefined) setActiveConnections(d.count); })
      .catch(() => {});
  }, [firebaseUser]);

  const toggleHiddenField = (key: string) => {
    setHiddenFields(prev => prev.includes(key) ? prev.filter(f => f !== key) : [...prev, key]);
  };

  const handleSave = async () => {
    if (!firebaseUser) return;
    setSaving(true);
    try {
      const res = await fetch('/api/users/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firebaseUid: firebaseUser.uid,
          displayName: displayName || undefined,
          age: age ? parseInt(age, 10) : undefined,
          location: location || undefined,
          profession: profession || undefined,
          prayerFrequency: prayerFrequency || undefined,
          dietaryHabits: dietaryHabits || undefined,
          bio: bio || undefined,
          modestyBlurEnabled,
          requiresParentalVetting,
          height: height || undefined,
          maritalStatus: maritalStatus || undefined,
          education: education || undefined,
          nationality: nationality || undefined,
          languages: languages ? languages.split(',').map((l: string) => l.trim()).filter(Boolean) : [],
          hiddenFields,
        }),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setDbUser(updated);
      toast.success('Profile saved!');
    } catch {
      toast.error('Failed to save profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const completedModules = dbUser?.completedModules ?? [];
  const readinessPct = Math.round((completedModules.length / MODULES.length) * 100);

  return (
    <div className="max-w-2xl mx-auto p-3 sm:p-4 pb-16">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">

        {/* Header */}
        <div className="flex items-center gap-4 py-4 sm:py-6">
          <Avatar className="h-16 w-16 sm:h-20 sm:w-20 border-4 border-rose-100 shrink-0">
            <AvatarImage src={firebaseUser?.photoURL ?? undefined} />
            <AvatarFallback className="text-xl sm:text-2xl bg-rose-100 text-rose-600">
              {(displayName || firebaseUser?.displayName || 'U').charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 truncate">{displayName || 'Your Profile'}</h1>
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              {dbUser?.role && (
                <Badge variant="secondary" className="bg-rose-100 text-rose-700 border-none text-xs">
                  {ROLE_LABELS[dbUser.role] ?? dbUser.role}
                </Badge>
              )}
              {dbUser?.isIntroCompleted && (
                <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 border-none text-xs">
                  <ShieldCheck className="h-3 w-3 mr-1" />Readiness Certified
                </Badge>
              )}
              {(dbUser as any)?.hiddenFields?.length > 0 && (
                <Badge variant="secondary" className="bg-slate-100 text-slate-600 border-none text-xs">
                  <Lock className="h-3 w-3 mr-1" />{(dbUser as any).hiddenFields.length} private
                </Badge>
              )}
            </div>
          </div>
        </div>

        <Tabs defaultValue="dashboard" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-2">
            <TabsTrigger value="dashboard" className="text-xs sm:text-sm">Dashboard</TabsTrigger>
            <TabsTrigger value="edit" className="text-xs sm:text-sm">Edit Profile</TabsTrigger>
            <TabsTrigger value="privacy" className="text-xs sm:text-sm">Privacy</TabsTrigger>
          </TabsList>

          {/* ── TAB 1: DASHBOARD ── */}
          <TabsContent value="dashboard" className="space-y-4 mt-2">
            <Card className="border-none shadow-md">
              <CardContent className="pt-5 pb-4">
                <ProfileCompleteness dbUser={dbUser} />
              </CardContent>
            </Card>

            <div className="grid grid-cols-3 gap-3">
              {[
                { value: activeConnections ?? '—', label: 'Active Connections', color: 'text-rose-500' },
                { value: completedModules.length,   label: 'Modules Done',      color: 'text-emerald-500' },
                { value: (dbUser as any)?.hiddenFields?.length ?? 0, label: 'Private Fields', color: 'text-slate-600' },
              ].map(s => (
                <Card key={s.label} className="border-none shadow-sm text-center">
                  <CardContent className="pt-4 pb-3 px-2">
                    <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
                    <p className="text-[10px] text-slate-500 font-medium mt-0.5 leading-tight">{s.label}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card className="border-none shadow-md">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-rose-500" />
                  <CardTitle className="text-base">Marriage Readiness</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>Progress</span>
                    <span className="font-bold text-slate-700">{completedModules.length} / {MODULES.length}</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full transition-all duration-700" style={{ width: `${readinessPct}%` }} />
                  </div>
                </div>
                {MODULES.map(m => (
                  <div key={m} className="flex items-center justify-between py-1 border-b border-slate-50 last:border-0">
                    <span className="text-sm text-slate-700">{MODULE_LABELS[m]}</span>
                    {completedModules.includes(m)
                      ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                      : <AlertCircle className="h-4 w-4 text-slate-200 shrink-0" />}
                  </div>
                ))}
                {!dbUser?.isIntroCompleted && (
                  <Link to="/readiness">
                    <Button size="sm" className="w-full bg-rose-600 hover:bg-rose-700 text-white mt-1">Continue Readiness Hub</Button>
                  </Link>
                )}
              </CardContent>
            </Card>

            <Card className="border-none shadow-md">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-2">
                {(dbUser?.role === 'SOLO' || dbUser?.role === 'DEPENDENT') && (
                  <Link to="/feed">
                    <Button variant="outline" className="w-full h-auto flex flex-col items-center gap-1.5 py-4 text-xs hover:border-rose-300 hover:text-rose-600">
                      <Heart className="h-5 w-5" />Browse Matches
                    </Button>
                  </Link>
                )}
                <Link to="/chats">
                  <Button variant="outline" className="w-full h-auto flex flex-col items-center gap-1.5 py-4 text-xs hover:border-rose-300 hover:text-rose-600">
                    <MessageSquare className="h-5 w-5" />Messages
                  </Button>
                </Link>
                {dbUser?.role === 'PARENT' && (
                  <Link to="/parent-dashboard">
                    <Button variant="outline" className="w-full h-auto flex flex-col items-center gap-1.5 py-4 text-xs hover:border-rose-300 hover:text-rose-600">
                      <Shield className="h-5 w-5" />Guardian Dashboard
                    </Button>
                  </Link>
                )}
                <Link to="/readiness">
                  <Button variant="outline" className="w-full h-auto flex flex-col items-center gap-1.5 py-4 text-xs hover:border-rose-300 hover:text-rose-600">
                    <BookOpen className="h-5 w-5" />Readiness Hub
                  </Button>
                </Link>
              </CardContent>
            </Card>

            <Card className="border-none shadow-md">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Account</CardTitle>
              </CardHeader>
              <CardContent className="space-y-0">
                {[
                  { label: 'Email',        value: firebaseUser?.email },
                  { label: 'Role',         value: dbUser?.role ? ROLE_LABELS[dbUser.role] : '—' },
                  { label: 'Gender',       value: dbUser?.gender ? dbUser.gender.charAt(0).toUpperCase() + dbUser.gender.slice(1) : '—' },
                  { label: 'Member since', value: dbUser?.createdAt ? new Date(dbUser.createdAt).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : '—' },
                ].map(row => (
                  <div key={row.label} className="flex justify-between py-2.5 border-b border-slate-50 last:border-0 text-sm">
                    <span className="text-slate-400">{row.label}</span>
                    <span className="font-medium text-slate-700 truncate ml-4 max-w-[55%] text-right">{row.value}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── TAB 2: EDIT PROFILE ── */}
          <TabsContent value="edit" className="space-y-4 mt-2">
            <Card className="border-none shadow-md">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2"><User className="h-4 w-4 text-rose-500" /><CardTitle className="text-base">Personal Details</CardTitle></div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { label: 'Display Name',  value: displayName,  setter: setDisplayName,  placeholder: 'Your name',            type: 'text'   },
                    { label: 'Age',           value: age,          setter: setAge,           placeholder: 'e.g. 27',              type: 'number' },
                    { label: 'Location',      value: location,     setter: setLocation,      placeholder: 'City, Country',        type: 'text'   },
                    { label: 'Nationality',   value: nationality,  setter: setNationality,   placeholder: 'e.g. British, Somali', type: 'text'   },
                    { label: 'Height',        value: height,       setter: setHeight,        placeholder: "e.g. 5'8\" / 173cm",   type: 'text'   },
                    { label: 'Profession',    value: profession,   setter: setProfession,    placeholder: 'Your occupation',      type: 'text'   },
                  ].map(f => (
                    <div key={f.label} className="space-y-1.5">
                      <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{f.label}</Label>
                      <Input type={f.type} value={f.value} onChange={e => f.setter(e.target.value)} placeholder={f.placeholder} min={f.type === 'number' ? 18 : undefined} max={f.type === 'number' ? 99 : undefined} />
                    </div>
                  ))}

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Marital Status</Label>
                    <Select value={maritalStatus} onValueChange={setMaritalStatus}>
                      <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Never Married">Never Married</SelectItem>
                        <SelectItem value="Divorced">Divorced</SelectItem>
                        <SelectItem value="Widowed">Widowed</SelectItem>
                        <SelectItem value="Annulled">Annulled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Education</Label>
                    <Select value={education} onValueChange={setEducation}>
                      <SelectTrigger><SelectValue placeholder="Highest level" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="High School">High School</SelectItem>
                        <SelectItem value="Bachelor's">Bachelor's Degree</SelectItem>
                        <SelectItem value="Master's">Master's Degree</SelectItem>
                        <SelectItem value="Doctorate">Doctorate / PhD</SelectItem>
                        <SelectItem value="Other">Other / Vocational</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Languages (comma-separated)</Label>
                    <Input value={languages} onChange={e => setLanguages(e.target.value)} placeholder="e.g. English, Arabic, Urdu" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Bio</Label>
                  <textarea
                    value={bio}
                    onChange={e => setBio(e.target.value)}
                    placeholder="A short introduction about yourself and what you are looking for in a spouse..."
                    rows={4}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="border-none shadow-md">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2"><Shield className="h-4 w-4 text-rose-500" /><CardTitle className="text-base">Deen Profile</CardTitle></div>
                <CardDescription className="text-xs">Shown to potential matches for compatibility.</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Prayer Frequency</Label>
                  <Select value={prayerFrequency} onValueChange={setPrayerFrequency}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Always">Always (5x daily)</SelectItem>
                      <SelectItem value="Usually">Usually</SelectItem>
                      <SelectItem value="Sometimes">Sometimes</SelectItem>
                      <SelectItem value="Rarely">Rarely</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Dietary Habits</Label>
                  <Select value={dietaryHabits} onValueChange={setDietaryHabits}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Strictly Halal">Strictly Halal</SelectItem>
                      <SelectItem value="Halal">Halal</SelectItem>
                      <SelectItem value="Flexible">Flexible</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <Button onClick={handleSave} disabled={saving} className="w-full bg-rose-600 hover:bg-rose-700 text-white py-4 sm:py-5 text-base font-bold rounded-2xl">
              <Save className="h-4 w-4 mr-2" />{saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </TabsContent>

          {/* ── TAB 3: PRIVACY ── */}
          <TabsContent value="privacy" className="space-y-4 mt-2">
            <Card className="border-none shadow-md">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2"><Lock className="h-4 w-4 text-rose-500" /><CardTitle className="text-base">Photo Privacy</CardTitle></div>
                <CardDescription className="text-xs">Control how your profile photo appears to others.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="space-y-0.5 pr-4">
                    <Label className="font-semibold text-sm">Modesty Blur</Label>
                    <p className="text-xs text-slate-500">Your photo is blurred until a connection is mutually approved</p>
                  </div>
                  <Switch checked={modestyBlurEnabled} onCheckedChange={setModestyBlurEnabled} />
                </div>
              </CardContent>
            </Card>

            <Card className="border-none shadow-md">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2"><EyeOff className="h-4 w-4 text-rose-500" /><CardTitle className="text-base">Field Visibility</CardTitle></div>
                <CardDescription className="text-xs">Toggle which fields others can see on your profile card. Hidden fields are only visible to you.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {PRIVACY_FIELDS.map(({ key, label, icon }) => {
                  const isHidden = hiddenFields.includes(key);
                  return (
                    <div key={key} className={`flex items-center justify-between p-3 rounded-xl border transition-colors ${isHidden ? 'bg-slate-50 border-slate-200' : 'bg-white border-slate-100'}`}>
                      <div className="flex items-center gap-2.5">
                        <span className={isHidden ? 'text-slate-300' : 'text-slate-500'}>{icon}</span>
                        <div>
                          <p className={`text-sm font-medium ${isHidden ? 'text-slate-400' : 'text-slate-700'}`}>{label}</p>
                          {isHidden && <p className="text-[11px] text-slate-400">Hidden from profile</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold">
                          {isHidden
                            ? <span className="text-slate-400 flex items-center gap-1"><EyeOff className="h-3 w-3" /> Private</span>
                            : <span className="text-emerald-600 flex items-center gap-1"><Eye className="h-3 w-3" /> Visible</span>}
                        </span>
                        <Switch checked={!isHidden} onCheckedChange={() => toggleHiddenField(key)} />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {(dbUser?.role === 'SOLO' || dbUser?.role === 'DEPENDENT') && (
              <Card className="border-none shadow-md">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2"><Users className="h-4 w-4 text-rose-500" /><CardTitle className="text-base">Wali / Family</CardTitle></div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="space-y-0.5 pr-4">
                      <Label className="font-semibold text-sm">Parental Vetting</Label>
                      <p className="text-xs text-slate-500">Your Wali must approve connection requests before they proceed</p>
                    </div>
                    <Switch checked={requiresParentalVetting} onCheckedChange={setRequiresParentalVetting} />
                  </div>
                </CardContent>
              </Card>
            )}

            <Button onClick={handleSave} disabled={saving} className="w-full bg-rose-600 hover:bg-rose-700 text-white py-4 sm:py-5 text-base font-bold rounded-2xl">
              <Save className="h-4 w-4 mr-2" />{saving ? 'Saving...' : 'Save Privacy Settings'}
            </Button>
          </TabsContent>
        </Tabs>
      </motion.div>
    </div>
  );
};
