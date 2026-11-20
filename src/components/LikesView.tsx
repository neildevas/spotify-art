import { motion } from 'framer-motion';
import type { ArtItem } from '../spotify/types';
import { ArtGrid } from './ArtGrid';

type Props = {
  items: ArtItem[]; // one per record, most recently liked first
  stats: { songs: number; records: number; missing: number; total: number };
  loading: boolean;
  refreshing: boolean;
  error: Error | null;
  hideOwned: boolean;
  onHideOwned: (v: boolean) => void;
  tileSize: number;
  onSelect: (item: ArtItem) => void;
  onRefresh: () => void;
};

/** Records from your Spotify liked songs, most recently liked first, in the same grid as your Records. */
export function LikesView({ items, stats, loading, refreshing, error, hideOwned, onHideOwned, tileSize, onSelect, onRefresh }: Props) {
  return (
    <>
      <div className="toolbar">
        <motion.h1 className="view-title" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}>
          From your likes
          <span className="count">
            {loading && stats.total
              ? `Loading ${stats.songs.toLocaleString()} of ${stats.total.toLocaleString()} liked songs…`
              : `${stats.records.toLocaleString()} records · ${stats.missing.toLocaleString()} not in your collection`}
          </span>
        </motion.h1>
        <div className="collection-tools">
          <label className="switch">
            <input type="checkbox" checked={hideOwned} onChange={(e) => onHideOwned(e.target.checked)} />
            <span className="switch-track" aria-hidden />
            Hide records I have
          </label>
          <button className="text-btn" onClick={onRefresh} disabled={loading || refreshing} title="Check Spotify for new likes">
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && <p className="error">Couldn’t load your liked songs: {error.message}</p>}

      {!loading && !error && items.length === 0 ? (
        <p className="search-hint">
          {stats.songs === 0 ? 'No liked songs on Spotify yet.' : 'Every record from your liked songs is already in your collection.'}
        </p>
      ) : (
        <ArtGrid items={items} loading={loading && items.length === 0} tileSize={tileSize} onSelect={onSelect} collectToggle />
      )}
    </>
  );
}
