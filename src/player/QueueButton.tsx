import { usePlayer } from './PlayerContext';

/** Three lines with a plus: the usual "add to queue" mark. */
export function QueueIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M4 6h12M4 12h9M4 18h7" />
      <path d="M18 14v6M15 17h6" />
    </svg>
  );
}

/** Small round "Add to queue" button for a song row. Hidden until the row is hovered (see CSS). */
export function AddToQueueButton({ trackId, title, className = '' }: { trackId: string; title: string; className?: string }) {
  const { queueTrack, needsReconnect } = usePlayer();
  if (needsReconnect) return null;
  return (
    <button
      className={`queue-add ${className}`}
      title="Add to queue"
      aria-label={`Add ${title} to the queue`}
      onClick={(e) => {
        e.stopPropagation();
        queueTrack(trackId, title);
      }}
    >
      <QueueIcon size={15} />
    </button>
  );
}
