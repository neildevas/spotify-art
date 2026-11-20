import { motion } from 'framer-motion';
import { collection, useInCollection } from '../collection/store';
import type { Like } from '../hooks/useLikes';
import type { ArtItem } from '../spotify/types';

export type LikeRow = { like: Like; item: ArtItem };

type Props = {
  rows: LikeRow[]; // newest like first
  stats: { songs: number; missing: number; total: number };
  loading: boolean;
  refreshing: boolean;
  error: Error | null;
  hideOwned: boolean;
  onHideOwned: (v: boolean) => void;
  tileSize: number;
  onSelect: (item: ArtItem) => void;
  onRefresh: () => void;
};

const TYPE: Record<string, string> = { album: 'Album', single: 'Single', compilation: 'Compilation' };

/** "Today", "3 days ago", "2 weeks ago", then "Oct 2026". */
function likedWhen(ms: number) {
  if (!ms) return '';
  const days = Math.floor((Date.now() - ms) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 35) return `${Math.floor(days / 7)} week${days < 14 ? '' : 's'} ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

/** Your Spotify liked songs, newest first, each with a quick way to add its record to your collection. */
export function LikesView({ rows, stats, loading, refreshing, error, hideOwned, onHideOwned, onSelect, onRefresh }: Props) {
  return (
    <>
      <div className="toolbar likes-toolbar">
        <motion.h1 className="view-title" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}>
          From your likes
          <span className="count">
            {loading && stats.total
              ? `Loading ${stats.songs.toLocaleString()} of ${stats.total.toLocaleString()} liked songs…`
              : `${stats.songs.toLocaleString()} liked songs · ${stats.missing.toLocaleString()} not in your collection`}
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

      {!loading && !error && rows.length === 0 ? (
        <p className="search-hint">
          {stats.songs === 0 ? 'No liked songs on Spotify yet.' : 'Every liked song’s record is already in your collection.'}
        </p>
      ) : (
        <div className="likes-table" role="table" aria-label="Your liked songs">
          <div className="likes-row likes-head" role="row">
            <span>#</span>
            <span />
            <span>Song</span>
            <span>Record</span>
            <span>Liked</span>
            <span>Time</span>
            <span />
          </div>
          {rows.map((r, i) => (
            <LikeItem key={r.like.trackId} row={r} n={i + 1} onOpen={() => onSelect(r.item)} />
          ))}
          {loading && <div className="likes-loading">Loading more liked songs…</div>}
        </div>
      )}
    </>
  );
}

function LikeItem({ row, n, onOpen }: { row: LikeRow; n: number; onOpen: () => void }) {
  const { like, item } = row;
  const record = item.record!;
  const owned = useInCollection(record.id);
  return (
    <div
      className="likes-row"
      role="row"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen();
      }}
      title={`Open ${record.name}`}
    >
      <span className="likes-n">{n}</span>
      {item.thumb ? <img className="likes-cover" src={item.thumb} alt="" loading="lazy" /> : <span className="likes-cover" />}
      <span className="likes-song">
        <span className="likes-title">{like.name}</span>
        <span className="likes-sub">{like.artists}</span>
      </span>
      <span className="likes-record">
        {record.name}
        <span className="likes-type"> · {TYPE[record.type] ?? 'Album'}</span>
      </span>
      <span className="likes-meta">{likedWhen(like.addedAt)}</span>
      <span className="likes-meta">{like.duration}</span>
      <button
        className={`likes-add ${owned ? 'is-in' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          collection.toggle(record);
        }}
        title={owned ? 'Remove this record from your collection' : 'Add this record to your collection'}
      >
        {owned ? (
          <>
            <span className="when-idle">✓ In your collection</span>
            <span className="when-hover">Remove</span>
          </>
        ) : (
          '+ Add record'
        )}
      </button>
    </div>
  );
}
