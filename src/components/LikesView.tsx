import { motion } from 'framer-motion';
import { collection, useInCollection } from '../collection/store';
import type { Like } from '../hooks/useLikes';
import { usePlayer } from '../player/PlayerContext';
import type { ArtItem } from '../spotify/types';

export type LikeRow = { like: Like; item: ArtItem };

type Props = {
  rows: LikeRow[]; // newest like first
  total: number;
  loading: boolean;
  refreshing: boolean;
  error: Error | null;
  backLabel: string;
  onBack: () => void;
  onOpenRecord: (item: ArtItem) => void;
  onRefresh: () => void;
};

const TYPE: Record<string, string> = { album: 'Album', single: 'Single', compilation: 'Compilation' };

/**
 * Your Spotify liked songs, much like Spotify shows them: click one to open its record, or add the
 * record. A Spotify extra reached from the profile menu, not part of the main tabs.
 */
export function LikesView({ rows, total, loading, refreshing, error, backLabel, onBack, onOpenRecord, onRefresh }: Props) {
  const player = usePlayer();
  const playingId = player.nowPlaying?.trackId;

  return (
    <>
      <motion.button className="back" onClick={onBack} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}>
        ← {backLabel}
      </motion.button>
      <div className="toolbar">
        <motion.h1 className="view-title" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}>
          Liked songs
          <span className="count">
            {loading && total
              ? `Loading ${rows.length.toLocaleString()} of ${total.toLocaleString()}…`
              : `${rows.length.toLocaleString()} songs, from Spotify`}
          </span>
        </motion.h1>
        <div className="collection-tools">
          <button className="text-btn" onClick={onRefresh} disabled={loading || refreshing} title="Check Spotify for new likes">
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && <p className="error">Couldn’t load your liked songs: {error.message}</p>}

      {!loading && !error && rows.length === 0 ? (
        <p className="search-hint">No liked songs on Spotify yet.</p>
      ) : (
        <div className="likes-table" role="table" aria-label="Your liked songs">
          <div className="likes-row likes-head" role="row">
            <span>#</span>
            <span />
            <span>Song</span>
            <span>Record</span>
            <span>Time</span>
            <span />
          </div>
          {rows.map((r, i) => (
            <LikeItem
              key={r.like.trackId}
              row={r}
              n={i + 1}
              playing={r.like.trackId === playingId}
              paused={!!player.nowPlaying?.paused}
              onOpenRecord={() => onOpenRecord(r.item)}
            />
          ))}
          {loading && <div className="likes-loading">Loading more liked songs…</div>}
        </div>
      )}
    </>
  );
}

function LikeItem({
  row,
  n,
  playing,
  paused,
  onOpenRecord,
}: {
  row: LikeRow;
  n: number;
  playing: boolean;
  paused: boolean;
  onOpenRecord: () => void;
}) {
  const { like, item } = row;
  const record = item.record!;
  const owned = useInCollection(record.id);
  const open = (e: React.MouseEvent) => {
    e.stopPropagation();
    onOpenRecord();
  };
  return (
    <div
      className={`likes-row ${playing ? 'is-playing' : ''}`}
      role="row"
      tabIndex={0}
      onClick={onOpenRecord}
      onKeyDown={(e) => e.key === 'Enter' && onOpenRecord()}
      title={`Open ${record.name}`}
    >
      <span className="likes-n">
        {playing && !paused ? (
          <span className="eq eq-sm" aria-label="Playing">
            <i />
            <i />
            <i />
          </span>
        ) : (
          <>
            <span className="likes-num">{n}</span>
          </>
        )}
      </span>
      <button className="likes-cover-btn" onClick={open} title={`Open ${record.name}`}>
        {item.thumb ? <img className="likes-cover" src={item.thumb} alt="" loading="lazy" /> : <span className="likes-cover" />}
      </button>
      <span className="likes-song">
        <span className="likes-title">{like.name}</span>
        <span className="likes-sub">{like.artists}</span>
      </span>
      <span className="likes-record">
        <button className="likes-record-link" onClick={open} title={`Open ${record.name}`}>
          {record.name}
        </button>
        <span className="likes-type"> · {TYPE[record.type] ?? 'Album'}</span>
      </span>
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
