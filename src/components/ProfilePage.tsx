import React, { useState } from 'react';
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
import { User, Shield, Bell, Save, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'motion/react';

const ROLE_LABELS: Record<string, string> = {
  SOLO: 'Independent Seeker',
  DEPENDENT: 'Dependent Seeker (Wali Involved)',
  PARENT: 'Parent / Guardian',
  MAHRAM: 'Mahram (Chaperone)',
};

export const ProfilePage: React.FC = () => {
  const { firebaseUser, dbUser, setDbUser } = useAuth();

  const [displayName, setDisplayName] = useState(dbUser?.displayName ?? firebaseUser?.displayName ?? '');
  const [age, setAge] = useState(dbUser?.age?.toString() ?? '');
  const [location, setLocation] = useState(dbUser?.location ?? '');
  const [profession, setProfession] = useState(dbUser?.profession ?? '');
  const [prayerFrequency, setPrayerFrequency] = useState(dbUser?.prayerFrequency ?? '');
  const [dietaryHabits, setDietaryHabits] = useState(dbUser?.dietaryHabits ?? '');
  const [bio, setBio] = useState(dbUser?.bio ?? '');
  const [modestyBlurEnabled, setModestyBlurEnabled] = useState(dbUser?.modestyBlurEnabled ?? false);
  const [requiresParentalVetting, setRequiresParentalVetting] = useState(dbUser?.requiresParentalVetting ?? false);
  const [saving, setSaving] = useState(false);

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
        }),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setDbUser(updated);
      toast.success("Profile saved!");
    } catch {
      toast.error("Failed to save profile. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-6 pb-12">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        {/* Header */}
        <div className="flex items-center gap-4 py-6">
          <Avatar className="h-20 w-20 border-4 border-rose-100">
            <AvatarImage src={firebaseUser?.photoURL ?? undefined} />
            <AvatarFallback className="text-2xl bg-rose-100 text-rose-600">
              {(displayName || firebaseUser?.displayName || 'U').charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{displayName || 'Your Profile'}</h1>
            <div className="flex items-center gap-2 mt-1">
              {dbUser?.role && (
                <Badge variant="secondary" className="bg-rose-100 text-rose-700 border-none">
                  {ROLE_LABELS[dbUser.role] ?? dbUser.role}
                </Badge>
              )}
              {dbUser?.isIntroCompleted && (
                <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 border-none">
                  <ShieldCheck className="h-3 w-3 mr-1" />
                  Readiness Certified
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Personal Details */}
        <Card className="border-none shadow-md">
          <CardHeader>
            <div className="flex items-center gap-2">
              <User className="h-5 w-5 text-rose-500" />
              <CardTitle className="text-lg">Personal Details</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Display Name</Label>
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your name"
                />
              </div>
              <div className="space-y-2">
                <Label>Age</Label>
                <Input
                  type="number"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  placeholder="Your age"
                  min={18}
                  max={99}
                />
              </div>
              <div className="space-y-2">
                <Label>Location</Label>
                <Input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="City, Country"
                />
              </div>
              <div className="space-y-2">
                <Label>Profession</Label>
                <Input
                  value={profession}
                  onChange={(e) => setProfession(e.target.value)}
                  placeholder="Your occupation"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Bio</Label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="A short introduction about yourself and what you're looking for..."
                rows={3}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
              />
            </div>
          </CardContent>
        </Card>

        {/* Deen Profile */}
        <Card className="border-none shadow-md">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-rose-500" />
              <CardTitle className="text-lg">Deen Profile</CardTitle>
            </div>
            <CardDescription>These values are shown to potential matches and help with compatibility.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Prayer Frequency</Label>
                <Select value={prayerFrequency} onValueChange={setPrayerFrequency}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select frequency" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Always">Always (5x daily)</SelectItem>
                    <SelectItem value="Usually">Usually</SelectItem>
                    <SelectItem value="Sometimes">Sometimes</SelectItem>
                    <SelectItem value="Rarely">Rarely</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Dietary Habits</Label>
                <Select value={dietaryHabits} onValueChange={setDietaryHabits}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select habits" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Strictly Halal">Strictly Halal</SelectItem>
                    <SelectItem value="Halal">Halal</SelectItem>
                    <SelectItem value="Flexible">Flexible</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Privacy & Safety */}
        <Card className="border-none shadow-md">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-rose-500" />
              <CardTitle className="text-lg">Privacy & Safety</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
              <div className="space-y-0.5">
                <Label className="font-semibold">Modesty Blur</Label>
                <p className="text-xs text-slate-500">Blur your profile photo until a connection is approved</p>
              </div>
              <Switch checked={modestyBlurEnabled} onCheckedChange={setModestyBlurEnabled} />
            </div>

            {(dbUser?.role === 'SOLO' || dbUser?.role === 'DEPENDENT') && (
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                <div className="space-y-0.5">
                  <Label className="font-semibold">Parental Vetting</Label>
                  <p className="text-xs text-slate-500">Require your Wali's approval before any connection proceeds</p>
                </div>
                <Switch checked={requiresParentalVetting} onCheckedChange={setRequiresParentalVetting} />
              </div>
            )}

            <Separator />
            <div className="text-xs text-slate-400 space-y-1">
              <p><strong>Email:</strong> {firebaseUser?.email}</p>
              <p><strong>Role:</strong> {dbUser?.role ? ROLE_LABELS[dbUser.role] : '—'}</p>
              <p><strong>Gender:</strong> {dbUser?.gender ? dbUser.gender.charAt(0).toUpperCase() + dbUser.gender.slice(1) : '—'}</p>
            </div>
          </CardContent>
        </Card>

        <Button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-rose-600 hover:bg-rose-700 text-white py-6 text-lg font-bold rounded-2xl"
        >
          <Save className="h-5 w-5 mr-2" />
          {saving ? 'Saving...' : 'Save Profile'}
        </Button>
      </motion.div>
    </div>
  );
};
