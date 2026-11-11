import { motion } from 'framer-motion';
import { useRef, useState } from 'react';
import { collection } from '../collection/store';
import type { ArtItem } from '../spotify/types';
import { ArtGrid } from './ArtGrid';
import { Segmented } from './Header';

export type CollectionSort = 'recent' | 'artist' | 'year';

const SORTS: { id: CollectionSort; label: string }[] = [
  { id: 'recent', label: 'Recently added' },
  { id: 'artist', label: 'Artist' },
  { id: 'year', label: 'Year' },
];

type Props = {
  items: ArtItem[];
  sort: CollectionSort;
  onSort: (s: CollectionSort) => void;
  tileSize: number;
  onSelect: (item: ArtItem) => void;
  onBrowse: () => void;
};

export function CollectionView({ items, sort, onSort, tileSize, onSelect, onBrowse }: Props) {
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

  return (
    <>
      <div className="toolbar">
        <motion.h1 className="view-title" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}>
          Your records
          <span className="count">
            {items.length} record{items.length === 1 ? '' : 's'}
          </span>
        </motion.h1>
        <div className="collection-tools">
          {items.length > 0 && <Segmented small groupId="collectionSort" value={sort} options={SORTS} onChange={onSort} />}
          {items.length > 0 && (
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

      {note && <p className="search-hint">{note}</p>}

      {items.length === 0 ? (
        <motion.div className="empty-collection" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <h2>An empty crate</h2>
          <p>
            Open any album, single or EP — from your library, top tracks or search — and hit{' '}
            <strong>Add to collection</strong>. It stays here, in this browser, not on Spotify.
          </p>
          <button className="btn-collect" onClick={onBrowse}>
            Start digging
          </button>
        </motion.div>
      ) : (
        <motion.div key={sort} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <ArtGrid items={items} loading={false} tileSize={tileSize} onSelect={onSelect} />
        </motion.div>
      )}
    </>
  );
}
