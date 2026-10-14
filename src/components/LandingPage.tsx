import { Link } from "react-router-dom";
import { ArrowRight, BookOpen, Compass, Lock, MessageSquare, ShieldCheck, Users } from "lucide-react";
import { motion } from "motion/react";
import { useAuth } from "../context/AuthContext";
import { ROLE_HOME } from "../lib/constants";
import { cn } from "../lib/utils";
import { buttonVariants } from "./ui/button";

const FEATURES = [
  {
    icon: <Users className="size-8 text-rose-600" />,
    title: "Familial Involvement",
    description: "Parents and walis are part of the process from day one, ensuring transparency and blessing.",
  },
  {
    icon: <Lock className="size-8 text-rose-600" />,
    title: "Privacy First",
    description: "Photos stay private until you both consent inside an approved chat. You choose which details are visible.",
  },
  {
    icon: <BookOpen className="size-8 text-rose-600" />,
    title: "Educational Foundation",
    description: "Everyone completes a marriage readiness module before connecting, so each request comes from someone prepared.",
  },
];

const STEPS = [
  {
    icon: <BookOpen className="size-5" />,
    title: "Prepare",
    description: "Set up your profile and complete the short “Etiquette of Halal Courtship” module.",
  },
  {
    icon: <Compass className="size-5" />,
    title: "Discover",
    description: "Swipe through profiles chosen for you each day, or browse with filters. Save, pass, or send a request.",
  },
  {
    icon: <ShieldCheck className="size-5" />,
    title: "Family approval",
    description: "The other person accepts, and walis approve wherever they are involved. Nothing opens without consent.",
  },
  {
    icon: <MessageSquare className="size-5" />,
    title: "Chaperoned conversation",
    description: "A mahram joins the family lounge, and you get to know each other with purpose.",
  },
];

export function LandingPage() {
  const { user } = useAuth();
  const primary = user?.onboardingCompleted
    ? { to: ROLE_HOME[user.role], label: "Continue where you left off" }
    : { to: "/onboarding", label: "Start Your Journey" };

  return (
    <div className="bg-white">
      <section className="relative overflow-hidden py-12 sm:py-20">
        <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="space-y-6 text-center sm:space-y-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="inline-flex items-center rounded-full border border-rose-100 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-600"
            >
              <ShieldCheck className="mr-2 size-4" />
              Built for the Ummah
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl md:text-7xl"
            >
              Intentional Matchmaking <br className="hidden sm:block" />
              <span className="text-rose-600">Rooted in Faith</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="mx-auto max-w-2xl px-2 text-base text-slate-600 sm:text-xl"
            >
              A platform that honours Islamic principles of modesty, privacy, and family involvement. Discovering someone
              is quick and enjoyable; every step after it is deliberate, approved, and chaperoned.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="flex flex-col items-stretch justify-center gap-3 px-4 sm:flex-row sm:items-center sm:gap-4 sm:px-0"
            >
              <Link
                to={primary.to}
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "h-auto rounded-full bg-rose-600 px-8 py-4 text-base text-white hover:bg-rose-700 sm:text-lg",
                )}
              >
                {primary.label}
                <ArrowRight className="ml-1 size-5" />
              </Link>
              <a
                href="#how-it-works"
                className={cn(
                  buttonVariants({ size: "lg", variant: "outline" }),
                  "h-auto rounded-full border-slate-200 px-8 py-4 text-base sm:text-lg",
                )}
              >
                How it works
              </a>
            </motion.div>
          </div>
        </div>

        <div className="absolute inset-0 opacity-10" aria-hidden>
          <div className="absolute top-20 left-10 size-64 rounded-full bg-rose-400 blur-3xl" />
          <div className="absolute right-10 bottom-20 size-96 rounded-full bg-amber-400 blur-3xl" />
        </div>
      </section>

      <section id="how-it-works" className="scroll-mt-20 py-12 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="mb-10 text-center text-2xl font-bold text-slate-900 sm:text-3xl">From first look to first conversation</h2>
          <ol className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, index) => (
              <li key={step.title} className="relative rounded-2xl border border-slate-100 bg-slate-50/70 p-6">
                <div className="mb-4 flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-full bg-rose-600 text-white">{step.icon}</span>
                  <span className="text-xs font-bold tracking-wider text-slate-400 uppercase">Step {index + 1}</span>
                </div>
                <h3 className="mb-1 text-lg font-bold text-slate-900">{step.title}</h3>
                <p className="text-sm text-slate-600">{step.description}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="bg-slate-50 py-12 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="mb-10 text-center text-2xl font-bold text-slate-900 sm:mb-16 sm:text-3xl">Why NikahPath is Different</h2>
          <div className="grid grid-cols-1 gap-6 sm:gap-8 md:grid-cols-3 md:gap-12">
            {FEATURES.map((feature) => (
              <motion.div
                key={feature.title}
                whileHover={{ y: -5 }}
                className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm sm:p-8"
              >
                <div className="mb-4">{feature.icon}</div>
                <h3 className="mb-2 text-lg font-bold text-slate-900 sm:text-xl">{feature.title}</h3>
                <p className="text-sm text-slate-600 sm:text-base">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
