import { motion } from 'framer-motion';
import type { User } from '../spotify/types';

export type View = 'collection' | 'albums' | 'tracks' | 'search';

type Props = {
  view: View;
  onView: (v: View) => void;
  tileSize: number;
  onTileSize: (n: number) => void;
  user: User | null;
  onLogout: () => void;
};

const TABS: { id: View; label: string }[] = [
  { id: 'collection', label: 'Collection' },
  { id: 'albums', label: 'Saved albums' },
  { id: 'tracks', label: 'Top tracks' },
  { id: 'search', label: 'Search' },
];

export function Header({ view, onView, tileSize, onTileSize, user, onLogout }: Props) {
  return (
    <header className="header">
      <span className="wordmark wordmark-sm">Sleeve</span>

      <Segmented value={view} options={TABS} onChange={onView} groupId="view" />

      <div className="header-right">
        <label className="density" title="Tile size">
          <span aria-hidden>▦</span>
          <input
            type="range"
            min={90}
            max={340}
            value={tileSize}
            onChange={(e) => onTileSize(Number(e.target.value))}
            aria-label="Tile size"
          />
        </label>
        {user && (
          <button className="avatar" onClick={onLogout} title={`Signed in as ${user.display_name ?? user.id} — sign out`}>
            {user.images[0] ? <img src={user.images[0].url} alt="" /> : (user.display_name ?? '?')[0]}
          </button>
        )}
      </div>
    </header>
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
  options: { id: T; label: string }[];
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
