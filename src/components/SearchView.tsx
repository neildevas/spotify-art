import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import type { SearchFilter } from '../hooks/useLibrary';
import { pickImageSet } from '../spotify/api';
import type { AlbumGroup, Artist, ArtItem } from '../spotify/types';
import { ArtGrid } from './ArtGrid';
import { Segmented } from './Header';
import { savedArtists, useCollection, useSavedArtist } from '../collection/store';
import { LinerNotes, TopShelf } from './LinerNotes';
import { SaveArtistButton } from './SaveArtistButton';
import { FavTracks } from './FavTracks';

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

// Short enough to fit the big serif field at any width; the filter below says what's being searched.
const PLACEHOLDERS: Record<SearchFilter, string> = {
  all: 'Find something',
  artist: 'Find an artist',
  album: 'Find an album',
  track: 'Find a song',
};

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
  /** Where the artist page's back link goes ("Search" or "Collection"). */
  backLabel?: string;
};

export function SearchView(props: Props) {
  return props.artist ? <ArtistPage {...props} artist={props.artist} /> : <SearchResults {...props} />;
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
          placeholder={PLACEHOLDERS[filter]}
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
          {/* Type only, no photos: names set like an index, the hovered one stays bright */}
          <ul className={filter === 'all' ? 'artist-index' : 'artist-list'}>
            <AnimatePresence mode="popLayout">
              {results.artists.map((a, i) => (
                <motion.li
                  key={a.id}
                  layout="position"
                  initial={{ opacity: 0, y: 12, filter: 'blur(6px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, transition: { duration: 0.15 } }}
                  transition={{ duration: 0.45, ease, delay: (i % 10) * 0.03 }}
                >
                  <button className="artist-link-row" onClick={() => onArtist(a)}>
                    <motion.span
                      className="artist-index-name"
                      layoutId={`artist-${a.id}`}
                      transition={{ type: 'spring', stiffness: 300, damping: 32 }}
                    >
                      {a.name}
                    </motion.span>
                    <span className="artist-arrow" aria-hidden>
                      →
                    </span>
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

/** The artist's photo, only on their own page. Fades in once loaded; nothing shows if Spotify has none. */
function ArtistPhoto({ artist }: { artist: Artist }) {
  const { image } = pickImageSet(artist.images);
  const [loaded, setLoaded] = useState(false);
  if (!image) {
    return (
      <div className="artist-photo artist-photo-empty" aria-hidden>
        {artist.name[0]}
      </div>
    );
  }
  return (
    <motion.div
      key={image}
      className="artist-photo"
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: loaded ? 1 : 0, scale: loaded ? 1 : 0.94 }}
      transition={{ duration: 0.6, ease }}
    >
      <img src={image} alt={artist.name} draggable={false} onLoad={() => setLoaded(true)} />
    </motion.div>
  );
}

function ArtistPage({
  artist,
  onArtist,
  group,
  onGroup,
  albums,
  tileSize,
  onSelect,
  backLabel = 'Search',
}: Props & { artist: Artist }) {
  // Saved artists get the appreciation page: liner notes, a top shelf and pinnable releases.
  const saved = useSavedArtist(artist.id);
  const records = useCollection();
  const owned = records.filter((r) => r.artists.some((a) => a.id === artist.id)).length;
  const pinnedIds = new Set((saved?.pinned ?? []).map((r) => r.id));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Only step back to results when no album overlay is open (it handles its own Escape),
      // and not while typing liner notes.
      const typing = document.activeElement instanceof HTMLTextAreaElement;
      if (e.key === 'Escape' && !typing && !document.querySelector('.overlay')) onArtist(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onArtist]);

  return (
    <div className="artist-page">

      <motion.button
        className="back"
        onClick={() => onArtist(null)}
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
      >
        ← {backLabel}
      </motion.button>

      {/* Big portrait on the left; name and actions line up with its bottom edge */}
      <header className="artist-hero">
        <ArtistPhoto artist={artist} />
        <div className="artist-hero-text">
          {saved && (
            <span className="eyebrow artist-since">
              Collected · since{' '}
              {new Date(saved.addedAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
            </span>
          )}
          <h1 className="view-title artist-title">
            <motion.span layoutId={`artist-${artist.id}`} transition={{ type: 'spring', stiffness: 300, damping: 32 }}>
              {artist.name}
            </motion.span>
          </h1>
          <span className="artist-stats">
            {albums.items.length}
            {albums.hasMore || (albums.loading && albums.items.length) ? '+' : ''} releases
            {owned ? ` · ${owned} in your collection` : ''}
          </span>
          <div className="artist-save">
            <SaveArtistButton artist={artist} />
            {!saved && <span className="liner-hint">Add them to pin your favourite records to a top shelf.</span>}
          </div>
          {saved && <FavTracks artist={saved} />}
        </div>
      </header>

      {saved && (
        <>
          {/*<LinerNotes artist={saved} />*/}
          <TopShelf artist={saved} onSelect={onSelect} />
        </>
      )}

      {/* The release filter sits with the grid it controls */}
      <div className="section-head discography-head">
        <h2>
          Discography {saved && <span className="count">pin records to your top shelf</span>}
        </h2>
        <Segmented small groupId="artistGroup" value={group} options={GROUPS} onChange={onGroup} />
      </div>

      {albums.error && <p className="error">Couldn’t load releases: {albums.error.message}</p>}

      <motion.div key={`${artist.id}-${group}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <ArtGrid
          items={albums.items}
          loading={albums.loading}
          tileSize={tileSize}
          onSelect={onSelect}
          pinnedIds={saved ? pinnedIds : undefined}
          onTogglePin={saved ? (item) => item.record && savedArtists.togglePin(saved.id, item.record) : undefined}
        />
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
