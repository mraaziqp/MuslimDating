/**
 * A one-line signal that the navigation badges may be out of date: a chat was
 * read, a request was answered. Pages announce it; the navigation bar listens
 * and refetches its counts, instead of waiting for its next timed refresh.
 */
const EVENT = "nikahpath:activity-changed";

export function announceActivityChanged(): void {
  window.dispatchEvent(new Event(EVENT));
}

export function onActivityChanged(listener: () => void): () => void {
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
