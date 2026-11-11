import { motion } from 'framer-motion';
import { memo, useState } from 'react';
import { useInCollection } from '../collection/store';
import { useTilt } from '../hooks/useTilt';
import type { ArtItem } from '../spotify/types';

type Props = {
  item: ArtItem;
  index: number;
  onSelect: (item: ArtItem) => void;
};

export const ArtTile = memo(function ArtTile({ item, index, onSelect }: Props) {
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
      className={`tile${featured ? ' tile-featured' : ''}`}
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

        <span className="tile-caption">
          <span className="tile-title">{item.title}</span>
          <span className="tile-sub">{item.subtitle}</span>
        </span>
      </motion.button>
    </motion.li>
  );
});
