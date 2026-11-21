import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import type { ArtItem } from '../spotify/types';
import { ArtGrid } from './ArtGrid';

const ease = [0.22, 1, 0.36, 1] as const;

type Folder = { id: string; name: string; items: ArtItem[] };

/** Records grouped by their (first) artist, in the order they arrive (already sorted by artist). */
function toFolders(items: ArtItem[]): Folder[] {
  const map = new Map<string, Folder>();
  for (const it of items) {
    const a = it.artists?.[0];
    const id = a?.id ?? `name:${it.subtitle}`;
    const f = map.get(id) ?? { id, name: a?.name ?? it.subtitle, items: [] };
    f.items.push(it);
    map.set(id, f);
  }
  return [...map.values()];
}

type Props = {
  items: ArtItem[];
  tileSize: number;
  onSelect: (item: ArtItem) => void;
  onOpenArtist: (a: { id: string; name: string }) => void;
};

/** "By artist": each artist's records gathered into an iOS-style folder you open to see them all. */
export function ArtistFolders({ items, tileSize, onSelect, onOpenArtist }: Props) {
  const folders = useMemo(() => toFolders(items), [items]);
  const [openId, setOpenId] = useState<string | null>(null);
  const open = folders.find((f) => f.id === openId) ?? null;

  // The folder closes if its records are filtered away.
  useEffect(() => {
    if (openId && !open) setOpenId(null);
  }, [openId, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      // The album view sits on top and handles Esc itself first.
      if (e.key === 'Escape' && !document.querySelector('.overlay')) setOpenId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const style = { '--tile': `${tileSize}px` } as React.CSSProperties;
  const count = (n: number) => `${n} record${n === 1 ? '' : 's'}`;

  return (
    <>
      <ul className="folders-grid" style={style}>
        {folders.map((f, i) => (
          <motion.li
            key={f.id}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease, delay: Math.min(i, 15) * 0.03 }}
          >
            <button className="folder" onClick={() => setOpenId(f.id)} aria-label={`${f.name}, ${count(f.items.length)}`}>
              <motion.span className="folder-art">
                {f.items.length === 1 ? (
                  // One record: just the record, like a lone app on the home screen.
                  <img className="folder-single" src={f.items[0].thumb} alt="" loading="lazy" draggable={false} />
                ) : (
                  <span className="folder-quad">
                    {f.items.slice(0, 4).map((r) => (
                      <img key={r.key} src={r.thumb} alt="" loading="lazy" draggable={false} />
                    ))}
                  </span>
                )}
              </motion.span>
              <span className="folder-caption">
                <span className="folder-name">{f.name}</span>
                <span className="folder-meta">{count(f.items.length)}</span>
              </span>
            </button>
          </motion.li>
        ))}
      </ul>

      <AnimatePresence>
        {open && (
          <motion.div
            key="folder"
            className="folder-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={() => setOpenId(null)}
          >
            <motion.div
              className="folder-panel"
              role="dialog"
              aria-label={open.name}
              initial={{ opacity: 0, scale: 0.94, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: 0.35, ease }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="folder-head">
                <div className="folder-head-text">
                  <h2>{open.name}</h2>
                  <span>{count(open.items.length)} in your collection</span>
                </div>
                {!open.id.startsWith('name:') && (
                  <button className="text-btn inline-link" onClick={() => onOpenArtist({ id: open.id, name: open.name })}>
                    Artist page →
                  </button>
                )}
                <button className="folder-close" onClick={() => setOpenId(null)} aria-label="Close">
                  ×
                </button>
              </div>
              <div className="folder-records">
                <ArtGrid items={open.items} loading={false} tileSize={Math.min(tileSize, 170)} onSelect={onSelect} captions allowSingle={false} />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
