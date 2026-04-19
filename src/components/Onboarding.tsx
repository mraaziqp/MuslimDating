import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './ui/card';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Switch } from './ui/switch';
import type { UserRole } from '../lib/schema';
import { useAuth } from './AuthProvider';
import { toast } from 'sonner';
import { motion } from 'motion/react';

// Where to send each role after onboarding completes
const ROLE_HOME: Record<UserRole, string> = {
  SOLO: '/readiness',
  DEPENDENT: '/readiness',
  PARENT: '/parent-dashboard',
  MAHRAM: '/chats',
};

export const Onboarding: React.FC = () => {
  const [step, setStep] = useState(1);
  const [role, setRole] = useState<UserRole>('SOLO');
  const [displayName, setDisplayName] = useState('');
  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [requiresParentalVetting, setRequiresParentalVetting] = useState(false);
  const navigate = useNavigate();
  const { syncUser } = useAuth();

  const handleGoogleSignIn = async () => {
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const fbUser = result.user;

      // Check if this user already has a Neon profile
      const res = await fetch(`/api/users/me?firebaseUid=${encodeURIComponent(fbUser.uid)}`);
      if (res.ok) {
        const dbUser = await res.json();
        navigate(ROLE_HOME[dbUser.role as UserRole]);
      } else {
        setDisplayName(fbUser.displayName || '');
        setStep(2);
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to sign in");
    }
  };

  const handleSubmit = async () => {
    if (!auth.currentUser) return;

    try {
      const savedUser = await syncUser(role, {
        displayName,
        gender,
        requiresParentalVetting: role === 'DEPENDENT' ? true : requiresParentalVetting,
      });

      if (!savedUser) {
        toast.error("Failed to save profile. Please try again.");
        return;
      }

      toast.success("Profile created!");
      navigate(ROLE_HOME[savedUser.role]);
    } catch (error) {
      console.error(error);
      toast.error("Failed to save profile");
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4 bg-slate-50">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        {step === 1 ? (
          <Card className="border-none shadow-xl">
            <CardHeader className="text-center">
              <CardTitle className="text-3xl font-bold text-rose-600">Welcome to NikahPath</CardTitle>
              <CardDescription>Begin your journey towards a Halal union</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-slate-600 text-center">
                NikahPath is an intentional matchmaking platform built on Islamic principles of modesty, privacy, and family involvement.
              </p>
              <Button onClick={handleGoogleSignIn} className="w-full py-6 text-lg" variant="outline">
                Continue with Google
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-none shadow-xl">
            <CardHeader>
              <CardTitle>Complete Your Profile</CardTitle>
              <CardDescription>Tell us about your role in the matchmaking process</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Full Name</Label>
                <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Enter your name" />
              </div>

              <div className="space-y-2">
                <Label>Gender</Label>
                <Select value={gender} onValueChange={(v) => setGender(v as 'male' | 'female')}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Your Role</Label>
                <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SOLO">Independent Seeker</SelectItem>
                    <SelectItem value="DEPENDENT">Dependent Seeker (Wali Involved)</SelectItem>
                    <SelectItem value="PARENT">Parent / Guardian</SelectItem>
                    <SelectItem value="MAHRAM">Mahram (Chaperone)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {role === 'SOLO' && (
                <div className="flex items-center justify-between p-4 bg-rose-50 rounded-lg border border-rose-100">
                  <div className="space-y-0.5">
                    <Label className="text-rose-900">Parental Vetting</Label>
                    <p className="text-xs text-rose-700">Require parent approval before matches see your profile</p>
                  </div>
                  <Switch checked={requiresParentalVetting} onCheckedChange={setRequiresParentalVetting} />
                </div>
              )}
            </CardContent>
            <CardFooter>
              <Button onClick={handleSubmit} className="w-full bg-rose-600 hover:bg-rose-700 text-white py-6">
                Complete Setup
              </Button>
            </CardFooter>
          </Card>
        )}
      </motion.div>
    </div>
  );
};
