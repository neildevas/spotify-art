import { Fragment, useRef, useState } from 'react';
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
  /** Sorted by artist: a quiet divider with the name before each artist's records, like a crate. */
  groupLabel?: (item: ArtItem) => string;
  /** Drag tiles to rearrange them; called with the new order when you let go. */
  onReorder?: (items: ArtItem[]) => void;
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
  groupLabel,
  onReorder,
}: Props) {
  // While dragging, show a draft order; the real order only changes when you let go.
  const [draft, setDraft] = useState<string[] | null>(null);
  const draftRef = useRef<string[] | null>(null);
  const dragKey = useRef<string | null>(null);
  const setDraftBoth = (d: string[] | null) => {
    draftRef.current = d;
    setDraft(d);
  };

  const { mode } = useLayoutMode();
  if (mode === 'single' && allowSingle) return <SingleView items={items} loading={loading} onSelect={onSelect} />;

  const cls = ['grid', captions && 'grid-captions', (groupLabel || onReorder) && 'grid-ordered', onReorder && 'grid-arrange']
    .filter(Boolean)
    .join(' ');
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

  const byKey = new Map(items.map((it) => [it.key, it]));
  const shown = draft ? draft.map((k) => byKey.get(k)!).filter(Boolean) : items;

  const reorder = onReorder && {
    start: (key: string) => {
      dragKey.current = key;
      setDraftBoth(items.map((it) => it.key));
    },
    // Hovering another tile: slot the dragged one in before or after it (whichever half you're over).
    over: (key: string, after: boolean) => {
      const from = dragKey.current;
      const cur = draftRef.current;
      if (!from || !cur || from === key) return;
      const without = cur.filter((k) => k !== from);
      const at = without.indexOf(key) + (after ? 1 : 0);
      const next = [...without.slice(0, at), from, ...without.slice(at)];
      if (next.join() !== cur.join()) setDraftBoth(next);
    },
    end: () => {
      const final = draftRef.current;
      dragKey.current = null;
      setDraftBoth(null);
      if (final && final.join() !== items.map((it) => it.key).join()) onReorder(final.map((k) => byKey.get(k)!).filter(Boolean));
    },
  };

  return (
    <ul className={cls} style={style}>
      {shown.map((item, i) => {
        const label = groupLabel?.(item);
        const newGroup = label !== undefined && (i === 0 || groupLabel!(shown[i - 1]) !== label);
        return (
          <Fragment key={item.key}>
            {newGroup && (
              <li className="grid-divider" aria-hidden={false}>
                <span className="grid-divider-name">{label}</span>
              </li>
            )}
            <ArtTile
              item={item}
              index={i}
              onSelect={onSelect}
              tileWidth={tileWidth}
              collectToggle={collectToggle}
              onCollectArtist={
                onCollectArtist && item.artists?.[0] && !collectedArtistIds?.has(item.artists[0].id) ? onCollectArtist : undefined
              }
              reorder={reorder || undefined}
              dragging={!!draft && dragKey.current === item.key}
            />
          </Fragment>
        );
      })}
    </ul>
  );
}
