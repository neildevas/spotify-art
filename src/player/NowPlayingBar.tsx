import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
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
              <AfterRecordSlot lastSong={nowPlaying.fromAlbum && nowPlaying.isLast} onOpenAlbum={onOpenAlbum} />
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

/** The player's slot for what to put on next: your on-deck record, or a suggestion from your crate. */
function AfterRecordSlot({
  lastSong,
  onOpenAlbum,
}: {
  lastSong: boolean;
  onOpenAlbum?: (albumId: string, trackId: string | null) => void;
}) {
  const { playAlbum } = usePlayer();
  const { onDeck, setOnDeck, cratePick, reroll } = useAfterRecord();
  const shown = onDeck ?? cratePick;
  if (!shown) return null;
  const label = onDeck ? (lastSong ? 'Up next' : 'On deck') : 'From your crate';

  return (
    <>
      <span className="np-divider" aria-hidden />
      <div className="np-after">
        <button className="np-after-record" onClick={() => onOpenAlbum?.(shown.id, null)} title={`Open ${shown.name}`}>
          {shown.thumb ? <img src={shown.thumb} alt="" /> : <span className="np-after-cover" />}
          <span className="np-after-text">
            <span className={`np-after-label ${onDeck && lastSong ? 'is-soon' : ''}`}>{label}</span>
            <span className="np-after-title">{shown.name}</span>
          </span>
        </button>
        <button className="np-after-btn np-after-play" onClick={() => playAlbum(shown.id, 0)} title={`Play ${shown.name} now`} aria-label={`Play ${shown.name} now`}>
          ▶
        </button>
        {onDeck ? (
          <button className="np-after-btn" onClick={() => setOnDeck(null)} title="Take off deck" aria-label="Take off deck">
            ×
          </button>
        ) : (
          <button className="np-after-btn" onClick={reroll} title="Suggest another record" aria-label="Suggest another record">
            ↻
          </button>
        )}
      </div>
    </>
  );
}
