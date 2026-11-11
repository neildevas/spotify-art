import type { ArtItem } from '../spotify/types';
import { ArtTile } from './ArtTile';

type Props = {
  items: ArtItem[];
  loading: boolean;
  tileSize: number;
  onSelect: (item: ArtItem) => void;
};

export function ArtGrid({ items, loading, tileSize, onSelect }: Props) {
  const style = { '--tile': `${tileSize}px` } as React.CSSProperties;

  if (loading && items.length === 0) {
    return (
      <ul className="grid" style={style} aria-busy>
        {Array.from({ length: 24 }, (_, i) => (
          <li key={i} className="tile skeleton" style={{ animationDelay: `${i * 40}ms` }} />
        ))}
      </ul>
    );
  }

  return (
    <ul className="grid" style={style}>
      {items.map((item, i) => (
        <ArtTile key={item.key} item={item} index={i} onSelect={onSelect} />
      ))}
    </ul>
  );
}
