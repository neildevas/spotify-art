import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { savedArtists, useIsArtistSaved } from '../collection/store';
import type { Artist } from '../spotify/types';

/** Save / unsave an artist page to the Collection's Artists shelf. Same feel as Add to collection. */
export function SaveArtistButton({ artist }: { artist: Artist }) {
  const saved = useIsArtistSaved(artist.id);
  // Right after saving, the cursor is still on the button — don't flip straight to "Remove".
  const [fresh, setFresh] = useState(false);

  return (
    <motion.button
      className={`btn-collect ${saved ? 'is-in' : ''} ${fresh ? 'fresh' : ''}`}
      onClick={() => {
        setFresh(!saved);
        savedArtists.toggle(artist);
      }}
      onMouseLeave={() => setFresh(false)}
      whileTap={{ scale: 0.95 }}
      layout
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      title={saved ? 'Remove from your saved artists' : 'Keep this artist in your Collection'}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={saved ? 'in' : 'out'}
          className="btn-collect-label"
          initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: -8, filter: 'blur(4px)' }}
          transition={{ duration: 0.25 }}
        >
          {saved ? (
            <>
              <span className="when-idle">✓ Saved artist</span>
              <span className="when-hover">Remove</span>
            </>
          ) : (
            <>+ Save artist</>
          )}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
}
