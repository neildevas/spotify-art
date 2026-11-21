import { motion } from 'framer-motion';
import { memo, useEffect, useRef, useState } from 'react';
import { collection, useInCollection } from '../collection/store';
import { useTilt } from '../hooks/useTilt';
import { PlayButton } from '../player/PlayButton';
import type { ArtItem } from '../spotify/types';
import { isPlayable } from '../spotify/api';

type Props = {
  item: ArtItem;
  index: number;
  onSelect: (item: ArtItem) => void;
  /** Approximate rendered width in CSS px, used to choose between the 300px and 640px covers. */
  tileWidth: number;
  collectToggle?: boolean;
  onCollectArtist?: (artist: { id: string; name: string }) => void;
  /** Drag-to-arrange handlers from the grid (Records → Your order). */
  reorder?: { start: (key: string) => void; over: (key: string, after: boolean) => void; end: () => void };
  dragging?: boolean;
};

export const ArtTile = memo(function ArtTile({
  item,
  index,
  onSelect,
  tileWidth,
  collectToggle,
  onCollectArtist,
  reorder,
  dragging,
}: Props) {
  const [loaded, setLoaded] = useState(false);
  const liRef = useRef<HTMLLIElement>(null);
  const reorderRef = useRef(reorder);
  reorderRef.current = reorder;

  // Native drag and drop, wired by hand: framer-motion claims the onDrag* props for its own gestures.
  const canReorder = !!reorder;
  useEffect(() => {
    const el = liRef.current;
    if (!el || !canReorder) return;
    const onStart = (e: DragEvent) => {
      e.dataTransfer?.setData('text/plain', item.key);
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
      reorderRef.current?.start(item.key);
    };
    const onOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      const r = el.getBoundingClientRect();
      reorderRef.current?.over(item.key, e.clientX > r.left + r.width / 2);
    };
    const onDrop = (e: DragEvent) => e.preventDefault();
    const onEnd = () => reorderRef.current?.end();
    el.addEventListener('dragstart', onStart);
    el.addEventListener('dragover', onOver);
    el.addEventListener('drop', onDrop);
    el.addEventListener('dragend', onEnd);
    return () => {
      el.removeEventListener('dragstart', onStart);
      el.removeEventListener('dragover', onOver);
      el.removeEventListener('drop', onDrop);
      el.removeEventListener('dragend', onEnd);
    };
  }, [canReorder, item.key]);

  const { rotateX, rotateY, glare, handlers, reset } = useTilt(9);

  const collected = useInCollection(item.record?.id);
  // Inside the Collection view every tile is collected, so the mark would just be noise there.
  const showMark = collected && !item.key.startsWith('record-');

  const stackDepth = Math.min((item.tracks?.length ?? 1) - 1, 2);
  // Albums with several of your top tracks get a bigger slot on the wall.
  const featured = (item.tracks?.length ?? 0) >= 3;

  return (
    <motion.li
      ref={liRef}
      draggable={canReorder || undefined}
      className={`tile${featured ? ' tile-featured' : ''}${isPlayable(item) ? ' tile-playable' : ''}${dragging ? ' tile-dragging' : ''}`}
      layout="position"
      initial={{ opacity: 0, y: 18, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1], delay: (index % 50) * 0.018 }}
    >
      <motion.button
        className="tile-btn"
        {...handlers}
        onClick={() => {
          reset();
          onSelect(item);
        }}
        style={{ rotateX, rotateY }}
        whileTap={{ scale: 0.97 }}
        aria-label={`${item.title} by ${item.subtitle}`}
      >
        {/* Extra sleeves peeking out behind = more tracks from this record */}
        {Array.from({ length: stackDepth }, (_, i) => (
          <span
            key={i}
            className={`tile-stack tile-stack-${i + 1}`}
            style={{ backgroundImage: `url("${item.thumb}")` }}
            aria-hidden
          />
        ))}

        <motion.div
          className="tile-art"
          layoutId={item.key}
          transition={{ type: 'spring', stiffness: 300, damping: 32 }}
        >
          <img
            src={item.thumb}
            srcSet={item.thumb !== item.image ? `${item.thumb} 300w, ${item.image} 640w` : undefined}
            sizes={`(max-width: 760px) 50vw, ${featured ? tileWidth * 2 : tileWidth}px`}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
            onLoad={() => setLoaded(true)}
            className={loaded ? 'is-loaded' : ''}
          />
          <motion.span className="tile-glare" style={{ background: glare }} />
        </motion.div>

        {item.rank && <span className="tile-rank">{item.rank}</span>}
        {item.tracks && item.tracks.length > 1 && <span className="tile-count">{item.tracks.length} tracks</span>}
        {showMark && <span className="tile-collected" title="In your collection" aria-label="In your collection" />}
        {onCollectArtist && item.artists?.[0] && (
          // A single record can grow into the whole artist
          <span
            role="button"
            tabIndex={0}
            className="collect-artist-btn"
            title={`Add ${item.artists[0].name}`}
            onClick={(e) => {
              e.stopPropagation();
              onCollectArtist(item.artists![0]);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                onCollectArtist(item.artists![0]);
              }
            }}
          >
            + Add artist
          </span>
        )}
        {collectToggle && item.record && (
          // span, not button: it sits inside the tile's button
          <span
            role="button"
            tabIndex={0}
            className={`add-btn ${collected ? 'is-in' : ''}`}
            title={collected ? 'Remove from your collection' : 'Add to your collection'}
            aria-label={collected ? `Remove ${item.title} from your collection` : `Add ${item.title} to your collection`}
            aria-pressed={collected}
            onClick={(e) => {
              e.stopPropagation();
              collection.toggle(item.record!);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                collection.toggle(item.record!);
              }
            }}
          >
            {collected ? '✓' : '+'}
          </span>
        )}
        {/* Playback starts in the Collection tab */}
        {isPlayable(item) && <PlayButton albumId={item.albumId!} />}

        <span className="tile-caption">
          <span className="tile-title">{item.title}</span>
          <span className="tile-sub">{item.subtitle}</span>
        </span>
      </motion.button>
    </motion.li>
  );
});
