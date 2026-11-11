import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { collection, useInCollection } from '../collection/store';
import type { RecordInfo } from '../spotify/types';

/** Add / remove a record from the local collection, with a little "pressed into the crate" moment. */
export function CollectButton({ record, isSong }: { record: RecordInfo; isSong?: boolean }) {
  const inCollection = useInCollection(record.id);
  // Right after adding, the cursor is still on the button — don't flip straight to "Remove".
  const [fresh, setFresh] = useState(false);
  const addLabel = isSong ? 'Add this record' : 'Add to collection';

  return (
    <motion.button
      className={`btn-collect ${inCollection ? 'is-in' : ''} ${fresh ? 'fresh' : ''}`}
      onClick={() => {
        setFresh(!inCollection);
        collection.toggle(record);
      }}
      onMouseLeave={() => setFresh(false)}
      whileTap={{ scale: 0.95 }}
      layout
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      title={inCollection ? 'Remove from your collection' : isSong ? `Adds “${record.name}” to your collection` : undefined}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={inCollection ? 'in' : 'out'}
          className="btn-collect-label"
          initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: -8, filter: 'blur(4px)' }}
          transition={{ duration: 0.25 }}
        >
          {inCollection ? (
            <>
              <span className="when-idle">✓ In your collection</span>
              <span className="when-hover">Remove</span>
            </>
          ) : (
            <>+ {addLabel}</>
          )}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
}
