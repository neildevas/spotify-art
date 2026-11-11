import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { pickImageSet } from '../spotify/api';
import type { SearchFilter } from '../hooks/useLibrary';
import type { AlbumGroup, Artist, ArtItem } from '../spotify/types';
import { ArtGrid } from './ArtGrid';
import { Segmented } from './Header';

const ease = [0.22, 1, 0.36, 1] as const;

const GROUPS: { id: AlbumGroup; label: string }[] = [
  { id: 'album', label: 'Albums' },
  { id: 'single', label: 'Singles & EPs' },
  { id: 'all', label: 'Everything' },
];

const FILTERS: { id: SearchFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'artist', label: 'Artists' },
  { id: 'album', label: 'Albums' },
  { id: 'track', label: 'Songs' },
];

type Props = {
  query: string;
  onQuery: (q: string) => void;
  filter: SearchFilter;
  onFilter: (f: SearchFilter) => void;
  results: { artists: Artist[]; loading: boolean; hasMore: boolean; error: Error | null; loadMore: () => void };
  albumItems: ArtItem[];
  songItems: ArtItem[];
  artist: Artist | null;
  onArtist: (a: Artist | null) => void;
  group: AlbumGroup;
  onGroup: (g: AlbumGroup) => void;
  albums: { items: ArtItem[]; loading: boolean; error: Error | null; hasMore: boolean; loadMore: () => void };
  tileSize: number;
  onSelect: (item: ArtItem) => void;
};

export function SearchView(props: Props) {
  return props.artist ? <ArtistPage {...props} artist={props.artist} /> : <SearchResults {...props} />;
}

/** Round portrait shared between the result card and the artist page header (same layoutId). */
function Portrait({ artist, size }: { artist: Artist; size: 'card' | 'hero' }) {
  const { image, thumb } = pickImageSet(artist.images);
  const src = size === 'hero' ? image : thumb;
  return (
    <motion.div
      className={`portrait portrait-${size}`}
      layoutId={`artist-${artist.id}`}
      transition={{ type: 'spring', stiffness: 300, damping: 32 }}
    >
      {src ? <img src={src} alt="" draggable={false} /> : <span>{artist.name[0]}</span>}
    </motion.div>
  );
}

