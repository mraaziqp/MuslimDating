import { Link } from "react-router-dom";
import { Compass, ShieldX } from "lucide-react";
import { buttonVariants } from "../components/ui/button";
import { useAuth } from "../context/AuthContext";
import { ROLE_HOME } from "../lib/constants";
import { cn } from "../lib/utils";

function StatusPage({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  const { user } = useAuth();
  const home = user?.onboardingCompleted ? ROLE_HOME[user.role] : "/";
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
      <div className="text-rose-500 [&_svg]:size-12">{icon}</div>
      <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
      <p className="text-slate-600">{body}</p>
      <Link to={home} className={cn(buttonVariants(), "bg-rose-600 text-white hover:bg-rose-700")}>
        Go to your dashboard
      </Link>
    </div>
  );
}

export function UnauthorizedPage() {
  return (
    <StatusPage
      icon={<ShieldX />}
      title="Access restricted"
      body="This area is only available to platform administrators. If you believe you should have access, contact the NikahPath team."
    />
  );
}

export function NotFoundPage() {
  return <StatusPage icon={<Compass />} title="Page not found" body="The page you're looking for doesn't exist or has moved." />;
}
