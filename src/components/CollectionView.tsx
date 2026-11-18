import { motion } from 'framer-motion';
import { useRef, useState } from 'react';
import { type SavedArtist, collection } from '../collection/store';
import type { ArtItem } from '../spotify/types';
import { ArtGrid } from './ArtGrid';
import { ArtistCards } from './ArtistCards';
import { Segmented } from './Header';

export type CollectionSort = 'recent' | 'title' | 'artist' | 'year';
export type CollectionShelf = 'artists' | 'records';

const RECORD_SORTS: { id: CollectionSort; label: string }[] = [
  { id: 'recent', label: 'Recently added' },
  { id: 'title', label: 'Album' },
  { id: 'artist', label: 'Artist' },
];
// Artists only have a name to sort by; any non-"recent" choice sorts them A–Z.
const ARTIST_SORTS: { id: CollectionSort; label: string }[] = [
  { id: 'recent', label: 'Recently added' },
  { id: 'artist', label: 'Name' },
];

type Props = {
  artists: SavedArtist[]; // already sorted
  records: ArtItem[]; // already filtered and sorted
  totalRecords: number;
  query: string;
  onQuery: (q: string) => void;
  shelf: CollectionShelf;
  onShelf: (s: CollectionShelf) => void;
  sort: CollectionSort;
  onSort: (s: CollectionSort) => void;
  tileSize: number;
  onSelect: (item: ArtItem) => void;
  onOpenArtist: (a: SavedArtist) => void;
  onCollectArtist: (a: { id: string; name: string }) => void;
  onBrowse: () => void;
};

/**
 * The collection: every record you've kept (the everyday view, ready to play), and the artists
 * you've collected as another way in.
 */
export function CollectionView({
  artists,
  records,
  totalRecords,
  query,
  onQuery,
  shelf,
  onShelf,
  sort,
  onSort,
  tileSize,
  onSelect,
  onOpenArtist,
  onCollectArtist,
  onBrowse,
}: Props) {
  const file = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState<string | null>(null);
  const collectedIds = new Set(artists.map((a) => a.id));
  const empty = artists.length === 0 && totalRecords === 0;

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
      setNote(added ? `Added ${added} item${added === 1 ? '' : 's'}.` : 'Nothing new in that file.');
    } catch (e) {
      setNote((e as Error).message);
    }
  };

  return (
    <>
      <div className="toolbar">
        <motion.h1 className="view-title" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}>
          Your collection
          <span className="count">
            {totalRecords} record{totalRecords === 1 ? '' : 's'} · {artists.length} artist{artists.length === 1 ? '' : 's'}
          </span>
        </motion.h1>
        <div className="collection-tools">
          {!empty && (
            <Segmented
              small
              groupId="collectionSort"
              value={shelf === 'artists' ? (sort === 'recent' ? 'recent' : 'artist') : sort === 'year' ? 'recent' : sort}
              options={shelf === 'artists' ? ARTIST_SORTS : RECORD_SORTS}
              onChange={onSort}
            />
          )}
          {!empty && (
            <button className="text-btn" onClick={exportCollection} title="Download a backup of your collection">
              Export
            </button>
          )}
          <button className="text-btn" onClick={() => file.current?.click()} title="Load a collection backup">
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
        </div>
      </div>

      {!empty && (
        <div className="collection-shelves">
          <Segmented
            groupId="collectionShelf"
            value={shelf}
            onChange={onShelf}
            options={[
              { id: 'records', label: 'Records' },
              { id: 'artists', label: 'Artists' },
            ]}
          />
          {shelf === 'records' && totalRecords > 0 && (
            <label className="record-filter">
              <input
                type="search"
                value={query}
                onChange={(e) => onQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && query && (e.stopPropagation(), onQuery(''))}
                placeholder="Filter by album or artist"
                aria-label="Filter records by album or artist"
              />
            </label>
          )}
        </div>
      )}

      {note && <p className="search-hint">{note}</p>}

      {empty ? (
        <motion.div className="empty-collection" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <h2>An empty crate</h2>
          <p>
            Find an artist you love in Search and hit <strong>Add artist</strong>. You can also keep a single record
            on its own. Everything stays here, in this browser.
          </p>
          <div className="empty-actions">
            <button className="btn-collect" onClick={onBrowse}>
              Start digging
            </button>
          </div>
        </motion.div>
      ) : shelf === 'artists' ? (
        <motion.section
          key="artists"
          className="collection-section"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {artists.length ? (
            <ArtistCards artists={artists} onOpenArtist={onOpenArtist} />
          ) : (
            <p className="search-hint">
              No artists yet.{' '}
              <button className="text-btn inline-link" onClick={onBrowse}>
                Find one in Search →
              </button>
            </p>
          )}
        </motion.section>
      ) : (
        <motion.section
          key="records"
          className="collection-section"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {records.length ? (
            <motion.div key={sort} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <ArtGrid
                items={records}
                loading={false}
                tileSize={tileSize}
                onSelect={onSelect}
                collectedArtistIds={collectedIds}
                onCollectArtist={onCollectArtist}
              />
            </motion.div>
          ) : (
            <p className="search-hint">
              {query ? (
                <>
                  Nothing matches “{query}”.{' '}
                  <button className="text-btn inline-link" onClick={() => onQuery('')}>
                    Clear filter
                  </button>
                </>
              ) : (
                <>
                  No records yet. Open any album and hit <strong>Add record</strong>, or pin one on an artist’s page.
                </>
              )}
            </p>
          )}
        </motion.section>
      )}
    </>
  );
}
