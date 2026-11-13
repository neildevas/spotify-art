import { motion } from 'framer-motion';
import { login } from '../spotify/auth';
import { usePlayer } from './PlayerContext';

/** Round play/pause button for a record. Shows animated bars while this album is playing. */
export function PlayButton({ albumId, variant = 'tile' }: { albumId: string; variant?: 'tile' | 'large' }) {
  const { playAlbum, nowPlaying, needsReconnect } = usePlayer();
  const isCurrent = nowPlaying?.albumId === albumId;
  const playing = isCurrent && !nowPlaying?.paused;

  if (needsReconnect) {
    return variant === 'large' ? (
      <button
        className="btn-ghost"
        onClick={(e) => {
          e.stopPropagation();
          login();
        }}
        title="Sleeve needs a bit more access from Spotify to play music"
      >
        Reconnect Spotify to play
      </button>
    ) : null;
  }

  return (
    <motion.span
      role="button"
      tabIndex={0}
      className={`play-btn play-btn-${variant} ${isCurrent ? 'is-current' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        playAlbum(albumId);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          playAlbum(albumId);
        }
      }}
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.92 }}
      aria-label={playing ? 'Pause' : 'Play'}
    >
      {playing ? (
        <span className="eq" aria-hidden>
          <i />
          <i />
          <i />
        </span>
      ) : (
        <span className="play-glyph" aria-hidden>
          ▶
        </span>
      )}
      {variant === 'large' && <span className="play-label">{playing ? 'Pause' : isCurrent ? 'Resume' : 'Play'}</span>}
    </motion.span>
  );
}
