import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Eye, EyeOff, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { PageLoader } from "../components/shared/PageState";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { NativeSelect } from "../components/ui/native-select";
import { Switch } from "../components/ui/switch";
import { useAuth } from "../context/AuthContext";
import { ApiError, api, errorMessage } from "../lib/api";
import { ROLE_HOME } from "../lib/constants";
import type { Gender, OnboardingInput, SelfUser } from "../lib/contracts";
import { cn } from "../lib/utils";

type SelectableRole = OnboardingInput["role"];

const ROLE_OPTIONS: { value: SelectableRole; title: string; description: string }[] = [
  { value: "SOLO", title: "Independent Seeker", description: "I'm looking for a spouse and manage my own requests." },
  {
    value: "DEPENDENT",
    title: "Seeker with Wali",
    description: "I'm looking for a spouse and my wali approves every connection.",
  },
  { value: "PARENT", title: "Parent / Wali", description: "I guide and approve requests for a family member." },
  { value: "MAHRAM", title: "Mahram (Chaperone)", description: "I chaperone conversations for a family member." },
];

function redirectTarget(state: unknown): string | null {
  if (typeof state === "object" && state !== null && "from" in state && typeof state.from === "string") {
    return state.from.startsWith("/") && !state.from.startsWith("//") ? state.from : null;
  }
  return null;
}

function homeFor(user: SelfUser): string {
  if ((user.role === "SOLO" || user.role === "DEPENDENT") && !user.readinessCompleted) return "/readiness";
  return ROLE_HOME[user.role];
}

export function OnboardingPage() {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === "loading") return <PageLoader />;
  if (user?.onboardingCompleted) return <Navigate to={redirectTarget(location.state) ?? homeFor(user)} replace />;

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-start justify-center px-4 py-10 sm:items-center">
      <div className="w-full max-w-lg">{user ? <ProfileSetup user={user} /> : <AuthCard />}</div>
    </div>
  );
}

function AuthCard() {
  const { loginWithPassword, registerWithPassword, signInWithGoogle } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      if (mode === "signin") await loginWithPassword(email.trim(), password);
      else await registerWithPassword(email.trim(), password);
    } catch (err) {
      if (err instanceof ApiError && err.code === "EMAIL_TAKEN") setMode("signin");
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setBusy(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      const code = typeof err === "object" && err !== null && "code" in err ? String(err.code) : "";
      if (code !== "auth/popup-closed-by-user" && code !== "auth/cancelled-popup-request") {
        toast.error(errorMessage(err, "Google sign-in failed."));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="border-none shadow-xl">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-bold text-rose-600 sm:text-3xl">Welcome to NikahPath</CardTitle>
        <CardDescription>Begin your journey towards a halal union</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1" role="tablist">
          {(["signin", "signup"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={cn(
                "flex-1 rounded-lg py-2 text-sm font-semibold transition-all",
                mode === m ? "bg-white text-slate-900 shadow" : "text-slate-500 hover:text-slate-700",
              )}
            >
              {m === "signin" ? "Sign in" : "Create account"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="email">{mode === "signin" ? "Email or username" : "Email"}</Label>
            <Input
              id="email"
              type={mode === "signin" ? "text" : "email"}
              autoComplete={mode === "signin" ? "username" : "email"}
              autoCapitalize="none"
              spellCheck={false}
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={mode === "signin" ? "you@example.com or username" : "you@example.com"}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                required
                minLength={mode === "signup" ? 8 : 1}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === "signup" ? "At least 8 characters" : "Your password"}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute top-1/2 right-3 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>
          <Button type="submit" disabled={busy} className="h-10 w-full bg-rose-600 font-semibold text-white hover:bg-rose-700">
            {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </Button>
        </form>

        <div className="relative text-center text-xs text-slate-400">
          <span className="relative z-10 bg-white px-3">or continue with</span>
          <div className="absolute inset-x-0 top-1/2 border-t border-slate-200" />
        </div>

        <Button onClick={google} disabled={busy} variant="outline" className="h-10 w-full">
          <svg className="mr-2 size-4" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          Google
        </Button>
      </CardContent>
    </Card>
  );
}

function ProfileSetup({ user }: { user: SelfUser }) {
  const { setUser, logout } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState(user.displayName ?? "");
  const [gender, setGender] = useState<Gender>("male");
  const [age, setAge] = useState("");
  const [location, setLocation] = useState("");
  const [role, setRole] = useState<SelectableRole>("SOLO");
  const [vetting, setVetting] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const parsedAge = Number.parseInt(age, 10);
    if (!Number.isInteger(parsedAge) || parsedAge < 18 || parsedAge > 99) {
      toast.error("Please enter an age between 18 and 99.");
      return;
    }
    setBusy(true);
    try {
      const saved = await api.completeOnboarding({
        displayName: displayName.trim(),
        gender,
        age: parsedAge,
        location: location.trim() || null,
        role,
        requiresParentalVetting: role === "DEPENDENT" ? true : vetting,
      });
      setUser(saved);
      toast.success("Your profile is set up. Bismillah!");
      navigate(homeFor(saved), { replace: true });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="border-none shadow-xl">
      <form onSubmit={submit}>
        <CardHeader>
          <CardTitle className="text-xl">Complete your profile</CardTitle>
          <CardDescription>Signed in as {user.email}. Tell us how you'll use NikahPath.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="displayName">Full name</Label>
            <Input
              id="displayName"
              required
              minLength={2}
              maxLength={80}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="age">Age</Label>
              <Input id="age" type="number" required min={18} max={99} value={age} onChange={(e) => setAge(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gender">Gender</Label>
              <NativeSelect id="gender" value={gender} onChange={(e) => setGender(e.target.value === "female" ? "female" : "male")}>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </NativeSelect>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="location">Location (optional)</Label>
            <Input id="location" maxLength={120} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="City, Country" />
          </div>

          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium">Your role</legend>
            {ROLE_OPTIONS.map((option) => (
              <label
                key={option.value}
                className={cn(
                  "flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors",
                  role === option.value ? "border-rose-300 bg-rose-50" : "border-slate-200 hover:bg-slate-50",
                )}
              >
                <input
                  type="radio"
                  name="role"
                  value={option.value}
                  checked={role === option.value}
                  onChange={() => setRole(option.value)}
                  className="mt-1 accent-rose-600"
                />
                <span>
                  <span className="block text-sm font-semibold text-slate-900">{option.title}</span>
                  <span className="block text-xs text-slate-500">{option.description}</span>
                </span>
              </label>
            ))}
          </fieldset>

          {role === "SOLO" && (
            <div className="flex items-center justify-between gap-4 rounded-xl border border-rose-100 bg-rose-50 p-3">
              <div>
                <Label className="text-rose-900">Wali vetting</Label>
                <p className="text-xs text-rose-700">My wali approves my outgoing requests before they are sent.</p>
              </div>
              <Switch checked={vetting} onCheckedChange={(checked) => setVetting(checked)} />
            </div>
          )}
          {role === "DEPENDENT" && (
            <p className="flex items-start gap-2 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" />
              After setup, invite your wali from the Family page so they can approve your connections.
            </p>
          )}
        </CardContent>
        <CardFooter className="flex flex-col gap-2">
          <Button type="submit" disabled={busy} className="h-10 w-full bg-rose-600 text-white hover:bg-rose-700">
            {busy ? "Saving…" : "Complete setup"}
          </Button>
          <Button type="button" variant="ghost" className="w-full text-slate-500" onClick={() => void logout()}>
            Use a different account
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
