import { motion } from 'framer-motion';
import { type SavedArtist, useCollection } from '../collection/store';
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
  // How many of each artist's records are in your collection
  const records = useCollection();
  const ownedBy = new Map<string, number>();
  records.forEach((r) => r.artists.forEach((x) => ownedBy.set(x.id, (ownedBy.get(x.id) ?? 0) + 1)));
  const sorted = sort === 'artist' ? [...artists].sort((a, b) => a.name.localeCompare(b.name)) : artists; // stored newest-first

  const metaFor = (a: SavedArtist) => {
    const pins = a.pinned?.length ?? 0;
    const owned = ownedBy.get(a.id) ?? 0;
    return (
      [pins && `${pins} pinned`, owned && `${owned} in collection`].filter(Boolean).join(' · ') ||
      `Saved ${new Date(a.addedAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`
    );
  };

  const name = (a: SavedArtist, className: string) => (
    <motion.span className={className} layoutId={`artist-${a.id}`} transition={{ type: 'spring', stiffness: 300, damping: 32 }}>
      {a.name}
    </motion.span>
  );

  const photo = (a: SavedArtist) =>
    a.image ? <img src={a.image} alt="" loading="lazy" draggable={false} /> : <span className="artists-initial">{a.name[0]}</span>;

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
        // Portrait "sleeves": photo with a number, a thin rule, then the name — always visible
        <ul className="artists-grid">
          {sorted.map((a, i) => (
            <motion.li
              key={a.id}
              layout="position"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease, delay: Math.min(i, 15) * 0.03 }}
            >
              <button className="artists-card" onClick={() => onOpenArtist(a)}>
                <span className="artists-photo">
                  {photo(a)}
                  <span className="artists-num" aria-hidden>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                </span>
                <span className="artists-label">
                  {name(a, 'artists-name')}
                  <span className="artists-meta">{metaFor(a)}</span>
                </span>
              </button>
            </motion.li>
          ))}
        </ul>
      )}
    </>
  );
}
