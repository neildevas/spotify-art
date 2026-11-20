import { motion } from 'framer-motion';
import type { ArtItem } from '../spotify/types';
import { ArtGrid } from './ArtGrid';
import { Segmented } from './Header';

export type LikesSort = 'most' | 'recent';

const SORTS: { id: LikesSort; label: string }[] = [
  { id: 'most', label: 'Most liked' },
  { id: 'recent', label: 'Recently liked' },
];

type Props = {
  items: ArtItem[]; // already grouped, filtered and sorted
  stats: { songs: number; records: number; missing: number; total: number };
  loading: boolean;
  refreshing: boolean;
  error: Error | null;
  sort: LikesSort;
  onSort: (s: LikesSort) => void;
  hideOwned: boolean;
  onHideOwned: (v: boolean) => void;
  tileSize: number;
  onSelect: (item: ArtItem) => void;
  onRefresh: () => void;
};

/** Records from your Spotify liked songs, grouped by album, so you can pull the keepers into your collection. */
export function LikesView({
  items,
  stats,
  loading,
  refreshing,
  error,
  sort,
  onSort,
  hideOwned,
  onHideOwned,
  tileSize,
  onSelect,
  onRefresh,
}: Props) {
  const fetching = loading || refreshing;
  return (
    <>
      <div className="toolbar likes-toolbar">
        <motion.h1 className="view-title" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}>
          From your likes
          <span className="count">
            {loading && stats.total
              ? `Loading ${stats.songs.toLocaleString()} of ${stats.total.toLocaleString()} liked songs…`
              : `${stats.songs.toLocaleString()} liked songs on ${stats.records.toLocaleString()} records · ${stats.missing.toLocaleString()} you don’t have yet`}
          </span>
        </motion.h1>
        <div className="collection-tools">
          <label className="switch">
            <input type="checkbox" checked={hideOwned} onChange={(e) => onHideOwned(e.target.checked)} />
            <span className="switch-track" aria-hidden />
            Hide records I have
          </label>
          <Segmented small groupId="likesSort" value={sort} options={SORTS} onChange={onSort} />
          <button className="text-btn" onClick={onRefresh} disabled={fetching} title="Check Spotify for new likes">
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && <p className="error">Couldn’t load your liked songs: {error.message}</p>}

      {!loading && !error && items.length === 0 ? (
        <p className="search-hint">
          {stats.songs === 0
            ? 'No liked songs on Spotify yet.'
            : 'You have every record from your liked songs. Nice crate.'}
        </p>
      ) : (
        <ArtGrid
          items={items}
          loading={loading && items.length === 0}
          tileSize={tileSize}
          onSelect={onSelect}
          collectToggle
        />
      )}
    </>
  );
}
