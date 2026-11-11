import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArtGrid } from './components/ArtGrid';
import { type CollectionSort, CollectionView } from './components/CollectionView';
import { DetailOverlay } from './components/DetailOverlay';
import { Header, Segmented, type View } from './components/Header';
import { type LayoutMode, LayoutModeContext } from './components/LayoutMode';
import { Login } from './components/Login';
import { SearchView } from './components/SearchView';
import {
  type SearchFilter,
  clearLibrary,
  useArtistAlbums,
  useSavedAlbums,
  useSearch,
  useTopTracks,
} from './hooks/useLibrary';
import { useCollection } from './collection/store';
import { clearCache } from './spotify/cache';
import {
  getArtist,
  getMe,
  groupTracksByAlbum,
  recordToItem,
  searchAlbumToItem,
  searchTrackToItem,
  trackToItem,
} from './spotify/api';
import { handleCallback, hasSession, logout } from './spotify/auth';
import type { AlbumGroup, Artist, ArtItem, TimeRange, User } from './spotify/types';

type Sort = 'recent' | 'artist' | 'year';
type TrackMode = 'grouped' | 'tracks';

const RANGES: { id: TimeRange; label: string }[] = [
  { id: 'short_term', label: '4 weeks' },
  { id: 'medium_term', label: '6 months' },
  { id: 'long_term', label: 'All time' },
];
const TRACK_MODES: { id: TrackMode; label: string }[] = [
  { id: 'grouped', label: 'By album' },
  { id: 'tracks', label: 'By track' },
];
const SORTS: { id: Sort; label: string }[] = [
  { id: 'recent', label: 'Recent' },
  { id: 'artist', label: 'Artist' },
  { id: 'year', label: 'Year' },
];

function sortItems(items: ArtItem[], sort: Sort) {
  if (sort === 'recent') return items;
  const copy = [...items];
  if (sort === 'artist') copy.sort((a, b) => a.subtitle.localeCompare(b.subtitle) || a.year.localeCompare(b.year));
  if (sort === 'year') copy.sort((a, b) => b.year.localeCompare(a.year));
  return copy;
}

function usePersisted<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  }, [key, value]);
  return [value, setValue] as const;
}

export default function App() {
  const isCallback = window.location.pathname === '/callback';
  const [authed, setAuthed] = useState(() => !isCallback && hasSession());
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    if (!isCallback) return;
    handleCallback()
      .then(() => setAuthed(true))
      .catch((e: Error) => setAuthError(e.message));
  }, [isCallback]);

  const signOut = useCallback(() => {
    logout();
    clearCache();
    clearLibrary();
    setAuthed(false);
  }, []);

  if (!authed) return <Login error={authError} />;
  return <Wall onSignOut={signOut} />;
}

