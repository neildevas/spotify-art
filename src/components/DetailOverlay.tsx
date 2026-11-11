import { motion } from 'framer-motion';
import { useEffect } from 'react';
import { useDominantColor } from '../hooks/useDominantColor';
import { useTilt } from '../hooks/useTilt';
import type { ArtItem } from '../spotify/types';

type Props = {
  item: ArtItem;
  onClose: () => void;
  onStep: (dir: -1 | 1) => void;
};

const ease = [0.22, 1, 0.36, 1] as const;

export function DetailOverlay({ item, onClose, onStep }: Props) {
  const color = useDominantColor(item.thumb);
  // Same hover tilt + glare as the grid tiles, a little gentler at this size.
  const tilt = useTilt(6);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') onStep(1);
      if (e.key === 'ArrowLeft') onStep(-1);
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose, onStep]);

  return (
    <motion.div
      className="overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.25 } }}
      onClick={onClose}
      style={{ '--ambient': color ?? 'rgb(30,30,34)' } as React.CSSProperties}
    >
      {/* Huge blurred copy of the art as the room's light */}
      <motion.div
        key={item.image}
        className="overlay-bloom"
        style={{ backgroundImage: `url("${item.thumb}")` }}
        initial={{ opacity: 0, scale: 1.2 }}
        animate={{ opacity: 0.55, scale: 1 }}
        transition={{ duration: 1.2, ease }}
      />

      <div className="overlay-stage" onClick={(e) => e.stopPropagation()}>
        {/* Tilt lives on wrappers so it doesn't fight the shared-layout zoom on .overlay-art */}
        <div className="overlay-art-wrap" {...tilt.handlers}>
          <motion.div className="overlay-tilt" style={{ rotateX: tilt.rotateX, rotateY: tilt.rotateY }}>
            <motion.div
              className="overlay-art"
              layoutId={item.key}
              transition={{ type: 'spring', stiffness: 300, damping: 32 }}
            >
              {/* thumb is already cached → instant; full-res fades in over it */}
              <img src={item.thumb} alt="" draggable={false} />
              <motion.img
                src={item.image}
                alt={`${item.title} artwork`}
                draggable={false}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4, delay: 0.2 }}
              />
              <motion.span className="overlay-glare" style={{ background: tilt.glare }} />
            </motion.div>
          </motion.div>
        </div>

        <motion.div
          key={item.key}
          className="overlay-info"
          initial="hidden"
          animate="show"
          variants={{ show: { transition: { staggerChildren: 0.06, delayChildren: 0.15 } } }}
        >
          {[
            item.rank ? (
              <p className="eyebrow" key="r">
                {item.tracks ? `Best rank · No. ${item.rank}` : `No. ${item.rank}`}
              </p>
            ) : null,
            <h2 key="t">{item.title}</h2>,
            <p className="overlay-artist" key="a">{item.subtitle}</p>,
            <ul className="overlay-meta" key="m">
              {item.year && <li>{item.year}</li>}
              {item.details.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>,
            item.tracks ? (
              <ol className="tracklist" key="tl">
                {item.tracks.map((t) => (
                  <li key={t.rank}>
                    <span className="tl-rank">{t.rank}</span>
                    <a href={t.url} target="_blank" rel="noreferrer" className="tl-title">
                      {t.title}
                    </a>
                    <span className="tl-dur">{t.duration}</span>
                  </li>
                ))}
              </ol>
            ) : null,
            <a key="l" className="btn-ghost" href={item.url} target="_blank" rel="noreferrer">
              Open in Spotify ↗
            </a>,
          ]
            .filter(Boolean)
            .map((child, i) => (
              <motion.div
                key={i}
                variants={{
                  hidden: { opacity: 0, y: 14, filter: 'blur(6px)' },
                  show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.5, ease } },
                }}
              >
                {child}
              </motion.div>
            ))}
        </motion.div>
      </div>

      <button className="overlay-close" onClick={onClose} aria-label="Close">
        ×
      </button>
      <div className="overlay-hint">← → to browse · esc to close</div>
    </motion.div>
  );
}
