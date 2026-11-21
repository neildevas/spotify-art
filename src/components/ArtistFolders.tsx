import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { useSavedArtists } from '../collection/store';
import { RateLimitError, getArtist, pickImageSet } from '../spotify/api';
import type { ArtItem } from '../spotify/types';
import { ArtGrid } from './ArtGrid';

const ease = [0.22, 1, 0.36, 1] as const;
const spring = { type: 'spring', stiffness: 320, damping: 34 } as const;

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

// --- artist photos: saved artists have one; everyone else is looked up once and remembered ---

const PHOTOS_KEY = 'sleeve.artistPhotos';
function loadPhotos(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(PHOTOS_KEY) ?? '{}') ?? {};
  } catch {
    return {};
  }
}
let photoCache = loadPhotos();
function remember(id: string, url: string) {
  photoCache = { ...photoCache, [id]: url };
  try {
    localStorage.setItem(PHOTOS_KEY, JSON.stringify(photoCache));
  } catch {
    /* fine: memory still has it */
  }
}

function useArtistPhotos(ids: string[]) {
  const saved = useSavedArtists();
  const [photos, setPhotos] = useState(photoCache);
  const fromSaved = useMemo(() => new Map(saved.filter((a) => a.image).map((a) => [a.id, a.image!])), [saved]);
  const missing = ids.filter((id) => !id.startsWith('name:') && !fromSaved.has(id) && photos[id] === undefined);
  const key = missing.join();

  useEffect(() => {
    if (!missing.length) return;
    let cancelled = false;
    (async () => {
      for (const id of missing) {
        if (cancelled) return;
        try {
          const full = await getArtist(id);
          const { thumb, image } = pickImageSet(full.images);
          remember(id, image || thumb || '');
          if (!cancelled) setPhotos(photoCache);
        } catch (e) {
          if (e instanceof RateLimitError) return; // try again another time
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (id: string) => fromSaved.get(id) || photos[id] || '';
}

type Props = {
  items: ArtItem[];
  tileSize: number;
  onSelect: (item: ArtItem) => void;
  onOpenArtist: (a: { id: string; name: string }) => void;
};

/** "By artist": each artist is a folder with their photo on the front and their records tucked behind it. */
export function ArtistFolders({ items, tileSize, onSelect, onOpenArtist }: Props) {
  const folders = useMemo(() => toFolders(items), [items]);
  const photo = useArtistPhotos(folders.map((f) => f.id));
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
        {folders.map((f, i) => {
          const src = photo(f.id);
          const peeks = f.items.slice(0, Math.min(f.items.length - 1, 2));
          return (
            <motion.li
              key={f.id}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease, delay: Math.min(i, 15) * 0.03 }}
            >
              <button className="folder" onClick={() => setOpenId(f.id)} aria-label={`${f.name}, ${count(f.items.length)}`}>
                <span className="folder-stack">
                  {peeks.map((r, k) => (
                    <img key={r.key} className={`folder-peek folder-peek-${k + 1}`} src={r.thumb} alt="" loading="lazy" draggable={false} />
                  ))}
                  <motion.span className="folder-front" layoutId={`folder-${f.id}`} transition={spring}>
                    <FolderPhoto src={src} fallback={f.items[0]?.thumb} name={f.name} />
                    <span className="folder-name">{f.name}</span>
                  </motion.span>
                </span>
                <span className="folder-meta">{count(f.items.length)}</span>
              </button>
            </motion.li>
          );
        })}
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
                <motion.span className="folder-head-photo" layoutId={`folder-${open.id}`} transition={spring}>
                  <FolderPhoto src={photo(open.id)} fallback={open.items[0]?.thumb} name={open.name} />
                </motion.span>
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

function FolderPhoto({ src, fallback, name }: { src: string; fallback?: string; name: string }) {
  if (src) return <img src={src} alt="" loading="lazy" draggable={false} />;
  // No photo (yet): their first record, dimmed, with an initial.
  return (
    <>
      {fallback && <img className="folder-photo-fallback" src={fallback} alt="" draggable={false} />}
      <span className="folder-initial">{name[0]}</span>
    </>
  );
}
