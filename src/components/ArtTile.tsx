import { motion } from 'framer-motion';
import { memo, useState } from 'react';
import { useInCollection } from '../collection/store';
import { useTilt } from '../hooks/useTilt';
import { PlayButton } from '../player/PlayButton';
import type { ArtItem } from '../spotify/types';

type Props = {
  item: ArtItem;
  index: number;
  onSelect: (item: ArtItem) => void;
  /** Approximate rendered width in CSS px, used to choose between the 300px and 640px covers. */
  tileWidth: number;
  pinned?: boolean;
  onTogglePin?: (item: ArtItem) => void;
};

export const ArtTile = memo(function ArtTile({ item, index, onSelect, tileWidth, pinned, onTogglePin }: Props) {
  const [loaded, setLoaded] = useState(false);

  const { rotateX, rotateY, glare, handlers, reset } = useTilt(9);

  const collected = useInCollection(item.record?.id);
  // Inside the Collection view every tile is collected, so the mark would just be noise there.
  const showMark = collected && !item.key.startsWith('record-');

  const stackDepth = Math.min((item.tracks?.length ?? 1) - 1, 2);
  // Albums with several of your top tracks get a bigger slot on the wall.
  const featured = (item.tracks?.length ?? 0) >= 3;

  return (
    <motion.li
      className={`tile${featured ? ' tile-featured' : ''}${item.key.startsWith('record-') ? ' tile-playable' : ''}`}
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
        {onTogglePin && (
          // span, not button: it sits inside the tile's button
          <span
            role="button"
            tabIndex={0}
            className={`pin-btn ${pinned ? 'is-pinned' : ''}`}
            title={pinned ? 'Take off the top shelf' : 'Pin to the top shelf'}
            aria-label={pinned ? 'Unpin' : 'Pin to top shelf'}
            onClick={(e) => {
              e.stopPropagation();
              onTogglePin(item);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                onTogglePin(item);
              }
            }}
          >
            <PinIcon />
          </span>
        )}
        {/* Playback starts in the Collection tab */}
        {item.key.startsWith('record-') && item.albumId && <PlayButton albumId={item.albumId} />}

        <span className="tile-caption">
          <span className="tile-title">{item.title}</span>
          <span className="tile-sub">{item.subtitle}</span>
        </span>
      </motion.button>
    </motion.li>
  );
});

export function PinIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 17v5" />
      <path d="M9 3h6l-1 6 3 3v2H7v-2l3-3z" />
    </svg>
  );
}
