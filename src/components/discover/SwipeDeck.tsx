import { useEffect, useImperativeHandle, useRef, type ReactNode, type Ref } from "react";
import {
  animate,
  motion,
  motionValue,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionValue,
  type PanInfo,
} from "motion/react";
import { Bookmark, Heart, X } from "lucide-react";
import { cn } from "../../lib/utils";

export type SwipeDirection = "left" | "right" | "up";

export interface SwipeDeckHandle {
  /** Sends the top card off in a direction, exactly as if it had been dragged there. */
  swipe: (direction: SwipeDirection) => void;
}

interface SwipeDeckProps<T> {
  /** Remaining cards; the first one is on top. */
  items: T[];
  getKey: (item: T) => string;
  renderCard: (item: T) => ReactNode;
  /** Asked before a card leaves. Returning false springs it back (explain why to the user here). */
  canSwipe?: (item: T, direction: SwipeDirection) => boolean;
  /** Called once the card has left the screen. Remove it from `items` here. */
  onSwipe: (item: T, direction: SwipeDirection) => void;
  /** Tapping (not dragging) the top card. */
  onOpen?: (item: T) => void;
  ref?: Ref<SwipeDeckHandle>;
  className?: string;
}

const STACK_DEPTH = 3;
const DISTANCE_THRESHOLD = 96;
const VELOCITY_THRESHOLD = 600;
const TAP_SLOP = 6;
/** How far the top card travels before the card beneath has fully risen into its place. */
const RISE_DISTANCE = 170;
const STACK_SCALE_STEP = 0.045;
const STACK_OFFSET = 14;

function directionOf(info: PanInfo): SwipeDirection | null {
  const { offset, velocity } = info;
  const vertical = Math.abs(offset.y) > Math.abs(offset.x);
  if (vertical) {
    return offset.y < -DISTANCE_THRESHOLD || velocity.y < -VELOCITY_THRESHOLD ? "up" : null;
  }
  if (offset.x > DISTANCE_THRESHOLD || velocity.x > VELOCITY_THRESHOLD) return "right";
  if (offset.x < -DISTANCE_THRESHOLD || velocity.x < -VELOCITY_THRESHOLD) return "left";
  return null;
}

/** A short tick on phones that support it, so a committed swipe can be felt. */
function haptic(): void {
  try {
    if (typeof navigator.vibrate === "function") navigator.vibrate(8);
  } catch {
    // Vibration is a nicety; some browsers throw when it is blocked.
  }
}

interface DeckCardProps {
  depth: number;
  children: ReactNode;
  /** 0 → resting, 1 → this card has travelled far enough to be gone. Written by this card. */
  ownProgress: MotionValue<number>;
  /** The same measure for whichever card is currently on top. */
  topProgress: MotionValue<number>;
  canLeave: (direction: SwipeDirection) => boolean;
  onGone: (direction: SwipeDirection) => void;
  onOpen?: () => void;
  ref?: Ref<SwipeDeckHandle>;
}

function Stamp({ tone, children, className }: { tone: string; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "flex items-center gap-1.5 rounded-xl border-[3px] bg-white/90 px-3 py-1.5 text-lg font-extrabold tracking-wide uppercase shadow-lg backdrop-blur-sm",
        tone,
        className,
      )}
    >
      {children}
    </span>
  );
}

