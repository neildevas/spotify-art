import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { savedArtists, useSavedArtist } from '../collection/store';
import type { Artist } from '../spotify/types';

/** Save / unsave an artist page. Unsaving asks first when there are liner notes or pins to lose. */
export function SaveArtistButton({ artist }: { artist: Artist }) {
  const saved = useSavedArtist(artist.id);
  const isSaved = !!saved;
  // Right after saving, the cursor is still on the button — don't flip straight to "Remove".
  const [fresh, setFresh] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const pins = saved?.pinned?.length ?? 0;
  const hasNote = !!saved?.note;
  const wouldLose = [hasNote && 'your liner notes', pins > 0 && `your top shelf (${pins} pinned)`].filter(Boolean);

  const onClick = () => {
    if (isSaved && wouldLose.length) return setConfirming(true);
    setFresh(!isSaved);
    savedArtists.toggle(artist);
  };

  return (
    <span className="save-artist">
      <motion.button
        className={`btn-collect ${isSaved ? 'is-in' : ''} ${fresh ? 'fresh' : ''}`}
        onClick={onClick}
        onMouseLeave={() => setFresh(false)}
        whileTap={{ scale: 0.95 }}
        layout
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        title={isSaved ? 'Remove from your collection' : 'Add this artist'}
        aria-expanded={confirming}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={isSaved ? 'in' : 'out'}
            className="btn-collect-label"
            initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -8, filter: 'blur(4px)' }}
            transition={{ duration: 0.25 }}
          >
            {isSaved ? (
              <>
                <span className="when-idle">✓ In your collection</span>
                <span className="when-hover">Remove</span>
              </>
            ) : (
              <>+ Add artist</>
            )}
          </motion.span>
        </AnimatePresence>
      </motion.button>

      <AnimatePresence>
        {confirming && (
          <ConfirmUnsave
            name={artist.name}
            losing={wouldLose as string[]}
            onCancel={() => setConfirming(false)}
            onConfirm={() => {
              setConfirming(false);
              savedArtists.remove(artist.id);
            }}
          />
        )}
      </AnimatePresence>
    </span>
  );
}

function ConfirmUnsave({
  name,
  losing,
  onCancel,
  onConfirm,
}: {
  name: string;
  losing: string[];
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const keep = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    keep.current?.focus();
    // Capture phase so Esc closes this, not the whole artist page.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCancel();
      }
    };
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) onCancel();
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('mousedown', onDown);
    };
  }, [onCancel]);

  return (
    <motion.div
      ref={box}
      className="confirm-pop"
      role="alertdialog"
      aria-labelledby="unsave-title"
      initial={{ opacity: 0, y: -6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, transition: { duration: 0.15 } }}
      transition={{ type: 'spring', stiffness: 500, damping: 34 }}
    >
      <p id="unsave-title" className="confirm-title">
        Remove {name}?
      </p>
      <p className="confirm-body">
        This deletes {losing.join(' and ')} for this artist. It can’t be undone.
      </p>
      <div className="confirm-actions">
        <button ref={keep} className="btn-ghost" onClick={onCancel}>
          Keep artist
        </button>
        <button className="btn-danger" onClick={onConfirm}>
          Remove
        </button>
      </div>
    </motion.div>
  );
}
