import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArtGrid } from './components/ArtGrid';
import { ArtistsView } from './components/ArtistsView';
import { type CollectionSort, CollectionView, type Shelf } from './components/CollectionView';
import { DetailOverlay } from './components/DetailOverlay';
import { Header, Segmented, type View } from './components/Header';
import { type LayoutMode, LayoutModeContext } from './components/LayoutMode';
import { NowPlayingBar } from './player/NowPlayingBar';
import { PlayerProvider } from './player/PlayerContext';
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
import { type SavedArtist, useCollection, useSavedArtists } from './collection/store';
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
  return (
    <PlayerProvider>
      <Wall onSignOut={signOut} />
      <NowPlayingBar />
    </PlayerProvider>
  );
}

function Wall({ onSignOut }: { onSignOut: () => void }) {
  const [storedView, setView] = usePersisted<View>('sleeve.view', 'collection');
  // "Saved albums" now lives inside Collection as its own shelf.
  const view: View = storedView === 'albums' ? 'collection' : storedView;
  const [storedShelf, setShelf] = usePersisted<Shelf | 'artists'>('sleeve.shelf', storedView === 'albums' ? 'spotify' : 'records');
  // Saved artists used to be a Collection shelf; they have their own tab now.
  const shelf: Shelf = storedShelf === 'artists' ? 'records' : storedShelf;
  const [artistsSort, setArtistsSort] = usePersisted<CollectionSort>('sleeve.artistsSort', 'recent');
  const [tileSize, setTileSize] = usePersisted('sleeve.tile', 180);
  const [layout, setLayout] = usePersisted<LayoutMode>('sleeve.layout', 'grid');
  const [range, setRange] = usePersisted<TimeRange>('sleeve.range', 'short_term');
  const [collectionSort, setCollectionSort] = usePersisted<CollectionSort>('sleeve.collectionSort', 'recent');
  const records = useCollection();
  const artistShelf = useSavedArtists();
  // Where the open artist page was reached from, so its back link returns there.
  const [artistOrigin, setArtistOrigin] = useState<'search' | 'artists'>('search');
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
  const albums = useSavedAlbums(view === 'collection' && shelf === 'spotify', onSignOut);
  const tracks = useTopTracks(view === 'tracks', range, onSignOut);
  const search = useSearch(query, searchFilter, onSignOut);
  const artistAlbums = useArtistAlbums(artist?.id ?? null, artistGroup, onSignOut);
  // An artist opened from the Artists tab shows there, so the header stays on Artists.
  const artistInArtistsTab = view === 'artists' && !!artist && artistOrigin === 'artists';

  const albumItems = useMemo(() => sortItems(albums.items, collectionSort), [albums.items, collectionSort]);
  // Records are stored newest-first, so "recent" is already in order.
  const collectionItems = useMemo(() => sortItems(records.map(recordToItem), collectionSort), [records, collectionSort]);

  const trackItems = useMemo(
    () => (trackMode === 'grouped' ? groupTracksByAlbum(tracks.tracks) : tracks.tracks.map(trackToItem)),
    [tracks.tracks, trackMode],
  );

  const searchAlbumItems = useMemo(() => search.albums.map(searchAlbumToItem), [search.albums]);
  const searchSongItems = useMemo(() => search.tracks.map(searchTrackToItem), [search.tracks]);

  const items =
    artistInArtistsTab
      ? artistAlbums.items
      : view === 'collection'
      ? shelf === 'records'
        ? collectionItems
        : albumItems
      : view === 'tracks'
        ? trackItems
        : artist
          ? artistAlbums.items
          : [...searchAlbumItems, ...searchSongItems];

  /** Opens an artist page from anywhere. Name-only refs get their portrait and genres fetched. */
  const openArtist = useCallback(
    (a: Artist | { id: string; name: string } | null, origin: 'search' | 'artists' = 'search') => {
      setSelected(null);
      window.scrollTo({ top: 0 });
      if (!a) {
        // Back from an artist page: return to wherever it was opened from.
        if (artistOrigin === 'artists') setView('artists');
        return setArtist(null);
      }
      setArtistOrigin(origin);
      setView(origin);
      if ('images' in a) return setArtist(a);
      setArtist({ id: a.id, name: a.name, images: [], external_urls: { spotify: '' } });
      getArtist(a.id)
        .then((full) => setArtist((cur) => (cur?.id === full.id ? full : cur)))
        .catch(() => {});
    },
    [setView, artistOrigin],
  );

  const openSavedArtist = useCallback(
    (a: SavedArtist) =>
      openArtist(
        {
          id: a.id,
          name: a.name,
          genres: a.genres,
          images: a.image ? [{ url: a.image, width: 640, height: 640 }] : [],
          external_urls: { spotify: '' },
        },
        'artists',
      ),
    [openArtist],
  );

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
            // An artist page opened from the Artists tab belongs to that visit; leaving the tab closes it.
            if (artistOrigin === 'artists') setArtist(null);
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
          {artistInArtistsTab ? (
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
              backLabel="Artists"
            />
          ) : view === 'artists' ? (
            <ArtistsView
              artists={artistShelf}
              sort={artistsSort}
              onSort={setArtistsSort}
              onOpenArtist={openSavedArtist}
              onBrowse={() => setView('search')}
            />
          ) : view === 'collection' ? (
            <CollectionView
              shelf={shelf}
              onShelf={(s) => {
                setSelected(null);
                setShelf(s);
              }}
              records={collectionItems}
              spotify={{ ...albums, items: albumItems }}
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
                  On repeat
                  <span className="count">
                    {trackMode === 'grouped'
                      ? `${trackItems.length} albums · ${tracks.tracks.length} tracks`
                      : `${tracks.tracks.length} tracks`}
                  </span>
                </motion.h1>
                <div className="toolbar-controls">
                  <Segmented small groupId="trackMode" value={trackMode} options={TRACK_MODES} onChange={setTrackMode} />
                  <Segmented small groupId="range" value={range} options={RANGES} onChange={setRange} />
                </div>
              </div>

              {tracks.error && <p className="error">Couldn’t load from Spotify: {tracks.error.message}</p>}

              <AnimatePresence mode="wait">
                <motion.div
                  key={`t-${range}-${trackMode}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: { duration: 0.15 } }}
                >
                  <ArtGrid items={items} loading={tracks.loading} tileSize={tileSize} onSelect={setSelected} />
                </motion.div>
              </AnimatePresence>

              {!tracks.loading && !tracks.error && items.length === 0 && (
                <p className="empty">Not enough listening history for this range yet.</p>
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
