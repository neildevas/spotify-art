import { motion } from 'framer-motion';
import { type SavedArtist, useCollection } from '../collection/store';

const ease = [0.22, 1, 0.36, 1] as const;

/** Collected artists as portrait "sleeves": photo with a number, a thin rule, then the name. */
export function ArtistCards({ artists, onOpenArtist }: { artists: SavedArtist[]; onOpenArtist: (a: SavedArtist) => void }) {
  // How many of each artist's records you've also collected
  const records = useCollection();
  const ownedBy = new Map<string, number>();
  records.forEach((r) => r.artists.forEach((x) => ownedBy.set(x.id, (ownedBy.get(x.id) ?? 0) + 1)));

  const metaFor = (a: SavedArtist) => {
    const owned = ownedBy.get(a.id) ?? 0;
    return owned
      ? `${owned} record${owned === 1 ? '' : 's'}`
      : `Since ${new Date(a.addedAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`;
  };

  return (
    <ul className="artists-grid">
      {artists.map((a, i) => (
        <motion.li
          key={a.id}
          layout="position"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease, delay: Math.min(i, 15) * 0.03 }}
        >
          <button className="artists-card" onClick={() => onOpenArtist(a)}>
            <span className="artists-photo">
              {a.image ? (
                <img src={a.image} alt="" loading="lazy" draggable={false} />
              ) : (
                <span className="artists-initial">{a.name[0]}</span>
              )}
              <span className="artists-num" aria-hidden>
                {String(i + 1).padStart(2, '0')}
              </span>
            </span>
            <span className="artists-label">
              <motion.span
                className="artists-name"
                layoutId={`artist-${a.id}`}
                transition={{ type: 'spring', stiffness: 300, damping: 32 }}
              >
                {a.name}
              </motion.span>
              <span className="artists-meta">{metaFor(a)}</span>
            </span>
          </button>
        </motion.li>
      ))}
    </ul>
  );
}
