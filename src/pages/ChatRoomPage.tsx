import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Clock,
  Eye,
  EyeOff,
  Flag,
  Lock,
  LogOut,
  MessageSquare,
  Send,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { ConfirmDialog } from "../components/shared/ConfirmDialog";
import { ErrorState, PageLoader } from "../components/shared/PageState";
import { ProtectedPhoto } from "../components/shared/ProtectedPhoto";
import { ReportDialog } from "../components/shared/ReportDialog";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { useAsync, usePolling } from "../hooks/useAsync";
import { api, errorMessage } from "../lib/api";
import { STALE_CONNECTION_DAYS } from "../lib/constants";
import type { ChatDetail, MessageView } from "../lib/contracts";
import { closedReasonLabel, counterpart } from "../lib/format";
import { cn } from "../lib/utils";

function mergeMessages(existing: MessageView[], incoming: MessageView[]): MessageView[] {
  if (incoming.length === 0) return existing;
  const seen = new Set(existing.map((m) => m.id));
  return [...existing, ...incoming.filter((m) => !seen.has(m.id))];
}

const FAMILY_PROMPTS = [
  "Assalamu alaikum to the family.",
  "When would be a good time for our walis to speak?",
  "We are grateful for this introduction and seek Allah's blessing.",
];

const DIRECT_PROMPTS = [
  "Assalamu alaikum. How was your day?",
  "What does your ideal daily deen routine look like?",
  "What are your core expectations for a blessed marriage?",
];

