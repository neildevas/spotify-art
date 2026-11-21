import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { login } from '../spotify/auth';
import type { RecordInfo } from '../spotify/types';
import { SAVE_COPY, useAfterRecord } from './AfterRecord';
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
 * "Next?": a button in the player that opens "What's next?": the record you saved for next (if any)
 * and a suggestion from your collection. Neither plays by itself; Play now starts one straight away.
 */
function SuggestButton({ onOpenAlbum }: { onOpenAlbum?: (albumId: string, trackId: string | null) => void }) {
  const { playAlbum, notify } = usePlayer();
  const { saved, setSaved, cratePick: pick, reroll } = useAfterRecord();
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

  const play = (r: RecordInfo) => {
    setOpen(false);
    playAlbum(r.id, 0);
  };
  const openRecord = (r: RecordInfo) => {
    setOpen(false);
    onOpenAlbum?.(r.id, null);
  };

  return (
    <div className="np-suggest" ref={ref}>
      <button
        className={`np-suggest-btn ${open ? 'is-on' : ''} ${saved ? 'has-saved' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={saved ? `${SAVE_COPY.saved}: ${saved.name}` : 'What’s next? A suggestion from your collection'}
      >
        {saved?.thumb ? <img className="np-suggest-thumb" src={saved.thumb} alt="" /> : <SparkIcon />}
        <span className="np-suggest-label">Next?</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="suggest-panel"
            role="dialog"
            aria-label="What’s next?"
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.18 }}
          >
            <div className="suggest-head">
              <span className="eyebrow">What’s next?</span>
              <span className="suggest-from">nothing plays by itself</span>
            </div>

            {saved && (
              <section className="suggest-section">
                <span className="suggest-kind">{SAVE_COPY.saved}</span>
                <SuggestRecord record={saved} onOpen={() => openRecord(saved)} />
                <div className="suggest-actions">
                  <button className="np-play-now" onClick={() => play(saved)}>
                    ▶ Play now
                  </button>
                  <button
                    className="btn-ghost btn-small"
                    onClick={() => {
                      setSaved(null);
                      notify(SAVE_COPY.removed(saved.name));
                    }}
                  >
                    {SAVE_COPY.remove}
                  </button>
                </div>
              </section>
            )}

            <section className="suggest-section">
              <span className="suggest-kind">Suggested · from your collection</span>
              {pick ? (
                <>
                  <SuggestRecord record={pick} onOpen={() => openRecord(pick)} />
                  <div className="suggest-actions">
                    <button className="np-play-now" onClick={() => play(pick)}>
                      ▶ Play now
                    </button>
                    <button
                      className="btn-ghost btn-small"
                      onClick={() => {
                        notify(saved ? SAVE_COPY.replaced(pick.name, saved.name) : SAVE_COPY.toast(pick.name));
                        setSaved(pick);
                        reroll();
                      }}
                    >
                      {SAVE_COPY.action}
                    </button>
                    <button className="btn-ghost btn-small btn-icon" onClick={reroll} title="Suggest another" aria-label="Suggest another">
                      ↻
                    </button>
                  </div>
                </>
              ) : (
                <p className="suggest-empty">Add a few more records to your collection to get suggestions.</p>
              )}
            </section>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SuggestRecord({ record, onOpen }: { record: RecordInfo; onOpen: () => void }) {
  return (
    <button className="suggest-record" onClick={onOpen} title={`Open ${record.name}`}>
      {record.thumb ? <img src={record.thumb} alt="" /> : <span className="suggest-cover" />}
      <span className="suggest-text">
        <span className="suggest-title">{record.name}</span>
        <span className="suggest-sub">
          {record.artists.map((a) => a.name).join(', ')}
          {record.year ? ` · ${record.year}` : ''}
        </span>
      </span>
    </button>
  );
}
