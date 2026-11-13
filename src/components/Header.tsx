import { motion } from 'framer-motion';
import type { User } from '../spotify/types';
import type { LayoutMode } from './LayoutMode';

export type View = 'collection' | 'albums' | 'tracks' | 'search';

type Props = {
  view: View;
  onView: (v: View) => void;
  tileSize: number;
  onTileSize: (n: number) => void;
  layout: LayoutMode;
  onLayout: (l: LayoutMode) => void;
  user: User | null;
  onLogout: () => void;
};

const TABS: { id: View; label: string }[] = [
  { id: 'collection', label: 'Collection' },
  // { id: 'tracks', label: 'Top tracks' },
  { id: 'search', label: 'Search' },
];

const LAYOUTS: { id: LayoutMode; label: string; aria: string }[] = [
  { id: 'grid', label: '▦', aria: 'Grid' },
  { id: 'single', label: '▢', aria: 'One at a time' },
];

export function Header({ view, onView, tileSize, onTileSize, layout, onLayout, user, onLogout }: Props) {
  return (
    <header className="header">
      <span className="wordmark wordmark-sm">Sleeve</span>

      <Segmented value={view} options={TABS} onChange={onView} groupId="view" />

      <div className="header-right">
        <div className="layout-toggle" title="Grid or one record at a time">
          <Segmented small groupId="layout" value={layout} options={LAYOUTS} onChange={onLayout} />
        </div>
        {layout === 'grid' && (
          <label className="density" title="Tile size">
            <input
              type="range"
              min={90}
              max={340}
              value={tileSize}
              onChange={(e) => onTileSize(Number(e.target.value))}
              aria-label="Tile size"
            />
          </label>
        )}
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
