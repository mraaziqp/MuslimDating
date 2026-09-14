import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { useAuth, useCurrentUser } from "../context/AuthContext";
import { api, errorMessage } from "../lib/api";
import { findModule } from "../lib/readiness";
import { cn } from "../lib/utils";

export function ReadinessModulePage() {
  const { moduleId = "" } = useParams<{ moduleId: string }>();
  const module = findModule(moduleId);
  const user = useCurrentUser();
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const [answers, setAnswers] = useState<(number | null)[]>(() => module?.quiz.map(() => null) ?? []);
  const [result, setResult] = useState<{ correct: number; total: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!module) return <Navigate to="/readiness" replace />;
  if (!module.required && !user.readinessCompleted) return <Navigate to="/readiness" replace />;

  const alreadyDone = user.completedModules.includes(module.id);
  const allAnswered = answers.every((a) => a !== null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const chosen = answers.filter((a): a is number => a !== null);
    if (chosen.length !== module.quiz.length) return;
    setSubmitting(true);
    try {
      const outcome = await api.submitReadiness(module.id, chosen);
      setUser(outcome.user);
      if (outcome.passed) {
        toast.success(
          module.required ? "Module complete — connection requests are now unlocked." : "Module complete. Barakallahu feek!",
        );
        navigate(module.required && (user.role === "SOLO" || user.role === "DEPENDENT") ? "/feed" : "/readiness");
      } else {
        setResult({ correct: outcome.correct, total: outcome.total });
      }
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-4">
      <Link to="/readiness" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-rose-600">
        <ArrowLeft className="size-4" /> Readiness Hub
      </Link>

      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">{module.title}</h1>
        <p className="text-slate-600">{module.description}</p>
        {alreadyDone && (
          <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-600">
            <CheckCircle2 className="size-4" /> You have completed this module.
          </p>
        )}
      </header>

      <div className="space-y-6 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm sm:p-8">
        {module.sections.map((section) => (
          <section key={section.heading} className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-900">{section.heading}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph.slice(0, 32)} className="leading-relaxed text-slate-700">
                {paragraph}
              </p>
            ))}
          </section>
        ))}
        <p className="border-t border-slate-100 pt-4 text-xs text-slate-400">
          This is general guidance. For personal rulings, please consult a qualified scholar.
        </p>
      </div>

      <form onSubmit={submit} className="space-y-5">
        <h2 className="text-xl font-bold text-slate-900">Check your understanding</h2>
        {module.quiz.map((question, qi) => (
          <fieldset key={question.question} className="space-y-2 rounded-2xl border border-slate-100 bg-white p-4">
            <legend className="px-1 font-medium text-slate-800">
              {qi + 1}. {question.question}
            </legend>
            {question.options.map((option, oi) => (
              <label
                key={option}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm",
                  answers[qi] === oi ? "border-rose-300 bg-rose-50" : "border-slate-100 hover:bg-slate-50",
                )}
              >
                <input
                  type="radio"
                  name={`q-${qi}`}
                  checked={answers[qi] === oi}
                  onChange={() => {
                    setResult(null);
                    setAnswers((prev) => prev.map((a, i) => (i === qi ? oi : a)));
                  }}
                  className="mt-0.5 accent-rose-600"
                />
                {option}
              </label>
            ))}
          </fieldset>
        ))}

        {result && (
          <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
            You answered {result.correct} of {result.total} correctly. Review the lesson above and try again — all answers must be correct.
          </p>
        )}

        <Button type="submit" disabled={!allAnswered || submitting} className="h-11 w-full bg-rose-600 text-base text-white hover:bg-rose-700">
          {submitting ? "Checking…" : "Submit answers"}
        </Button>
      </form>
    </div>
  );
}
