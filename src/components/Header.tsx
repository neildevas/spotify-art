import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import type { User } from '../spotify/types';

export type View = 'collection' | 'likes' | 'artists' | 'albums' | 'tracks' | 'search';

type Props = {
  view: View;
  onView: (v: View) => void;
  tileSize: number;
  onTileSize: (n: number) => void;
  user: User | null;
  onLogout: () => void;
  /** Open Liked songs (a Spotify extra, kept out of the main tabs). */
  onLikedSongs: () => void;
};

const TABS: { id: View; label: string }[] = [
  { id: 'collection', label: 'Collection' },
  { id: 'search', label: 'Search' },
];

export function Header({ view, onView, tileSize, onTileSize, user, onLogout, onLikedSongs }: Props) {
  return (
    <header className="header">
      <span className="wordmark wordmark-sm">Sleeve</span>

      <Segmented value={view} options={TABS} onChange={onView} groupId="view" />

      <div className="header-right">
        <label className="density" title="Size">
            <input
              type="range"
              min={90}
              max={340}
              value={tileSize}
              onChange={(e) => onTileSize(Number(e.target.value))}
              aria-label="Size"
            />
          </label>
        {user && <ProfileMenu user={user} onLikedSongs={onLikedSongs} onLogout={onLogout} />}
      </div>
    </header>
  );
}

/** Avatar button with a small menu: the extras that don't need a place in the main tabs. */
function ProfileMenu({ user, onLikedSongs, onLogout }: { user: User; onLikedSongs: () => void; onLogout: () => void }) {
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

  const name = user.display_name ?? user.id;
  const pick = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  return (
    <div className="profile" ref={ref}>
      <button className="avatar" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} title={name}>
        {user.images[0] ? <img src={user.images[0].url} alt="" /> : (user.display_name ?? '?')[0]}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="profile-menu"
            role="menu"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16 }}
          >
            <span className="profile-name">{name}</span>
            <button role="menuitem" onClick={pick(onLikedSongs)}>
              Liked songs
            </button>
            <button role="menuitem" onClick={pick(onLogout)}>
              Sign out
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Pill-style segmented control whose highlight glides between options. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  groupId,
  small,
}: {
  value: T;
  options: { id: T; label: string; aria?: string }[];
  onChange: (v: T) => void;
  groupId: string;
  small?: boolean;
}) {
  return (
    <div className={`segmented ${small ? 'segmented-sm' : ''}`} role="tablist">
      {options.map((o) => (
        <button
          key={o.id}
          role="tab"
          aria-selected={value === o.id}
          aria-label={o.aria}
          className={value === o.id ? 'active' : ''}
          onClick={() => onChange(o.id)}
        >
          {value === o.id && (
            <motion.span
              layoutId={`seg-${groupId}`}
              className="segmented-pill"
              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            />
          )}
          <span className="segmented-label">{o.label}</span>
        </button>
      ))}
    </div>
  );
}