function Wall({ onSignOut }: { onSignOut: () => void }) {
  const [view, setView] = usePersisted<View>('sleeve.view', 'albums');
  const [tileSize, setTileSize] = usePersisted('sleeve.tile', 180);
  const [layout, setLayout] = usePersisted<LayoutMode>('sleeve.layout', 'grid');
  const [range, setRange] = usePersisted<TimeRange>('sleeve.range', 'short_term');
  const [sort, setSort] = usePersisted<Sort>('sleeve.sort', 'recent');
  const [collectionSort, setCollectionSort] = usePersisted<CollectionSort>('sleeve.collectionSort', 'recent');
  const records = useCollection();
  const [trackMode, setTrackMode] = usePersisted<TrackMode>('sleeve.trackMode', 'grouped');
  const [artistGroup, setArtistGroup] = usePersisted<AlbumGroup>('sleeve.artistGroup', 'album');
  const [query, setQuery] = useState('');
  const [searchFilter, setSearchFilter] = usePersisted<SearchFilter>('sleeve.searchFilter', 'all');
  const [artist, setArtist] = useState<Artist | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [selected, setSelected] = useState<ArtItem | null>(null);

  useEffect(() => {
    getMe().then(setUser).catch(() => {});
  }, []);

  // Only touch the library when that tab is actually open.
  const albums = useSavedAlbums(view === 'albums', onSignOut);
  const tracks = useTopTracks(view === 'tracks', range, onSignOut);
  const search = useSearch(query, searchFilter, onSignOut);
  const artistAlbums = useArtistAlbums(artist?.id ?? null, artistGroup, onSignOut);

  const albumItems = useMemo(() => sortItems(albums.items, sort), [albums.items, sort]);
  // Records are stored newest-first, so "recent" is already in order.
  const collectionItems = useMemo(() => sortItems(records.map(recordToItem), collectionSort), [records, collectionSort]);

  const trackItems = useMemo(
    () => (trackMode === 'grouped' ? groupTracksByAlbum(tracks.tracks) : tracks.tracks.map(trackToItem)),
    [tracks.tracks, trackMode],
  );

  const searchAlbumItems = useMemo(() => search.albums.map(searchAlbumToItem), [search.albums]);
  const searchSongItems = useMemo(() => search.tracks.map(searchTrackToItem), [search.tracks]);

  const items =
    view === 'collection'
      ? collectionItems
      : view === 'albums'
        ? albumItems
      : view === 'tracks'
        ? trackItems
        : artist
          ? artistAlbums.items
          : [...searchAlbumItems, ...searchSongItems];

  /** Opens an artist page from anywhere. Name-only refs get their portrait and genres fetched. */
  const openArtist = useCallback(
    (a: Artist | { id: string; name: string } | null) => {
      setSelected(null);
      window.scrollTo({ top: 0 });
      if (!a) return setArtist(null);
      setView('search');
      if ('images' in a) return setArtist(a);
      setArtist({ id: a.id, name: a.name, images: [], external_urls: { spotify: '' } });
      getArtist(a.id)
        .then((full) => setArtist((cur) => (cur?.id === full.id ? full : cur)))
        .catch(() => {});
    },
    [setView],
  );
  const loading = view === 'albums' ? albums.loading : tracks.loading;
  const error = view === 'albums' ? albums.error : tracks.error;

  const step = useCallback(
    (dir: -1 | 1) =>
      setSelected((cur) => {
        if (!cur) return cur;
        const i = items.findIndex((x) => x.key === cur.key);
        return items[(i + dir + items.length) % items.length] ?? cur;
      }),
    [items],
  );
  const close = useCallback(() => setSelected(null), []);
  const layoutState = useMemo(() => ({ mode: layout, selectedKey: selected?.key ?? null }), [layout, selected]);

  return (
    <LayoutModeContext.Provider value={layoutState}>
      <LayoutGroup>
        <Header
          view={view}
          onView={(v) => {
            setSelected(null);
            setView(v);
          }}
          tileSize={tileSize}
          onTileSize={setTileSize}
          layout={layout}
          onLayout={setLayout}
          user={user}
          onLogout={onSignOut}
        />

        <main className="main">
          {view === 'collection' ? (
            <CollectionView
              items={collectionItems}
              sort={collectionSort}
              onSort={setCollectionSort}
              tileSize={tileSize}
              onSelect={setSelected}
              onBrowse={() => setView('search')}
            />
          ) : view === 'search' ? (
            <SearchView
              query={query}
              onQuery={setQuery}
              filter={searchFilter}
              onFilter={setSearchFilter}
              results={search}
              albumItems={searchAlbumItems}
              songItems={searchSongItems}
              artist={artist}
              onArtist={openArtist}
              group={artistGroup}
              onGroup={setArtistGroup}
              albums={artistAlbums}
              tileSize={tileSize}
              onSelect={setSelected}
            />
          ) : (
            <>
              <div className="toolbar">
                <motion.h1 key={view} className="view-title" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}>
                  {view === 'albums' ? 'Saved on Spotify' : 'On repeat'}
                  <span className="count">
                    {view === 'albums'
                      ? `${albums.items.length}${(albums.loading || albums.refreshing) && albums.items.length ? '…' : ''} albums`
                      : trackMode === 'grouped'
                        ? `${trackItems.length} albums · ${tracks.tracks.length} tracks`
                        : `${tracks.tracks.length} tracks`}
                  </span>
                </motion.h1>
                {view === 'albums' ? (
                  <div className="toolbar-controls">
                    <button
                      className="text-btn"
                      onClick={albums.refresh}
                      disabled={albums.loading || albums.refreshing}
                      title="Re-sync your saved albums from Spotify"
                    >
                      {albums.refreshing ? 'Syncing…' : 'Refresh'}
                    </button>
                    <Segmented small groupId="sort" value={sort} options={SORTS} onChange={setSort} />
                  </div>
                ) : (
                  <div className="toolbar-controls">
                    <Segmented small groupId="trackMode" value={trackMode} options={TRACK_MODES} onChange={setTrackMode} />
                    <Segmented small groupId="range" value={range} options={RANGES} onChange={setRange} />
                  </div>
                )}
              </div>

              {error && <p className="error">Couldn’t load from Spotify: {error.message}</p>}

              <AnimatePresence mode="wait">
                <motion.div
                  key={view === 'albums' ? `a-${sort}` : `t-${range}-${trackMode}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: { duration: 0.15 } }}
                >
                  <ArtGrid items={items} loading={loading} tileSize={tileSize} onSelect={setSelected} />
                </motion.div>
              </AnimatePresence>

              {!loading && !error && items.length === 0 && (
                <p className="empty">
                  {view === 'albums' ? 'No saved albums yet — save a few in Spotify and come back.' : 'Not enough listening history for this range yet.'}
                </p>
              )}
            </>
          )}
        </main>

        <AnimatePresence>
          {selected && <DetailOverlay key="overlay" item={selected} onClose={close} onStep={step} onArtist={openArtist} />}
        </AnimatePresence>
      </LayoutGroup>
    </LayoutModeContext.Provider>
  );
}
