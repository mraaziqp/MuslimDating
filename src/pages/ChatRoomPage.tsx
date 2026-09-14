import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Eye, EyeOff, Flag, LogOut, Send, ShieldCheck } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { ConfirmDialog } from "../components/shared/ConfirmDialog";
import { ErrorState, PageLoader } from "../components/shared/PageState";
import { ProtectedPhoto } from "../components/shared/ProtectedPhoto";
import { ReportDialog } from "../components/shared/ReportDialog";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { useAsync, usePolling } from "../hooks/useAsync";
import { api, errorMessage } from "../lib/api";
import type { ChatDetail, MessageView } from "../lib/contracts";
import { closedReasonLabel, counterpart } from "../lib/format";
import { cn } from "../lib/utils";

function mergeMessages(existing: MessageView[], incoming: MessageView[]): MessageView[] {
  if (incoming.length === 0) return existing;
  const seen = new Set(existing.map((m) => m.id));
  return [...existing, ...incoming.filter((m) => !seen.has(m.id))];
}

export function ChatRoomPage() {
  const { connectionId = "" } = useParams<{ connectionId: string }>();
  const chat = useAsync(() => api.chat(connectionId), [connectionId]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [ending, setEnding] = useState(false);
  const [endReason, setEndReason] = useState("");
  const [reporting, setReporting] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messageCount = chat.data?.messages.length ?? 0;

  usePolling(
    async () => {
      const current = chat.data;
      if (!current) return;
      const last = current.messages.at(-1)?.createdAt;
      try {
        const update = await api.chat(connectionId, last);
        chat.setData((prev): ChatDetail | null =>
          prev ? { ...update, messages: mergeMessages(prev.messages, update.messages) } : update,
        );
      } catch {
        // Transient polling failures are ignored; the next tick retries.
      }
    },
    4_000,
    chat.data?.connection.status === "APPROVED",
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messageCount]);

  if (chat.loading && !chat.data) return <PageLoader label="Opening chaperoned chat…" />;
  if (chat.error || !chat.data) return <ErrorState error={chat.error ?? new Error("No data")} onRetry={() => void chat.reload()} />;

  const { connection: view, messages, canSend } = chat.data;
  const isMahram = view.perspective === "MAHRAM";
  const isParty = view.perspective === "SENDER" || view.perspective === "RECEIVER";
  const other = counterpart(view);
  const myConsent = view.perspective === "SENDER" ? view.senderPhotoConsent : view.receiverPhotoConsent;
  const theirConsent = view.perspective === "SENDER" ? view.receiverPhotoConsent : view.senderPhotoConsent;

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    setSending(true);
    try {
      const message = await api.sendMessage(view.id, trimmed);
      chat.setData((prev) => (prev ? { ...prev, messages: mergeMessages(prev.messages, [message]) } : prev));
      setText("");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const toggleConsent = async () => {
    try {
      const updated = await api.photoConsent(view.id, !myConsent);
      chat.setData((prev) => (prev ? { ...prev, connection: updated } : prev));
      toast.info(!myConsent ? "You consented to reveal photos." : "Photo consent withdrawn.");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const endChat = async () => {
    try {
      const updated = await api.terminate(view.id, endReason.trim() || undefined);
      chat.setData((prev) => (prev ? { ...prev, connection: updated, canSend: false } : prev));
      toast.success("The chat has been closed.");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="mx-auto flex h-[calc(100dvh-4rem)] max-w-4xl flex-col gap-3 p-2 sm:p-4">
      <header className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
        <Link to="/chats" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Back to chats">
          <ArrowLeft className="size-5" />
        </Link>
        {isMahram ? (
          <div className="flex size-11 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <ShieldCheck className="size-5" />
          </div>
        ) : (
          <ProtectedPhoto userId={other.id} name={other.displayName} access={other.photoAccess} className="size-11 rounded-full" />
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-bold text-slate-900">
            {isMahram ? `${view.sender.displayName} & ${view.receiver.displayName}` : other.displayName}
          </h1>
          <p className="truncate text-xs text-emerald-700">
            {view.mahram ? `Chaperone: ${view.mahram.displayName}${isMahram ? " (you)" : ""}` : "Chaperoned chat"}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {isParty && view.status === "APPROVED" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void toggleConsent()}
              className={cn(myConsent && "border-emerald-200 bg-emerald-50 text-emerald-700")}
              title={theirConsent ? "They have consented" : "Photos unblur only when both of you consent"}
            >
              {myConsent ? <Eye /> : <EyeOff />}
              <span className="hidden sm:inline">{myConsent ? "Consent given" : "Reveal photos"}</span>
            </Button>
          )}
          {view.status === "APPROVED" && (
            <Button variant="ghost" size="icon-sm" onClick={() => setEnding(true)} aria-label="End chat">
              <LogOut className="text-slate-500" />
            </Button>
          )}
          {!isMahram && (
            <Button variant="ghost" size="icon-sm" onClick={() => setReporting(true)} aria-label={`Report ${other.displayName}`}>
              <Flag className="text-slate-500" />
            </Button>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
        <div className="mx-auto mb-4 max-w-md rounded-2xl border border-emerald-100 bg-white p-3 text-center">
          <p className="flex items-center justify-center gap-1.5 text-xs font-bold text-emerald-700">
            <ShieldCheck className="size-4" /> MODESTY & SAFETY PROTOCOL
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
            {view.mahram?.displayName ?? "A mahram"} can read and join this conversation. Keep it purposeful and respectful.
            {isParty &&
              (myConsent && theirConsent
                ? " Photos are mutually revealed."
                : theirConsent
                  ? " They have consented to reveal photos — it's your choice."
                  : " Photos stay blurred until you both consent.")}
          </p>
        </div>

        {messages.length === 0 && <p className="py-8 text-center text-sm text-slate-400">Begin with salaam.</p>}

        <ul className="space-y-3">
          {messages.map((message) => {
            const mine = message.senderKind === "SELF";
            const mahram = message.senderKind === "MAHRAM";
            return (
              <li key={message.id} className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
                {!mine && <span className="mb-0.5 px-1 text-[10px] font-semibold text-slate-500">{message.senderName}{mahram && " · Mahram"}</span>}
                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl px-4 py-2 text-sm leading-relaxed break-words whitespace-pre-wrap shadow-sm",
                    mine && "rounded-tr-none bg-rose-600 text-white",
                    !mine && !mahram && "rounded-tl-none bg-white text-slate-900",
                    mahram && "rounded-tl-none border border-emerald-200 bg-emerald-50 text-emerald-900",
                  )}
                >
                  {message.text}
                </div>
                <time className="mt-0.5 px-1 text-[10px] text-slate-400" dateTime={message.createdAt}>
                  {format(new Date(message.createdAt), "d MMM, HH:mm")}
                </time>
              </li>
            );
          })}
        </ul>
        <div ref={bottomRef} />
      </div>

      {view.status === "APPROVED" && canSend ? (
        <form onSubmit={send} className="flex gap-2 rounded-2xl border border-slate-100 bg-white p-2">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={2000}
            placeholder={isMahram ? "Message as chaperone…" : "Type a respectful message…"}
            className="h-10 flex-1 border-none bg-slate-50"
            aria-label="Message"
          />
          <Button type="submit" disabled={sending || !text.trim()} className="h-10 bg-rose-600 px-4 text-white hover:bg-rose-700">
            <Send /> <span className="sr-only">Send</span>
          </Button>
        </form>
      ) : (
        <p className="rounded-2xl border border-slate-200 bg-white p-3 text-center text-sm text-slate-500">
          {closedReasonLabel(view.closedReason) ?? "This chat is closed."}
        </p>
      )}

      <ConfirmDialog
        open={ending}
        onOpenChange={setEnding}
        title="End this chat?"
        description="The conversation will close for everyone and frees an active chat slot. This cannot be undone."
        confirmLabel="End chat"
        destructive
        onConfirm={endChat}
      >
        <div className="space-y-1.5">
          <Label htmlFor="end-reason">Note (optional, shared with participants)</Label>
          <Textarea id="end-reason" rows={2} maxLength={300} value={endReason} onChange={(e) => setEndReason(e.target.value)} />
        </div>
      </ConfirmDialog>
      {!isMahram && <ReportDialog userId={other.id} name={other.displayName} open={reporting} onOpenChange={setReporting} />}
    </div>
  );
}
