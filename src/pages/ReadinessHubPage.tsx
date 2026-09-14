import { Link } from "react-router-dom";
import { BookOpen, CheckCircle2, Clock, Lock } from "lucide-react";
import { PageHeader } from "../components/shared/PageState";
import { Badge } from "../components/ui/badge";
import { buttonVariants } from "../components/ui/button";
import { useCurrentUser } from "../context/AuthContext";
import { READINESS_MODULES } from "../lib/readiness";
import { cn } from "../lib/utils";

export function ReadinessHubPage() {
  const user = useCurrentUser();
  const completed = new Set(user.completedModules);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <PageHeader
        title="Marriage Readiness Hub"
        description="Short lessons with a quiz. The first module is required before you can send or accept connection requests."
      />
      <div className="space-y-4">
        {READINESS_MODULES.map((module) => {
          const done = completed.has(module.id);
          const locked = !module.required && !user.readinessCompleted;
          return (
            <article
              key={module.id}
              className={cn(
                "flex flex-col gap-4 rounded-2xl border bg-white p-5 shadow-sm sm:flex-row sm:items-center",
                module.required && !done ? "border-rose-200 ring-2 ring-rose-500/10" : "border-slate-100",
              )}
            >
              <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-slate-100">
                <BookOpen className="size-5 text-slate-600" />
              </div>
              <div className="flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold text-slate-900">{module.title}</h2>
                  {module.required && (
                    <Badge variant="secondary" className="bg-rose-100 text-rose-700">
                      Required
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-slate-600">{module.description}</p>
                <p className="flex items-center gap-1 text-xs text-slate-400">
                  <Clock className="size-3" /> {module.durationMinutes} min · {module.quiz.length}-question quiz
                </p>
              </div>
              {done ? (
                <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-600">
                  <CheckCircle2 className="size-5" /> Completed
                </span>
              ) : locked ? (
                <span className="flex items-center gap-1.5 text-xs text-slate-400">
                  <Lock className="size-3.5" /> Complete the required module first
                </span>
              ) : (
                <Link
                  to={`/readiness/${module.id}`}
                  className={cn(buttonVariants(), module.required ? "bg-rose-600 text-white hover:bg-rose-700" : "bg-slate-800 text-white hover:bg-slate-900")}
                >
                  Start module
                </Link>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
