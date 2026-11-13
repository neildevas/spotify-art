import { AnimatePresence, motion } from 'framer-motion';
import { useRef, useState } from 'react';
import { collection } from '../collection/store';
import type { ArtItem } from '../spotify/types';
import { ArtGrid } from './ArtGrid';
import { Segmented } from './Header';

export type CollectionSort = 'recent' | 'artist' | 'year';
/** The two shelves of the collection: records you've added here, and albums saved in Spotify. */
export type Shelf = 'records' | 'spotify';

const SORTS: { id: CollectionSort; label: string }[] = [
  { id: 'recent', label: 'Recently added' },
  { id: 'artist', label: 'Artist' },
  { id: 'year', label: 'Year' },
];

const ease = [0.22, 1, 0.36, 1] as const;

type SpotifyShelf = {
  items: ArtItem[];
  loading: boolean;
  refreshing: boolean;
  error: Error | null;
  refresh: () => void;
};

type Props = {
  shelf: Shelf;
  onShelf: (s: Shelf) => void;
  records: ArtItem[];
  spotify: SpotifyShelf;
  sort: CollectionSort;
  onSort: (s: CollectionSort) => void;
  tileSize: number;
  onSelect: (item: ArtItem) => void;
  onBrowse: () => void;
};

export function CollectionView({ shelf, onShelf, records, spotify, sort, onSort, tileSize, onSelect, onBrowse }: Props) {
  const file = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState<string | null>(null);

  const exportCollection = () => {
    const blob = new Blob([collection.exportJson()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `sleeve-collection-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importCollection = async (f: File) => {
    try {
      const added = collection.importJson(await f.text());
      setNote(added ? `Added ${added} record${added === 1 ? '' : 's'}.` : 'Nothing new in that file.');
    } catch (e) {
      setNote((e as Error).message);
    }
  };

  const items = shelf === 'records' ? records : spotify.items;
  const spotifyCount = `${spotify.items.length}${(spotify.loading || spotify.refreshing) && spotify.items.length ? '…' : ''}`;

  return (
    <>
      <div className="toolbar">
        {/* The page title doubles as the shelf switch */}
        <h1 className="view-title shelf-switch" role="tablist">
          <ShelfTab active={shelf === 'records'} onClick={() => onShelf('records')} label="Your records" count={String(records.length)} />
          <ShelfTab
            active={shelf === 'spotify'}
            onClick={() => onShelf('spotify')}
            label="Saved on Spotify"
            count={spotify.items.length ? spotifyCount : ''}
          />
        </h1>

        <div className="collection-tools">
          {items.length > 0 && <Segmented small groupId="collectionSort" value={sort} options={SORTS} onChange={onSort} />}
          {shelf === 'records' ? (
            <>
              {records.length > 0 && (
                <button className="text-btn" onClick={exportCollection} title="Download a backup of your records">
                  Export
                </button>
              )}
              <button className="text-btn" onClick={() => file.current?.click()} title="Load a records backup">
                Import
              </button>
              <input
                ref={file}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) importCollection(f);
                  e.target.value = '';
                }}
              />
            </>
          ) : (
            <button
              className="text-btn"
              onClick={spotify.refresh}
              disabled={spotify.loading || spotify.refreshing}
              title="Re-sync your saved albums from Spotify"
            >
              {spotify.refreshing ? 'Syncing…' : 'Refresh'}
            </button>
          )}
        </div>
      </div>

      {shelf === 'records' && note && <p className="search-hint">{note}</p>}
      {shelf === 'spotify' && spotify.error && (
        <p className="error">Couldn’t load from Spotify: {spotify.error.message}</p>
      )}

      <AnimatePresence mode="wait">
        <motion.div
          key={`${shelf}-${sort}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, transition: { duration: 0.15 } }}
          transition={{ duration: 0.35, ease }}
        >
          {shelf === 'records' && records.length === 0 ? (
            <div className="empty-collection">
              <h2>An empty crate</h2>
              <p>
                Open any album, single or EP — from your Spotify saves or search — and hit{' '}
                <strong>Add to collection</strong>. It stays here, in this browser, not on Spotify.
              </p>
              <div className="empty-actions">
                <button className="btn-collect" onClick={onBrowse}>
                  Start digging
                </button>
                <button className="btn-ghost" onClick={() => onShelf('spotify')}>
                  Look through your Spotify saves
                </button>
              </div>
            </div>
          ) : shelf === 'spotify' && !spotify.loading && !spotify.error && spotify.items.length === 0 ? (
            <p className="empty">No saved albums yet — save a few in Spotify and come back.</p>
          ) : (
            <ArtGrid items={items} loading={shelf === 'spotify' && spotify.loading} tileSize={tileSize} onSelect={onSelect} />
          )}
        </motion.div>
      </AnimatePresence>
    </>
  );
}

function ShelfTab({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: string }) {
  return (
    <button role="tab" aria-selected={active} className={`shelf-tab ${active ? 'is-active' : ''}`} onClick={onClick}>
      {label}
      {count && <sup className="shelf-count">{count}</sup>}
      {active && <motion.span layoutId="shelf-underline" className="shelf-underline" transition={{ type: 'spring', stiffness: 420, damping: 36 }} />}
    </button>
  );
}