export function ChatRoomPage() {
  const { connectionId = "" } = useParams<{ connectionId: string }>();
  const [channel, setChannel] = useState<"FAMILY" | "DIRECT">("FAMILY");
  const chat = useAsync(() => api.chat(connectionId, { channel }), [connectionId, channel]);
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
        const update = await api.chat(connectionId, { after: last, channel });
        chat.setData((prev): ChatDetail | null =>
          prev ? { ...update, messages: mergeMessages(prev.messages, update.messages) } : update,
        );
      } catch {
        // Transient polling failures are ignored; next tick retries.
      }
    },
    4_000,
    chat.data?.connection.status === "APPROVED",
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messageCount, channel]);

  if (chat.loading && !chat.data) return <PageLoader label="Opening courtship chat…" />;
  if (chat.error || !chat.data) {
    return <ErrorState error={chat.error ?? new Error("No data")} onRetry={() => void chat.reload()} />;
  }

  const { connection: view, messages, canSend, hasFamilyChat } = chat.data;
  const isMahram = view.perspective === "MAHRAM";
  const isParty = view.perspective === "SENDER" || view.perspective === "RECEIVER";
  const other = counterpart(view);
  const myConsent = view.perspective === "SENDER" ? view.senderPhotoConsent : view.receiverPhotoConsent;
  const theirConsent = view.perspective === "SENDER" ? view.receiverPhotoConsent : view.senderPhotoConsent;

  const daysLeft = Math.max(0, STALE_CONNECTION_DAYS - view.inactiveDays);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    setSending(true);
    try {
      const message = await api.sendMessage(view.id, trimmed, channel);
      chat.setData((prev) =>
        prev
          ? {
              ...prev,
              messages: mergeMessages(prev.messages, [message]),
              familyMessageCount:
                channel === "FAMILY" ? prev.familyMessageCount + 1 : prev.familyMessageCount,
              directMessageCount:
                channel === "DIRECT" ? prev.directMessageCount + 1 : prev.directMessageCount,
            }
          : prev,
      );
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
      {/* Header */}
      <header className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-xs">
        <Link to="/chats" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Back to chats">
          <ArrowLeft className="size-5" />
        </Link>
        {isMahram ? (
          <div className="flex size-11 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <ShieldCheck className="size-5" />
          </div>
        ) : (
          <ProtectedPhoto
            userId={other.id}
            name={other.displayName}
            access={other.photoAccess}
            className="size-11 rounded-full"
          />
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-bold text-slate-900">
            {isMahram ? `${view.sender.displayName} & ${view.receiver.displayName}` : other.displayName}
          </h1>
          <p className="truncate text-xs text-slate-500">
            {view.mahram ? `Chaperone: ${view.mahram.displayName}${isMahram ? " (you)" : ""}` : "Direct courtship"}
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
              {myConsent ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
              <span className="hidden sm:inline">{myConsent ? "Photos unblurred" : "Reveal photo"}</span>
            </Button>
          )}
          {view.status === "APPROVED" && (
            <Button variant="ghost" size="icon" onClick={() => setEnding(true)} aria-label="End chat">
              <LogOut className="size-5 text-slate-500" />
            </Button>
          )}
          {!isMahram && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setReporting(true)}
              aria-label={`Report ${other.displayName}`}
            >
              <Flag className="size-5 text-slate-500" />
            </Button>
          )}
        </div>
      </header>

      {/* 3-Day Rule & Expiration Banner */}
      {view.status === "APPROVED" && (
        <div className="flex items-center justify-between rounded-xl border border-amber-100 bg-amber-50/80 px-3.5 py-2 text-xs text-amber-900">
          <div className="flex items-center gap-2">
            <Clock className="size-4 text-amber-600 shrink-0" />
            <span>
              <strong>3-Day Response Rule:</strong> Suitors must reply within 3 days or the connection unmatches automatically.
            </span>
          </div>
          <Badge
            variant="outline"
            className={cn(
              "font-medium shrink-0",
              daysLeft <= 1 ? "border-rose-300 bg-rose-50 text-rose-700" : "border-amber-200 bg-white text-amber-800",
            )}
          >
            {daysLeft === 0 ? "Closes today if no replies" : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left to reply`}
          </Badge>
        </div>
      )}

      {/* Dual Channel Switcher: Family & Wali Lounge vs Direct Suitor Chat */}
      {hasFamilyChat && isParty && (
        <div className="grid grid-cols-2 gap-1 rounded-2xl bg-slate-100/90 p-1">
          <button
            type="button"
            onClick={() => setChannel("FAMILY")}
            className={cn(
              "flex items-center justify-center gap-2 rounded-xl py-2 text-xs font-bold transition-all",
              channel === "FAMILY"
                ? "bg-white text-emerald-800 shadow-xs"
                : "text-slate-600 hover:text-slate-900",
            )}
          >
            <Users className="size-4" />
            <span>Family &amp; Wali Lounge</span>
            {chat.data.familyMessageCount > 0 && (
              <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-800 font-bold">
                {chat.data.familyMessageCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setChannel("DIRECT")}
            className={cn(
              "flex items-center justify-center gap-2 rounded-xl py-2 text-xs font-bold transition-all",
              channel === "DIRECT"
                ? "bg-white text-rose-700 shadow-xs"
                : "text-slate-600 hover:text-slate-900",
            )}
          >
            <MessageSquare className="size-4" />
            <span>Personal Suitor Chat</span>
            {chat.data.directMessageCount > 0 && (
              <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] text-rose-700 font-bold">
                {chat.data.directMessageCount}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto rounded-3xl border border-slate-100 bg-slate-50/70 p-4">
        {/* Room Explanatory Notice */}
        <div className="mx-auto mb-4 max-w-lg rounded-2xl border bg-white p-3.5 text-center shadow-2xs">
          {channel === "FAMILY" ? (
            <div>
              <p className="flex items-center justify-center gap-1.5 text-xs font-bold text-emerald-800 uppercase tracking-wide">
                <Users className="size-3.5 text-emerald-600" />
                Family &amp; Wali Lounge
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
                Visible to both prospective spouses and the Wali / Mahram ({view.mahram?.displayName ?? "Chaperone"}).
                Ideal for family introductions, guardian questions, and marriage logistics.
              </p>
            </div>
          ) : (
            <div>
              <p className="flex items-center justify-center gap-1.5 text-xs font-bold text-rose-800 uppercase tracking-wide">
                <Lock className="size-3.5 text-rose-600" />
                Personal Suitor Chat
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
                Direct conversation between prospective spouses to discuss compatibility, daily deen, and vision.
                Keep conversations purposeful and mindful of Allah.
              </p>
            </div>
          )}
        </div>

        {messages.length === 0 ? (
          <div className="py-10 text-center space-y-4">
            <p className="text-sm font-medium text-slate-500">
              No messages in this room yet. Begin with warm salaams and sincere intention.
            </p>
            {canSend && (
              <div className="flex flex-wrap justify-center gap-2 max-w-md mx-auto">
                {(channel === "FAMILY" ? FAMILY_PROMPTS : DIRECT_PROMPTS).map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => setText(prompt)}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"
                  >
                    <Sparkles className="mr-1 inline size-3 text-rose-500" />
                    &ldquo;{prompt}&rdquo;
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <ul className="space-y-3">
            {messages.map((message) => {
              const mine = message.senderKind === "SELF";
              const mahram = message.senderKind === "MAHRAM";
              return (
                <li key={message.id} className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
                  {!mine && (
                    <span className="mb-0.5 px-1 text-[10px] font-semibold text-slate-500">
                      {message.senderName}
                      {mahram && (
                        <span className="ml-1 inline-flex items-center rounded-sm bg-emerald-100 px-1 py-0.2 text-[9px] font-bold text-emerald-800">
                          Wali / Mahram
                        </span>
                      )}
                    </span>
                  )}
                  <div
                    className={cn(
                      "max-w-[80%] rounded-2xl px-4 py-2 text-sm leading-relaxed break-words whitespace-pre-wrap shadow-xs",
                      mine && "rounded-tr-none bg-rose-600 text-white",
                      !mine && !mahram && "rounded-tl-none bg-white text-slate-900 border border-slate-100",
                      mahram && "rounded-tl-none border border-emerald-200 bg-emerald-50 text-emerald-950 font-medium",
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
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input or Closed Notice */}
      {view.status === "APPROVED" && canSend ? (
        <form onSubmit={send} className="flex gap-2 rounded-2xl border border-slate-200/80 bg-white p-2 shadow-xs">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={2000}
            placeholder={
              isMahram
                ? "Message as chaperone in Family Lounge…"
                : channel === "FAMILY"
                  ? "Message to suitors & wali…"
                  : "Type a purposeful message to your suitor…"
            }
            className="h-11 flex-1 border-none bg-slate-50 text-sm focus-visible:ring-0"
            aria-label="Message"
          />
          <Button
            type="submit"
            disabled={sending || !text.trim()}
            className="h-11 rounded-xl bg-rose-600 px-5 text-white hover:bg-rose-700"
          >
            <Send className="size-4" />
            <span className="sr-only">Send</span>
          </Button>
        </form>
      ) : (
        <p className="rounded-2xl border border-slate-200 bg-white p-3.5 text-center text-sm text-slate-500 font-medium">
          {closedReasonLabel(view.closedReason) ?? "This courtship has been concluded."}
        </p>
      )}

      {/* Terminate Dialog */}
      <ConfirmDialog
        open={ending}
        onOpenChange={setEnding}
        title="Conclude this courtship?"
        description="The conversation will close for everyone and frees up an active chat slot. This cannot be undone."
        confirmLabel="End courtship"
        destructive
        onConfirm={endChat}
      >
        <div className="space-y-1.5">
          <Label htmlFor="end-reason">Closing reason (optional, shared with participants)</Label>
          <Textarea
            id="end-reason"
            rows={2}
            maxLength={300}
            value={endReason}
            onChange={(e) => setEndReason(e.target.value)}
            placeholder="e.g. Incompatible timeline or priorities. May Allah grant you the best."
          />
        </div>
      </ConfirmDialog>

      {/* Report Dialog */}
      {!isMahram && (
        <ReportDialog
          userId={other.id}
          name={other.displayName}
          open={reporting}
          onOpenChange={setReporting}
        />
      )}
    </div>
  );
}

export default ChatRoomPage;
