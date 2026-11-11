import type { ArtItem } from '../spotify/types';
import { ArtTile } from './ArtTile';

type Props = {
  items: ArtItem[];
  loading: boolean;
  tileSize: number;
  onSelect: (item: ArtItem) => void;
  /** Always show titles under the art (e.g. songs, where the cover alone is ambiguous). */
  captions?: boolean;
  /** Number of placeholder tiles while loading. */
  skeletons?: number;
};

export function ArtGrid({ items, loading, tileSize, onSelect, captions, skeletons = 24 }: Props) {
  const cls = captions ? 'grid grid-captions' : 'grid';
  const style = { '--tile': `${tileSize}px` } as React.CSSProperties;

  if (loading && items.length === 0) {
    return (
      <ul className={cls} style={style} aria-busy>
        {Array.from({ length: skeletons }, (_, i) => (
          <li key={i} className="tile skeleton" style={{ animationDelay: `${i * 40}ms` }} />
        ))}
      </ul>
    );
  }

  return (
    <ul className={cls} style={style}>
      {items.map((item, i) => (
        <ArtTile key={item.key} item={item} index={i} onSelect={onSelect} />
      ))}
    </ul>
  );
}
