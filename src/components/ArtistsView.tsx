import { motion } from 'framer-motion';
import type { SavedArtist } from '../collection/store';
import type { CollectionSort } from './CollectionView';
import { Segmented } from './Header';

const SORTS: { id: CollectionSort; label: string }[] = [
  { id: 'recent', label: 'Recently added' },
  { id: 'artist', label: 'Name' },
];

const ease = [0.22, 1, 0.36, 1] as const;

type Props = {
  artists: SavedArtist[];
  sort: CollectionSort;
  onSort: (s: CollectionSort) => void;
  onOpenArtist: (a: SavedArtist) => void;
  onBrowse: () => void;
};

/** Artists saved from their pages — a shortcut back to all their releases. */
export function ArtistsView({ artists, sort, onSort, onOpenArtist, onBrowse }: Props) {
  const sorted = sort === 'artist' ? [...artists].sort((a, b) => a.name.localeCompare(b.name)) : artists; // stored newest-first

  return (
    <>
      <div className="toolbar">
        <motion.h1 className="view-title" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}>
          Artists
          <span className="count">{artists.length} saved</span>
        </motion.h1>
        {artists.length > 0 && (
          <Segmented small groupId="artistsSort" value={sort === 'year' ? 'recent' : sort} options={SORTS} onChange={onSort} />
        )}
      </div>

      {artists.length === 0 ? (
        <motion.div className="empty-collection" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <h2>No artists yet</h2>
          <p>
            Open an artist from Search and hit <strong>Save artist</strong> to keep a shortcut to all their releases
            here.
          </p>
          <div className="empty-actions">
            <button className="btn-collect" onClick={onBrowse}>
              Find an artist
            </button>
          </div>
        </motion.div>
      ) : (
        <ul className="artist-list">
          {sorted.map((a, i) => (
            <motion.li
              key={a.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease, delay: Math.min(i, 12) * 0.03 }}
            >
              <button className="artist-link-row has-photo" onClick={() => onOpenArtist(a)}>
                <span className="artist-row-photo" aria-hidden>
                  {a.image ? <img src={a.image} alt="" loading="lazy" draggable={false} /> : a.name[0]}
                </span>
                <motion.span
                  className="artist-index-name"
                  layoutId={`artist-${a.id}`}
                  transition={{ type: 'spring', stiffness: 300, damping: 32 }}
                >
                  {a.name}
                </motion.span>
                <span className="artist-genre">{a.genres?.slice(0, 2).join(', ')}</span>
                <span className="artist-arrow" aria-hidden>
                  →
                </span>
              </button>
            </motion.li>
          ))}
        </ul>
      )}
    </>
  );
}
