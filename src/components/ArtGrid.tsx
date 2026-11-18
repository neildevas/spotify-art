import type { ArtItem } from '../spotify/types';
import { ArtTile } from './ArtTile';
import { useLayoutMode } from './LayoutMode';
import { SingleView } from './SingleView';

type Props = {
  items: ArtItem[];
  loading: boolean;
  tileSize: number;
  onSelect: (item: ArtItem) => void;
  /** Always show titles under the art (e.g. songs, where the cover alone is ambiguous). */
  captions?: boolean;
  /** Number of placeholder tiles while loading. */
  skeletons?: number;
  /** Set false where one-at-a-time doesn't make sense (e.g. the mixed "All" search sections). */
  allowSingle?: boolean;
  /** Artist discography: a quick + / ✓ on each tile to add the record to (or take it out of) your collection. */
  collectToggle?: boolean;
  /** Collection page: offer "+ Collect artist" on records whose artist isn't collected yet. */
  collectedArtistIds?: Set<string>;
  onCollectArtist?: (artist: { id: string; name: string }) => void;
};

export function ArtGrid({
  items,
  loading,
  tileSize,
  onSelect,
  captions,
  skeletons = 24,
  allowSingle = true,
  collectToggle,
  collectedArtistIds,
  onCollectArtist,
}: Props) {
  const { mode } = useLayoutMode();
  if (mode === 'single' && allowSingle) return <SingleView items={items} loading={loading} onSelect={onSelect} />;

  const cls = captions ? 'grid grid-captions' : 'grid';
  // Columns stretch past --tile (minmax(tile, 1fr)), so tell the browser a bit more than tileSize.
  // It multiplies by the screen's pixel density and picks the 300px or 640px cover accordingly.
  const tileWidth = Math.round(tileSize * 1.4);
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
        <ArtTile
          key={item.key}
          item={item}
          index={i}
          onSelect={onSelect}
          tileWidth={tileWidth}
          collectToggle={collectToggle}
          onCollectArtist={
            onCollectArtist && item.artists?.[0] && !collectedArtistIds?.has(item.artists[0].id) ? onCollectArtist : undefined
          }
        />
      ))}
    </ul>
  );
}
