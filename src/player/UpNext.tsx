import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { getQueue } from '../spotify/api';
import type { Track } from '../spotify/types';
import { usePlayer } from './PlayerContext';

const SHOWN = 12;

/** Spotify's queue for this session: what you've queued, then the rest of the album or list. */
export function UpNext({ onClose }: { onClose: () => void }) {
  const { nowPlaying, queueVersion } = usePlayer();
  const [queue, setQueue] = useState<Track[] | null>(null);
  const [failed, setFailed] = useState(false);

  // Refresh when it opens, when the song changes, and when something is queued.
  useEffect(() => {
    let alive = true;
    getQueue()
      .then((q) => alive && (setQueue(q?.queue ?? []), setFailed(false)))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [nowPlaying?.trackId, queueVersion]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <motion.div
      className="up-next"
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
      role="dialog"
      aria-label="Up next"
    >
      <div className="up-next-head">
        <span className="eyebrow">Up next</span>
        <button className="text-btn" onClick={onClose}>
          Close
        </button>
      </div>
      {failed ? (
        <p className="up-next-empty">Couldn’t load the queue right now.</p>
      ) : !queue ? (
        <p className="up-next-empty">Loading…</p>
      ) : queue.length === 0 ? (
        <p className="up-next-empty">Nothing queued. Add songs from any album’s track list.</p>
      ) : (
        <ol className="up-next-list">
          {queue.slice(0, SHOWN).map((t, i) => {
            const img = [...t.album.images].sort((a, b) => (a.width ?? 0) - (b.width ?? 0))[0]?.url;
            return (
              <li key={`${t.id}-${i}`}>
                {img ? <img src={img} alt="" /> : <span className="up-next-thumb" />}
                <span className="up-next-text">
                  <span className="up-next-title">{t.name}</span>
                  <span className="up-next-sub">
                    {t.artists.map((a) => a.name).join(', ')} · {t.album.name}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
      <p className="up-next-note">Reorder or remove songs in the Spotify app.</p>
    </motion.div>
  );
}
