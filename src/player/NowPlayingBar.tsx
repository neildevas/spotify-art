import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { login } from '../spotify/auth';
import { useAfterRecord } from './AfterRecord';
import { usePlayer } from './PlayerContext';

const fmt = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Position that keeps ticking between SDK updates while playing. */
function useLivePosition(position: number, measuredAt: number, paused: boolean, duration: number) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(id);
  }, [paused]);
  return paused ? position : Math.min(duration, position + (Date.now() - measuredAt));
}

/** Floating player bar; appears once something has played and stays across tabs. */
export function NowPlayingBar({ onOpenAlbum }: { onOpenAlbum?: (albumId: string, trackId: string | null) => void }) {
  const { nowPlaying, error, dismissError, notice, toggle, next, previous, seek, volume, setVolume, status } = usePlayer();

  return (
    <>
      <AnimatePresence>
        {error && (
          <motion.div
            className="player-toast"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            onClick={dismissError}
          >
            {error}
            {error.includes('signing in') && (
              <button className="text-btn" onClick={() => login()}>
                Sign in again
              </button>
            )}
          </motion.div>
        )}
        {!error && notice && (
          <motion.div
            key="notice"
            className="player-toast is-info"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            role="status"
          >
            {notice}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {(nowPlaying || status === 'connecting') && (
          <motion.div
            className="now-playing"
            initial={{ opacity: 0, y: 40, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          >
            {nowPlaying ? (
              <Bar
                np={nowPlaying}
                onToggle={toggle}
                onNext={next}
                onPrev={previous}
                onSeek={seek}
                volume={volume}
                onVolume={setVolume}
                onOpen={
                  onOpenAlbum && nowPlaying.albumId ? () => onOpenAlbum(nowPlaying.albumId!, nowPlaying.trackId) : undefined
                }
              />
            ) : null}
            {nowPlaying ? (
              <SuggestButton onOpenAlbum={onOpenAlbum} />
            ) : (
              <span className="np-connecting">Connecting to Spotify…</span>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function Bar({
  np,
  onToggle,
  onNext,
  onPrev,
  onSeek,
  volume,
  onVolume,
  onOpen,
}: {
  np: NonNullable<ReturnType<typeof usePlayer>['nowPlaying']>;
  onToggle: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSeek: (ms: number) => void;
  volume: number;
  onVolume: (v: number) => void;
  /** Open the playing album's detail view. */
  onOpen?: () => void;
}) {
  const pos = useLivePosition(np.position, np.measuredAt, np.paused, np.duration);
  const pct = np.duration ? (pos / np.duration) * 100 : 0;

  return (
    <>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.img
          key={np.image}
          className={`np-art${onOpen ? ' np-link' : ''}`}
          src={np.image}
          onClick={onOpen}
          title={onOpen ? `Open ${np.albumName}` : undefined}
          alt=""
          initial={{ opacity: 0, scale: 0.8, rotate: -8 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          exit={{ opacity: 0, scale: 0.8 }}
        />
      </AnimatePresence>
      <div className="np-text">
        {onOpen ? (
          <button className="np-title np-link" onClick={onOpen} title={`Open ${np.albumName}`}>
            {np.trackName}
          </button>
        ) : (
          <span className="np-title">{np.trackName}</span>
        )}
        <span className="np-sub">
          {np.artists} · {np.albumName}
        </span>
      </div>

      <div className="np-controls">
        <button className="np-btn" onClick={onPrev} aria-label="Previous track">
          ⏮
        </button>
        <button className="np-btn np-play" onClick={onToggle} aria-label={np.paused ? 'Play' : 'Pause'}>
          {np.paused ? '▶' : '❚❚'}
        </button>
        <button className="np-btn" onClick={onNext} aria-label="Next track">
          ⏭
        </button>
      </div>

      <div className="np-progress">
        <span className="np-time">{fmt(pos)}</span>
        <input
          type="range"
          min={0}
          max={np.duration || 1}
          value={pos}
          onChange={(e) => onSeek(Number(e.target.value))}
          style={{ '--pct': `${pct}%` } as React.CSSProperties}
          aria-label="Seek"
        />
        <span className="np-time">{fmt(np.duration)}</span>
      </div>

      <label className="np-volume" title="Volume">
        <span aria-hidden>🔈</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => onVolume(Number(e.target.value))}
          style={{ '--pct': `${volume * 100}%` } as React.CSSProperties}
          aria-label="Volume"
        />
      </label>
    </>
  );
}

const SparkIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6" />
  </svg>
);

/**
 * "Suggest": a button in the player that opens a small panel with one record from your collection
 * (favouring ones you haven't played in a while). Play now starts it straight away; nothing is
 * queued, so after a record ends Spotify carries on as usual.
 */
function SuggestButton({ onOpenAlbum }: { onOpenAlbum?: (albumId: string, trackId: string | null) => void }) {
  const { playAlbum } = usePlayer();
  const { cratePick: pick, reroll } = useAfterRecord();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="np-suggest" ref={ref}>
      <button
        className={`np-suggest-btn ${open ? 'is-on' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Suggest a record from your collection"
      >
        <SparkIcon />
        <span className="np-suggest-label">Suggest</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="suggest-panel"
            role="dialog"
            aria-label="Suggested next"
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.18 }}
          >
            <div className="suggest-head">
              <span className="eyebrow">Suggested next</span>
              <span className="suggest-from">from your collection</span>
            </div>
            {pick ? (
              <>
                <button
                  className="suggest-record"
                  onClick={() => {
                    setOpen(false);
                    onOpenAlbum?.(pick.id, null);
                  }}
                  title={`Open ${pick.name}`}
                >
                  {pick.thumb ? <img src={pick.thumb} alt="" /> : <span className="suggest-cover" />}
                  <span className="suggest-text">
                    <span className="suggest-title">{pick.name}</span>
                    <span className="suggest-sub">
                      {pick.artists.map((a) => a.name).join(', ')}
                      {pick.year ? ` · ${pick.year}` : ''}
                    </span>
                  </span>
                </button>
                <div className="suggest-actions">
                  <button
                    className="np-play-now"
                    onClick={() => {
                      setOpen(false);
                      playAlbum(pick.id, 0);
                    }}
                  >
                    ▶ Play now
                  </button>
                  <button className="btn-ghost btn-small" onClick={reroll}>
                    ↻ Another
                  </button>
                </div>
              </>
            ) : (
              <p className="suggest-empty">Add a few more records to your collection to get suggestions.</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