function DeckCard({ depth, children, ownProgress, topProgress, canLeave, onGone, onOpen, ref }: DeckCardProps) {
  const isTop = depth === 0;
  const reduceMotion = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const leaving = useRef(false);
  const pressedAt = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const report = () => ownProgress.set(Math.min(1, Math.hypot(x.get(), y.get()) / RISE_DISTANCE));
    const stopX = x.on("change", report);
    const stopY = y.on("change", report);
    return () => {
      stopX();
      stopY();
    };
  }, [x, y, ownProgress]);

  // A card's place in the stack is its depth minus how far the top card has gone.
  // When the top card finally leaves, every depth drops by one and the progress it
  // was reading returns to zero in the same render, so nothing jumps.
  const place = useTransform(() => Math.max(0, depth - topProgress.get()));
  const eased = useSpring(place, { stiffness: 420, damping: 36 });
  const settled = reduceMotion ? place : eased;
  const stackScale = useTransform(settled, (d) => 1 - d * STACK_SCALE_STEP);
  const stackY = useTransform(settled, (d) => d * STACK_OFFSET);

  const rotate = useTransform(x, [-320, 0, 320], [-11, 0, 11]);
  // Only the dominant axis shows its stamp, so a diagonal drag never shows two.
  const horizontal = () => Math.abs(x.get()) >= Math.abs(y.get());
  const interestedOpacity = useTransform(() => (horizontal() ? Math.min(1, Math.max(0, (x.get() - 24) / 80)) : 0));
  const passOpacity = useTransform(() => (horizontal() ? Math.min(1, Math.max(0, (-x.get() - 24) / 80)) : 0));
  const saveOpacity = useTransform(() => (horizontal() ? 0 : Math.min(1, Math.max(0, (-y.get() - 24) / 80))));

  const settle = () => {
    const spring = { type: "spring", stiffness: 520, damping: 34 } as const;
    void animate(x, 0, spring);
    void animate(y, 0, spring);
  };

  const leave = (direction: SwipeDirection) => {
    if (leaving.current) return;
    if (!canLeave(direction)) {
      settle();
      return;
    }
    leaving.current = true;
    haptic();
    const options = { duration: reduceMotion ? 0 : 0.28, ease: "easeIn" } as const;
    const exit =
      direction === "up"
        ? animate(y, -Math.max(window.innerHeight, 720), options)
        : animate(x, (direction === "right" ? 1 : -1) * Math.max(window.innerWidth, 640), options);
    void exit.then(() => onGone(direction));
  };

  useImperativeHandle(ref, () => ({ swipe: leave }));

  return (
    <motion.div
      className="absolute inset-0 will-change-transform"
      style={{ zIndex: STACK_DEPTH - depth, scale: stackScale, y: stackY }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: reduceMotion ? 0 : 0.2 }}
      aria-hidden={!isTop}
      inert={!isTop}
    >
      <motion.div
        className={cn("relative size-full", isTop && "cursor-grab active:cursor-grabbing")}
        style={{ x, y, rotate, touchAction: "none" }}
        drag={isTop}
        dragMomentum={false}
        onPointerDown={(event) => {
          pressedAt.current = { x: event.clientX, y: event.clientY };
        }}
        onDragEnd={(_event, info) => {
          const direction = directionOf(info);
          if (direction) leave(direction);
          else settle();
        }}
        onTap={(event) => {
          const start = pressedAt.current;
          const moved =
            start && "clientX" in event ? Math.hypot(event.clientX - start.x, event.clientY - start.y) : 0;
          if (isTop && !leaving.current && moved <= TAP_SLOP) onOpen?.();
        }}
        whileDrag={{ scale: 1.02 }}
      >
        {children}
        {isTop && (
          <div className="pointer-events-none absolute inset-0 z-10" aria-hidden>
            <motion.div style={{ opacity: interestedOpacity }} className="absolute top-6 left-5 -rotate-12">
              <Stamp tone="border-emerald-500 text-emerald-600">
                <Heart className="size-5 fill-current" /> Interested
              </Stamp>
            </motion.div>
            <motion.div style={{ opacity: passOpacity }} className="absolute top-6 right-5 rotate-12">
              <Stamp tone="border-slate-500 text-slate-600">
                <X className="size-5" strokeWidth={3} /> Pass
              </Stamp>
            </motion.div>
            <motion.div style={{ opacity: saveOpacity }} className="absolute inset-x-0 bottom-10 flex justify-center">
              <Stamp tone="border-amber-500 text-amber-600">
                <Bookmark className="size-5 fill-current" /> Save for later
              </Stamp>
            </motion.div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

/**
 * A stack of draggable cards. Drag right, left or up to decide; anything short
 * of the threshold springs back. The card beneath rises as the top one is
 * pulled away. The same decisions are available to buttons and the keyboard
 * through the `swipe` handle.
 */
export function SwipeDeck<T>({ items, getKey, renderCard, canSwipe, onSwipe, onOpen, ref, className }: SwipeDeckProps<T>) {
  const topCard = useRef<SwipeDeckHandle>(null);
  useImperativeHandle(ref, () => ({ swipe: (direction) => topCard.current?.swipe(direction) }));

  const visible = items.slice(0, STACK_DEPTH);
  const visibleKeys = visible.map(getKey);

  const progress = useRef(new Map<string, MotionValue<number>>());
  const progressFor = (key: string): MotionValue<number> => {
    let value = progress.current.get(key);
    if (!value) {
      value = motionValue(0);
      progress.current.set(key, value);
    }
    return value;
  };
  useEffect(() => {
    for (const key of progress.current.keys()) {
      if (!visibleKeys.includes(key)) progress.current.delete(key);
    }
  });

  const topKey = visibleKeys[0];
  if (topKey === undefined) return <div className={cn("relative", className)} />;
  const topProgress = progressFor(topKey);

  return (
    <div className={cn("relative", className)}>
      {/* Painted back to front so the top card is last in the DOM. */}
      {visible
        .map((item, depth) => {
          const key = getKey(item);
          return (
            <DeckCard
              key={key}
              ref={depth === 0 ? topCard : undefined}
              depth={depth}
              ownProgress={progressFor(key)}
              topProgress={topProgress}
              canLeave={(direction) => canSwipe?.(item, direction) ?? true}
              onGone={(direction) => onSwipe(item, direction)}
              onOpen={onOpen ? () => onOpen(item) : undefined}
            >
              {renderCard(item)}
            </DeckCard>
          );
        })
        .reverse()}
    </div>
  );
}
