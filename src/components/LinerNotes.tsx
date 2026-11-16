import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { type SavedArtist, savedArtists } from '../collection/store';
import { pinnedToItem } from '../spotify/api';
import type { ArtItem, RecordInfo } from '../spotify/types';
import { PinIcon } from './ArtTile';
import { PlayButton } from '../player/PlayButton';

/** Your own words about the artist, only on their page. Click to write; saves when you click away. */
export function LinerNotes({ artist }: { artist: SavedArtist }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(artist.note ?? '');
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => setText(artist.note ?? ''), [artist.id, artist.note]);

  // Grow with the text instead of scrolling.
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
  }, [text, editing]);

  const save = () => {
    const note = text.trim();
    savedArtists.update(artist.id, { note: note || undefined });
    setEditing(false);
  };

  return (
    <section className="liner">
      <div className="liner-label">
        <span className="eyebrow">Liner notes</span>
        <span className="liner-hint">
          {editing ? 'Saves when you click away · Esc to cancel' : 'Your own words, only on this page.'}
        </span>
      </div>
      {editing ? (
        <textarea
          ref={area}
          className="liner-text liner-input"
          value={text}
          autoFocus
          placeholder="Why does this artist matter to you? When did you first hear them, and which record do you put on first?"
          onChange={(e) => setText(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation(); // cancel the edit, don't also leave the artist page
              setText(artist.note ?? '');
              setEditing(false);
            }
          }}
        />
      ) : (
        <button className={`liner-text ${artist.note ? '' : 'is-empty'}`} onClick={() => setEditing(true)}>
          {artist.note ||
            '“Why does this artist matter to you? When did you first hear them, and which record do you put on first?”'}
        </button>
      )}
    </section>
  );
}

/**
 * Pinned records, big and numbered: your personal ranking of this artist's work.
 * Drag to reorder (or use the arrows on hover); unpin from the card or the discography.
 */
export function TopShelf({ artist, onSelect }: { artist: SavedArtist; onSelect: (item: ArtItem) => void }) {
  const pinned = artist.pinned ?? [];
  const [draft, setDraftState] = useState<RecordInfo[] | null>(null);
  const draftRef = useRef<RecordInfo[] | null>(null);
  const dragId = useRef<string | null>(null);
  const lastSwap = useRef(0);
  const shown = draft ?? pinned;

  const setDraft = (next: RecordInfo[] | null) => {
    draftRef.current = next;
    setDraftState(next);
  };
  const save = (list: RecordInfo[]) => savedArtists.update(artist.id, { pinned: list });
  const move = (from: number, to: number, list = pinned) => {
    if (to < 0 || to >= list.length) return list;
    const next = [...list];
    const [r] = next.splice(from, 1);
    next.splice(to, 0, r);
    return next;
  };

  return (
    <section className="shelf">
      <div className="section-head">
        <h2>
          Top shelf <span className="count">{pinned.length ? `${pinned.length} pinned · drag to reorder` : ''}</span>
        </h2>
      </div>

      {pinned.length === 0 ? (
        <div className="shelf-empty">
          {[1, 2, 3].map((n) => (
            <div key={n} className="shelf-slot">
              <span>{n}</span>
            </div>
          ))}
          <p>
            Pin records from the discography below <PinIcon size={13} /> — they’ll sit here, big and numbered, in your
            order.
          </p>
        </div>
      ) : (
        <ul className="shelf-grid">
          <AnimatePresence initial={false}>
            {shown.map((r, i) => {
              const item = pinnedToItem(r, i + 1);
              return (
                <motion.li
                  key={r.id}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: dragId.current === r.id && draft ? 0.4 : 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.2 } }}
                  transition={{ type: 'spring', stiffness: 380, damping: 34 }}
                  className="shelf-item"
                  draggable
                  onDragStartCapture={(e: React.DragEvent) => {
                    dragId.current = r.id;
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', r.id);
                    setDraft(pinned);
                  }}
                  onDragEnterCapture={() => {
                    const id = dragId.current;
                    const cur = draftRef.current;
                    if (!id || !cur || id === r.id || Date.now() - lastSwap.current < 160) return;
                    lastSwap.current = Date.now();
                    setDraft(move(cur.findIndex((x) => x.id === id), cur.findIndex((x) => x.id === r.id), cur));
                  }}
                  onDragOverCapture={(e: React.DragEvent) => e.preventDefault()}
                  onDragEndCapture={() => {
                    if (draftRef.current) save(draftRef.current);
                    setDraft(null);
                    dragId.current = null;
                  }}
                >
                  <button className="shelf-art" onClick={() => onSelect(item)} aria-label={`Open ${r.name}`}>
                    <motion.div className="shelf-cover" layoutId={item.key} transition={{ type: 'spring', stiffness: 300, damping: 32 }}>
                      <img src={r.image} alt="" draggable={false} />
                    </motion.div>
                    <span className="shelf-rank">{i + 1}</span>
                    <PlayButton albumId={r.id} />
                  </button>
                  <div className="shelf-tools">
                    <button onClick={() => save(move(i, i - 1))} disabled={i === 0} aria-label="Move left">
                      ←
                    </button>
                    <button onClick={() => save(move(i, i + 1))} disabled={i === shown.length - 1} aria-label="Move right">
                      →
                    </button>
                    <button onClick={() => savedArtists.togglePin(artist.id, r)} aria-label={`Unpin ${r.name}`}>
                      Unpin
                    </button>
                  </div>
                  <div className="shelf-caption">
                    <span className="shelf-title">{r.name}</span>
                    <span className="shelf-meta">
                      {r.type === 'album' ? 'Album' : r.type === 'single' ? 'Single / EP' : 'Compilation'} · {r.year}
                    </span>
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
    </section>
  );
}
