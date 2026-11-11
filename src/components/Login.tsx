import { motion } from 'framer-motion';
import { useMemo } from 'react';
import { isConfigured, login } from '../spotify/auth';

const COLUMNS = 7;
const PER_COLUMN = 8;

/** Drifting columns of colour-field "sleeves" — a stand-in wall until we have their real art. */
function DriftWall() {
  const columns = useMemo(
    () =>
      Array.from({ length: COLUMNS }, (_, c) =>
        Array.from({ length: PER_COLUMN }, (_, i) => {
          const h = (c * 47 + i * 83) % 360;
          const h2 = (h + 40 + ((i * 29) % 80)) % 360;
          const angle = (c * 61 + i * 37) % 360;
          return `linear-gradient(${angle}deg, hsl(${h} 70% 55%), hsl(${h2} 65% 25%))`;
        }),
      ),
    [],
  );

  return (
    <div className="drift" aria-hidden>
      {columns.map((tiles, c) => (
        <div
          key={c}
          className="drift-col"
          style={{ animationDuration: `${60 + c * 9}s`, animationDirection: c % 2 ? 'reverse' : 'normal' }}
        >
          {[...tiles, ...tiles].map((bg, i) => (
            <div key={i} className="drift-tile" style={{ background: bg }} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function Login({ error }: { error?: string | null }) {
  return (
    <div className="login">
      <DriftWall />
      <div className="login-vignette" />
      <motion.div
        className="login-card"
        initial={{ opacity: 0, y: 24, filter: 'blur(8px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
      >
        <h1 className="wordmark">Sleeve</h1>
        <p className="tagline">Your record collection, as a wall of art.</p>

        {isConfigured ? (
          <motion.button
            className="btn-spotify"
            onClick={() => login()}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
          >
            <SpotifyGlyph /> Connect with Spotify
          </motion.button>
        ) : (
          <p className="setup-hint">
            Add your Spotify Client ID to <code>.env.local</code> as <code>VITE_SPOTIFY_CLIENT_ID</code>, then restart
            the dev server.
          </p>
        )}
        {error && <p className="login-error">{error}</p>}
      </motion.div>
    </div>
  );
}

function SpotifyGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="12" fill="currentColor" opacity="0.15" />
      <path
        d="M6.5 9.3c3.7-1.1 8.1-.8 11.3 1.1M7.2 12.4c3-.8 6.6-.5 9.2 1M7.9 15.3c2.4-.6 5-.4 7.1.8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
