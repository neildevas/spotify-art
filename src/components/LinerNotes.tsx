import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { type SavedArtist, savedArtists } from '../collection/store';

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
