import { Link } from "react-router-dom";
import { HeartHandshake, MessageSquare } from "lucide-react";
import type { ConnectionView } from "../../lib/contracts";
import { counterpart } from "../../lib/format";
import { cn } from "../../lib/utils";
import { Button, buttonVariants } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";

/** Shown to a member at the moment their own approval opens the chat. */
export function MatchDialog({ view, onClose }: { view: ConnectionView | null; onClose: () => void }) {
  return (
    <Dialog open={view !== null} onOpenChange={(open) => !open && onClose()}>
      {view && (
        <DialogContent className="rounded-3xl text-center sm:max-w-sm">
          <DialogHeader className="items-center">
            <span className="mb-1 flex size-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <HeartHandshake className="size-7" />
            </span>
            <DialogTitle className="text-xl font-bold">Alhamdulillah — your chat is open</DialogTitle>
            <DialogDescription>
              You and {counterpart(view).displayName} can now get to know each other
              {view.mahram ? `, with ${view.mahram.displayName} as chaperone` : ""}. Begin with salaam and a sincere
              intention.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Link to={`/chat/${view.id}`} className={cn(buttonVariants(), "h-10 bg-rose-600 text-white hover:bg-rose-700")}>
              <MessageSquare /> Say salaam
            </Link>
            <Button variant="ghost" onClick={onClose}>
              Later
            </Button>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
