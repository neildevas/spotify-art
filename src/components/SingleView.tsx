import { AnimatePresence, type PanInfo, motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useDominantColor } from '../hooks/useDominantColor';
import { useTilt } from '../hooks/useTilt';
import { useLayoutMode } from './LayoutMode';
import type { ArtItem } from '../spotify/types';

type Props = {
  items: ArtItem[];
  loading: boolean;
  onSelect: (item: ArtItem) => void;
};

const ease = [0.22, 1, 0.36, 1] as const;
const SWIPE_DISTANCE = 90; // px dragged…
const SWIPE_VELOCITY = 450; // …or flung fast enough
const WHEEL_COOLDOWN_MS = 380;

// Covers slide in from the side they came from, with a slight turn like a record being flipped.
const card = {
  enter: (dir: number) => ({ x: dir >= 0 ? '55%' : '-55%', opacity: 0, scale: 0.86, rotateY: dir >= 0 ? -18 : 18 }),
  center: { x: 0, opacity: 1, scale: 1, rotateY: 0 },
  exit: (dir: number) => ({ x: dir >= 0 ? '-55%' : '55%', opacity: 0, scale: 0.86, rotateY: dir >= 0 ? 18 : -18 }),
};

/** One record at a time, big and centred. Prev/next by button, ← →, swipe/drag or trackpad. */
export function SingleView({ items, loading, onSelect }: Props) {
  const [[rawIndex, dir], setPos] = useState<[number, number]>([0, 0]);
  const index = Math.min(rawIndex, Math.max(items.length - 1, 0));
  const item = items[index];
  const prev = items[index - 1];
  const next = items[index + 1];
  const color = useDominantColor(item?.thumb);

  // If the album overlay moves on (← → inside it), land on that record when it closes.
  const { selectedKey } = useLayoutMode();
  useEffect(() => {
    if (!selectedKey) return;
    const i = items.findIndex((x) => x.key === selectedKey);
    if (i >= 0) setPos(([cur]) => (cur === i ? [cur, 0] : [i, i > cur ? 1 : -1]));
  }, [selectedKey, items]);

  const go = useCallback(
    (d: -1 | 1) =>
      setPos(([i]) => {
        const target = Math.min(Math.max(i + d, 0), items.length - 1);
        return target === i ? [i, d] : [target, d];
      }),
    [items.length],
  );

  // Keyboard: only when no album overlay is open and the user isn't typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('.overlay')) return;
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  // Trackpad: a sideways two-finger swipe flips one record.
  const lastWheel = useRef(0);
  const onWheel = (e: React.WheelEvent) => {
    if (Math.abs(e.deltaX) < 25 || Math.abs(e.deltaX) < Math.abs(e.deltaY)) return;
    const now = Date.now();
    if (now - lastWheel.current < WHEEL_COOLDOWN_MS) return;
    lastWheel.current = now;
    go(e.deltaX > 0 ? 1 : -1);
  };

  // Warm the cache for the neighbours so flipping is instant.
  useEffect(() => {
    [items[index - 1], items[index + 1], items[index + 2]].forEach((it) => {
      if (it) new Image().src = it.image;
    });
  }, [items, index]);

  if (!item) {
    return <div className="single single-empty">{loading ? <div className="single-skeleton skeleton" /> : null}</div>;
  }

  return (
    <div className="single" onWheel={onWheel}>
      <div className="single-ambient" style={{ '--ambient': color ?? 'transparent' } as React.CSSProperties} aria-hidden />

      <div className="single-stage">
        <Peek item={prev} side="left" onClick={() => go(-1)} />

        {/* Outgoing and incoming cards overlap (both absolutely centred) while they cross. */}
        <AnimatePresence initial={false} custom={dir}>
          <Card key={item.key} item={item} dir={dir} onSelect={onSelect} onSwipe={go} />
        </AnimatePresence>

        <Peek item={next} side="right" onClick={() => go(1)} />
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={item.key}
          className="single-info"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.25, ease }}
        >
          {item.rank && <p className="eyebrow">No. {item.rank}</p>}
          <h2>{item.title}</h2>
          <p>
            {item.subtitle}
            {item.year && <span className="single-year"> · {item.year}</span>}
            {item.tracks && item.tracks.length > 1 && <span className="single-year"> · {item.tracks.length} of your tracks</span>}
          </p>
        </motion.div>
      </AnimatePresence>

      <div className="single-nav">
        <button className="nav-btn" onClick={() => go(-1)} disabled={!prev} aria-label="Previous record">
          ←
        </button>
        <span className="single-count">
          {index + 1} / {items.length}
          {loading ? '…' : ''}
        </span>
        <button className="nav-btn" onClick={() => go(1)} disabled={!next} aria-label="Next record">
          →
        </button>
      </div>
    </div>
  );
}

function Card({
  item,
  dir,
  onSelect,
  onSwipe,
}: {
  item: ArtItem;
  dir: number;
  onSelect: (item: ArtItem) => void;
  onSwipe: (d: -1 | 1) => void;
}) {
  const tilt = useTilt(7);
  const dragged = useRef(false);

  const onDragEnd = (_: unknown, { offset, velocity }: PanInfo) => {
    if (offset.x < -SWIPE_DISTANCE || velocity.x < -SWIPE_VELOCITY) onSwipe(1);
    else if (offset.x > SWIPE_DISTANCE || velocity.x > SWIPE_VELOCITY) onSwipe(-1);
  };

  return (
    <motion.div
      className="single-card"
      custom={dir}
      variants={card}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{ duration: 0.55, ease }}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.55}
      onDragStart={() => {
        dragged.current = true;
        tilt.reset();
      }}
      onDragEnd={onDragEnd}
    >
      <div className="single-tilt-wrap" {...tilt.handlers}>
        <motion.div className="single-tilt" style={{ rotateX: tilt.rotateX, rotateY: tilt.rotateY }}>
          <motion.button
            className="single-art"
            layoutId={item.key}
            transition={{ type: 'spring', stiffness: 300, damping: 32 }}
            onClick={() => {
              // A drag ends with a click; only open the album on a real click.
              if (dragged.current) return void (dragged.current = false);
              onSelect(item);
            }}
            aria-label={`Open ${item.title}`}
          >
            <img src={item.image} alt={`${item.title} artwork`} draggable={false} />
            <motion.span className="tile-glare single-glare" style={{ background: tilt.glare }} />
          </motion.button>
        </motion.div>
      </div>
    </motion.div>
  );
}

function Peek({ item, side, onClick }: { item?: ArtItem; side: 'left' | 'right'; onClick: () => void }) {
  return (
    <AnimatePresence initial={false}>
      {item && (
        <motion.button
          key={item.key}
          className={`single-peek single-peek-${side}`}
          onClick={onClick}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease }}
          aria-label={side === 'left' ? 'Previous record' : 'Next record'}
          tabIndex={-1}
        >
          <img src={item.thumb} alt="" draggable={false} />
        </motion.button>
      )}
    </AnimatePresence>
  );
}
