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
  MoreVertical,
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
import { announceActivityChanged } from "../lib/activity";
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
  const [menuOpen, setMenuOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messageCount = chat.data?.messages.length ?? 0;

  usePolling(
    async () => {
      const current = chat.data;
      // While a channel switch is loading, the held messages belong to the other room.
      if (!current || current.activeChannel !== channel) return;
      const last = current.messages.at(-1)?.createdAt;
      try {
        const update = await api.chat(connectionId, { after: last, channel });
        // The reply may land after the user has switched rooms; never mix two rooms' messages.
        chat.setData((prev): ChatDetail | null =>
          prev && prev.connection.id === update.connection.id && prev.activeChannel === update.activeChannel
            ? { ...update, messages: mergeMessages(prev.messages, update.messages) }
            : prev,
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

  // Opening a room reads it, so the unread badge in the navigation is now out of date.
  const unreadElsewhere = chat.data ? chat.data.unread.FAMILY + chat.data.unread.DIRECT : null;
  useEffect(() => {
    if (unreadElsewhere !== null) announceActivityChanged();
  }, [unreadElsewhere, channel, connectionId]);

  // When the on-screen keyboard opens the room gets shorter; keep the newest message in view.
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const keepLatestVisible = () => bottomRef.current?.scrollIntoView({ block: "end" });
    viewport.addEventListener("resize", keepLatestVisible);
    return () => viewport.removeEventListener("resize", keepLatestVisible);
  }, []);

  if (chat.loading && !chat.data) return <PageLoader label="Opening courtship chat…" />;
  if (chat.error || !chat.data) {
    return <ErrorState error={chat.error ?? new Error("No data")} onRetry={() => void chat.reload()} />;
  }

  const { connection: view, messages, canSend, hasFamilyChat } = chat.data;
  const switching = chat.data.activeChannel !== channel;
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
    // Below the lg breakpoint the app bar is hidden on this screen, so the room takes the whole viewport.
    <div className="mx-auto flex h-dvh max-w-4xl flex-col gap-2 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,var(--safe-bottom))] sm:gap-3 sm:p-4 lg:h-[calc(100dvh-var(--nav-h))]">
      {/* Header */}
      <header className="relative flex shrink-0 items-center gap-2 rounded-2xl border border-slate-100 bg-white p-2 shadow-xs sm:gap-3 sm:p-3">
        <Link
          to="/chats"
          className="flex size-10 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
          aria-label="Back to chats"
        >
          <ArrowLeft className="size-5" />
        </Link>
        {isMahram ? (
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 sm:size-11">
            <ShieldCheck className="size-5" />
          </div>
        ) : (
          <ProtectedPhoto
            userId={other.id}
            name={other.displayName}
            access={other.photoAccess}
            className="size-10 shrink-0 rounded-full sm:size-11"
            showLock={false}
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
        <div className="flex shrink-0 items-center gap-1">
          {isParty && view.status === "APPROVED" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void toggleConsent()}
              className={cn("rounded-full", myConsent && "border-emerald-200 bg-emerald-50 text-emerald-700")}
              aria-label={myConsent ? "Withdraw photo consent" : "Consent to reveal photos"}
              title={theirConsent ? "They have consented" : "Photos unblur only when both of you consent"}
            >
              {myConsent ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
              <span className="hidden sm:inline">{myConsent ? "Photos unblurred" : "Reveal photo"}</span>
            </Button>
          )}
          {(view.status === "APPROVED" || !isMahram) && (
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full"
              onClick={() => setMenuOpen((open) => !open)}
              aria-label="More actions"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <MoreVertical className="size-5 text-slate-500" />
            </Button>
          )}
        </div>
        {menuOpen && (
          <>
            <button type="button" aria-label="Close menu" className="fixed inset-0 z-20 cursor-default" onClick={() => setMenuOpen(false)} />
            <div
              role="menu"
              className="absolute top-full right-2 z-30 mt-1 w-56 overflow-hidden rounded-2xl border border-slate-100 bg-white p-1 shadow-xl animate-in fade-in-0 zoom-in-95"
            >
              {view.status === "APPROVED" && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setEnding(true);
                  }}
                  className="flex h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  <LogOut className="size-4 text-slate-500" /> Conclude courtship
                </button>
              )}
              {!isMahram && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setReporting(true);
                  }}
                  className="flex h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium text-rose-700 hover:bg-rose-50"
                >
                  <Flag className="size-4" /> Report {other.displayName}
                </button>
              )}
            </div>
          </>
        )}
      </header>

      {/* 3-Day Rule & Expiration Banner */}
      {view.status === "APPROVED" && (
        <div className="flex shrink-0 items-center justify-between gap-2 rounded-xl border border-amber-100 bg-amber-50/80 px-3 py-1.5 text-xs text-amber-900 sm:px-3.5 sm:py-2">
          <div className="flex min-w-0 items-center gap-2">
            <Clock className="size-4 shrink-0 text-amber-600" />
            {/* Phones get the short form; the badge beside it carries the number that matters. */}
            <span className="truncate sm:hidden">{STALE_CONNECTION_DAYS}-day reply rule</span>
            <span className="hidden sm:inline">
              <strong>{STALE_CONNECTION_DAYS}-day response rule:</strong> if neither of you writes for{" "}
              {STALE_CONNECTION_DAYS} days, the connection closes automatically.
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
        <div role="tablist" aria-label="Chat rooms" className="grid shrink-0 grid-cols-2 gap-1 rounded-2xl bg-slate-200/70 p-1">
          <button
            type="button"
            role="tab"
            aria-selected={channel === "FAMILY"}
            onClick={() => setChannel("FAMILY")}
            className={cn(
              "flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-bold transition-all sm:gap-2 sm:text-sm",
              channel === "FAMILY"
                ? "bg-white text-emerald-800 shadow-xs"
                : "text-slate-600 hover:text-slate-900",
            )}
          >
            <Users className="size-4 shrink-0" />
            <span className="truncate sm:hidden">Family lounge</span>
            <span className="hidden sm:inline">Family &amp; Wali Lounge</span>
            {chat.data.unread.FAMILY > 0 && (
              <span className="rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] leading-none font-bold text-white">
                {chat.data.unread.FAMILY}
                <span className="sr-only"> unread</span>
              </span>
            )}
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={channel === "DIRECT"}
            onClick={() => setChannel("DIRECT")}
            className={cn(
              "flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-bold transition-all sm:gap-2 sm:text-sm",
              channel === "DIRECT"
                ? "bg-white text-rose-700 shadow-xs"
                : "text-slate-600 hover:text-slate-900",
            )}
          >
            <MessageSquare className="size-4 shrink-0" />
            <span className="truncate sm:hidden">Direct chat</span>
            <span className="hidden sm:inline">Personal Suitor Chat</span>
            {chat.data.unread.DIRECT > 0 && (
              <span className="rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] leading-none font-bold text-white">
                {chat.data.unread.DIRECT}
                <span className="sr-only"> unread</span>
              </span>
            )}
          </button>
        </div>
      )}

      {/* Messages Scroll Area */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-3xl border border-slate-100 bg-slate-50/70 p-3 sm:p-4">
        {/* Room Explanatory Notice */}
        <div className="mx-auto mb-3 max-w-lg rounded-2xl border bg-white px-3.5 py-2.5 text-center shadow-2xs sm:mb-4 sm:p-3.5">
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

        {switching ? (
          <p role="status" className="py-10 text-center text-sm text-slate-400">
            Opening room…
          </p>
        ) : messages.length === 0 ? (
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
                      "max-w-[85%] rounded-2xl px-3.5 py-2 text-[15px] leading-relaxed break-words whitespace-pre-wrap shadow-xs sm:max-w-[75%] sm:px-4 sm:text-sm",
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
        <form onSubmit={send} className="flex shrink-0 gap-2 rounded-2xl border border-slate-200/80 bg-white p-1.5 shadow-xs sm:p-2">
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
            // 16px on phones: smaller text makes iOS zoom the whole page when the field is focused.
            className="h-11 flex-1 rounded-xl border-none bg-slate-50 text-base focus-visible:ring-0 sm:text-sm"
            aria-label="Message"
            enterKeyHint="send"
            autoComplete="off"
          />
          <Button
            type="submit"
            disabled={sending || switching || !text.trim()}
            className="h-11 w-12 shrink-0 rounded-xl bg-rose-600 text-white hover:bg-rose-700 sm:w-14"
          >
            <Send className="size-4" />
            <span className="sr-only">Send</span>
          </Button>
        </form>
      ) : (
        <p className="shrink-0 rounded-2xl border border-slate-200 bg-white p-3.5 text-center text-sm font-medium text-slate-500">
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
