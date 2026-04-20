import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithPopup, GoogleAuthProvider, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
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
import { Eye, EyeOff } from 'lucide-react';

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
  const [age, setAge] = useState('');
  const [location, setLocation] = useState('');
  const [requiresParentalVetting, setRequiresParentalVetting] = useState(false);

  // Auth form state
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);

  const navigate = useNavigate();
  const { syncUser } = useAuth();

  const handleGoogleSignIn = async () => {
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const fbUser = result.user;

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
      toast.error("Failed to sign in with Google");
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setAuthLoading(true);

    try {
      if (authMode === 'signin') {
        const result = await signInWithEmailAndPassword(auth, email.trim(), password);
        const fbUser = result.user;
        const res = await fetch(`/api/users/me?firebaseUid=${encodeURIComponent(fbUser.uid)}`);
        if (res.ok) {
          const dbUser = await res.json();
          navigate(ROLE_HOME[dbUser.role as UserRole]);
        } else {
          setDisplayName(fbUser.displayName || '');
          setStep(2);
        }
      } else {
        if (password.length < 6) {
          toast.error("Password must be at least 6 characters");
          return;
        }
        const result = await createUserWithEmailAndPassword(auth, email.trim(), password);
        // Strip the local part of the email as a default display name
        const defaultName = email.split('@')[0];
        await updateProfile(result.user, { displayName: defaultName });
        setDisplayName(defaultName);
        setStep(2);
      }
    } catch (err: any) {
      const code = err?.code as string;
      if (code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        toast.error("Invalid email or password");
      } else if (code === 'auth/email-already-in-use') {
        toast.error("An account with that email already exists — sign in instead");
        setAuthMode('signin');
      } else if (code === 'auth/invalid-email') {
        toast.error("Please enter a valid email address");
      } else {
        toast.error("Authentication failed. Please try again.");
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!auth.currentUser) return;

    try {
      const savedUser = await syncUser(role, {
        displayName,
        gender,
        age: age ? parseInt(age, 10) : undefined,
        location: location || undefined,
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
            <CardHeader className="text-center pb-2">
              <CardTitle className="text-2xl sm:text-3xl font-bold text-rose-600">Welcome to NikahPath</CardTitle>
              <CardDescription>Begin your journey towards a Halal union</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5 pt-4">
              {/* Tab toggle */}
              <div className="flex rounded-xl border border-slate-200 p-1 bg-slate-50">
                <button
                  type="button"
                  onClick={() => setAuthMode('signin')}
                  className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${authMode === 'signin' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => setAuthMode('signup')}
                  className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${authMode === 'signup' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Create Account
                </button>
              </div>

              {/* Email / password form */}
              <form onSubmit={handleEmailAuth} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'}
                      placeholder={authMode === 'signup' ? 'Min. 6 characters' : 'Your password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <Button
                  type="submit"
                  disabled={authLoading}
                  className="w-full bg-rose-600 hover:bg-rose-700 text-white py-5 font-semibold"
                >
                  {authLoading ? 'Please wait...' : authMode === 'signin' ? 'Sign In' : 'Create Account'}
                </Button>
              </form>

              {/* Divider */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-white px-3 text-slate-400 font-medium">or continue with</span>
                </div>
              </div>

              {/* Google */}
              <Button onClick={handleGoogleSignIn} className="w-full" variant="outline">
                <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Google
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

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Age</Label>
                  <Input type="number" value={age} onChange={(e) => setAge(e.target.value)} placeholder="e.g. 27" min={18} max={99} />
                </div>
                <div className="space-y-2">
                  <Label>Location</Label>
                  <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="City, Country" />
                </div>
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