function SearchResults({
  query,
  onQuery,
  filter,
  onFilter,
  results,
  albumItems,
  songItems,
  onArtist,
  tileSize,
  onSelect,
}: Props) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);

  const hasQuery = !!query.trim();
  const empty = !results.artists.length && !albumItems.length && !songItems.length;
  const show = (f: SearchFilter) => filter === 'all' || filter === f;

  return (
    <div className="search">
      <div className="search-field">
        <input
          ref={input}
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search artists, albums, songs"
          spellCheck={false}
          aria-label="Search"
        />
        <motion.span
          className="search-underline"
          animate={{ scaleX: query ? 1 : 0.25, opacity: results.loading ? [0.4, 1, 0.4] : 1 }}
          transition={{
            scaleX: { duration: 0.5, ease },
            opacity: results.loading ? { duration: 1.2, repeat: Infinity } : { duration: 0.2 },
          }}
        />
      </div>

      <div className="search-filters">
        <Segmented small groupId="searchFilter" value={filter} options={FILTERS} onChange={onFilter} />
      </div>

      {!hasQuery && <p className="search-hint">Type a name, then pick something to dive in.</p>}
      {results.error && <p className="error">{results.error.message}</p>}

      {show('artist') && (hasQuery || results.artists.length > 0) && (
        <Section title="Artists" count={results.artists.length} onMore={filter === 'all' ? () => onFilter('artist') : undefined}>
          <ul className={filter === 'all' ? 'artist-row' : 'artist-grid'}>
            <AnimatePresence mode="popLayout">
              {results.artists.map((a, i) => (
                <motion.li
                  key={a.id}
                  layout
                  initial={{ opacity: 0, y: 16, filter: 'blur(6px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
                  transition={{ duration: 0.45, ease, delay: (i % 10) * 0.035 }}
                >
                  <button className="artist-card" onClick={() => onArtist(a)}>
                    <Portrait artist={a} size="card" />
                    <span className="artist-name">{a.name}</span>
                  </button>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </Section>
      )}

      {show('album') && hasQuery && (
        <Section title="Albums" count={albumItems.length} onMore={filter === 'all' ? () => onFilter('album') : undefined}>
          <ArtGrid
            items={albumItems}
            loading={results.loading}
            tileSize={tileSize}
            onSelect={onSelect}
            skeletons={filter === 'all' ? 6 : 12}
            allowSingle={filter !== 'all'}
          />
        </Section>
      )}

      {show('track') && hasQuery && (
        <Section title="Songs" count={songItems.length} onMore={filter === 'all' ? () => onFilter('track') : undefined}>
          <ArtGrid
            items={songItems}
            loading={results.loading}
            tileSize={tileSize}
            onSelect={onSelect}
            captions
            skeletons={filter === 'all' ? 6 : 12}
            allowSingle={filter !== 'all'}
          />
        </Section>
      )}

      {filter !== 'all' && results.hasMore && <LoadMore key={`${query}-${filter}`} onVisible={results.loadMore} loading={results.loading} />}

      {hasQuery && !results.loading && empty && <p className="empty">Nothing found.</p>}
    </div>
  );
}

function Section({
  title,
  count,
  onMore,
  children,
}: {
  title: string;
  count: number;
  onMore?: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="search-section">
      <div className="search-section-head">
        <h2>{title}</h2>
        {onMore && count > 0 && (
          <button className="see-all" onClick={onMore}>
            See all →
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

// After this many automatic pages, ask before loading more (each page is a request).
const AUTO_PAGES = 3;

/**
 * Loads the next page when the bottom of the list scrolls into view — only on a real scroll
 * (the observer is created once and fires on transitions), and only a few times before
 * switching to a button.
 */
function LoadMore({ onVisible, loading }: { onVisible: () => void; loading: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const latest = useRef(onVisible);
  latest.current = onVisible;
  const [autoLoads, setAutoLoads] = useState(0);
  const auto = autoLoads < AUTO_PAGES;

  useEffect(() => {
    const el = ref.current;
    if (!el || !auto) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        setAutoLoads((n) => n + 1);
        latest.current();
      },
      { rootMargin: '200px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [auto]);

  return (
    <div ref={ref} className="load-more">
      {/* The button is always there: auto-loading only fires on a scroll, and stops after a few pages. */}
      {loading ? (
        'Loading more…'
      ) : (
        <button className="btn-ghost" onClick={() => latest.current()}>
          Load more
        </button>
      )}
    </div>
  );
}

function ArtistPage({ artist, onArtist, group, onGroup, albums, tileSize, onSelect }: Props & { artist: Artist }) {
  const { image } = pickImageSet(artist.images);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Only step back to results when no album overlay is open (it handles its own Escape).
      if (e.key === 'Escape' && !document.querySelector('.overlay')) onArtist(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onArtist]);

  return (
    <div className="artist-page">
      {image && (
        <motion.div
          className="artist-bloom"
          style={{ backgroundImage: `url("${image}")` }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.35 }}
          transition={{ duration: 1.2, ease }}
          aria-hidden
        />
      )}

      <motion.button
        className="back"
        onClick={() => onArtist(null)}
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
      >
        ← Search
      </motion.button>

      <header className="artist-hero">
        <Portrait artist={artist} size="hero" />
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease, delay: 0.1 }}
        >
          <h1 className="view-title">
            {artist.name}
            <span className="count">
              {albums.items.length}
              {albums.hasMore || (albums.loading && albums.items.length) ? '+' : ''} releases
            </span>
          </h1>
          {!!artist.genres?.length && (
            <ul className="overlay-meta artist-genres">
              {artist.genres.slice(0, 4).map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
          )}
        </motion.div>
        <div className="artist-controls">
          <Segmented small groupId="artistGroup" value={group} options={GROUPS} onChange={onGroup} />
        </div>
      </header>

      {albums.error && <p className="error">Couldn’t load releases: {albums.error.message}</p>}

      <motion.div key={`${artist.id}-${group}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <ArtGrid items={albums.items} loading={albums.loading} tileSize={tileSize} onSelect={onSelect} />
      </motion.div>

      {albums.hasMore && (
        <LoadMore key={`more-${artist.id}-${group}`} onVisible={albums.loadMore} loading={albums.loading} />
      )}

      {!albums.loading && !albums.error && albums.items.length === 0 && (
        <p className="empty">Nothing in this category.</p>
      )}
    </div>
  );
}
