import { motion } from 'framer-motion';
import { useRef, useState } from 'react';
import { type SavedArtist, collection } from '../collection/store';
import type { ArtItem } from '../spotify/types';
import { ArtGrid } from './ArtGrid';
import { ArtistCards } from './ArtistCards';
import { Segmented } from './Header';

export type CollectionSort = 'recent' | 'artist' | 'year';
export type CollectionShelf = 'artists' | 'records';

const SORTS: { id: CollectionSort; label: string }[] = [
  { id: 'recent', label: 'Recently added' },
  { id: 'artist', label: 'Name' },
];

type Props = {
  artists: SavedArtist[]; // already sorted
  records: ArtItem[]; // already sorted
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
 * The collection, in two shelves: artists (the main thing you collect) and single records —
 * albums kept on their own, without collecting the whole artist.
 */
export function CollectionView({
  artists,
  records,
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
  const empty = artists.length === 0 && records.length === 0;

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
            {artists.length} artist{artists.length === 1 ? '' : 's'} · {records.length} single record
            {records.length === 1 ? '' : 's'}
          </span>
        </motion.h1>
        <div className="collection-tools">
          {!empty && <Segmented small groupId="collectionSort" value={sort === 'year' ? 'recent' : sort} options={SORTS} onChange={onSort} />}
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
              { id: 'artists', label: 'Artists' },
              { id: 'records', label: 'Records' },
            ]}
          />
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
              No single records. Keep one album on its own from its page with <strong>Add record</strong>.
            </p>
          )}
        </motion.section>
      )}
    </>
  );
}
