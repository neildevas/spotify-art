import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArtGrid } from './components/ArtGrid';
import { type ArtistsSort, type CollectionShelf, CollectionView, type RecordsView } from './components/CollectionView';
import { DetailOverlay } from './components/DetailOverlay';
import { Header, Segmented, type View } from './components/Header';
import { LayoutModeContext } from './components/LayoutMode';
import { NowPlayingBar } from './player/NowPlayingBar';
import { PlayerProvider } from './player/PlayerContext';
import { AfterRecordProvider } from './player/AfterRecord';
import { Login } from './components/Login';
import { SearchView } from './components/SearchView';
import { type LikeRow, LikesView } from './components/LikesView';
import { clearLikes, useLikes } from './hooks/useLikes';
import {
  type SearchFilter,
  clearLibrary,
  useArtistAlbums,
  useSavedAlbums,
  useSearch,
  useTopTracks,
} from './hooks/useLibrary';
import { type SavedArtist, savedArtists, useCollection, useSavedArtists } from './collection/store';
import { clearCache } from './spotify/cache';
import {
  getAlbumItem,
  getArtist,
  isPlayable,
  artistRecordItems,
  likedSongToItem,
  getMe,
  groupTracksByAlbum,
  recordToItem,
  searchAlbumToItem,
  searchTrackToItem,
  trackToItem,
} from './spotify/api';
import { handleCallback, hasSession, logout } from './spotify/auth';
import type { AlbumGroup, Artist, ArtItem, TimeRange, User } from './spotify/types';

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
/** Records in your order (newest first until you rearrange), or by artist name then year. */
function sortItems(items: ArtItem[], sort: 'custom' | 'artist', order: string[] = []) {
  if (sort === 'artist') {
    return [...items].sort((a, b) => a.subtitle.localeCompare(b.subtitle) || a.year.localeCompare(b.year));
  }
  // Your arrangement; records added since you last arranged come first, newest first.
  const at = new Map(order.map((id, i) => [id, i]));
  const rank = (r: ArtItem) => at.get(r.albumId ?? '') ?? -1;
  return items
    .map((r, i) => ({ r, i }))
    .sort((a, b) => rank(a.r) - rank(b.r) || a.i - b.i)
    .map(({ r }) => r);
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
    clearLikes();
    setAuthed(false);
  }, []);

  if (!authed) return <Login error={authError} />;
  return (
    <PlayerProvider>
      <AfterRecordProvider>
        <Wall onSignOut={signOut} />
      </AfterRecordProvider>
    </PlayerProvider>
  );
}

function Wall({ onSignOut }: { onSignOut: () => void }) {
  const [storedView, setView] = usePersisted<View>('sleeve.view', 'collection');
  // Artists and records now share the Collection tab (older "Saved albums" / "Artists" tabs map here).
  const view: View = storedView === 'albums' || storedView === 'artists' ? 'collection' : storedView;
  const [tileSize, setTileSize] = usePersisted('sleeve.tile', 180);
  const [storedShelf, setCollectionShelf] = usePersisted<CollectionShelf | 'likes'>('sleeve.collectionShelf.v2', 'records'); // Records first: the everyday view
  // "From your likes" moved to its own top tab.
  const collectionShelf: CollectionShelf = storedShelf === 'likes' ? 'records' : storedShelf;
  // Quick filter on the Records grid (album or artist); not remembered between visits.
  const [recordQuery, setRecordQuery] = useState('');
  const [range, setRange] = usePersisted<TimeRange>('sleeve.range', 'short_term');
  // Records: your own order (newest on top until you rearrange) or grouped by artist. Artists sort separately.
  const [recordsView, setRecordsView] = usePersisted<RecordsView>('sleeve.recordsView', 'order');
  const [artistsSort, setArtistsSort] = usePersisted<ArtistsSort>('sleeve.artistsSort', 'recent');
  // "Your order": the arrangement you've dragged the Records grid into (album ids, first to last).
  const [collectionOrder, setCollectionOrder] = usePersisted<string[]>('sleeve.collectionOrder', []);
  const records = useCollection();
  const artistShelf = useSavedArtists();
  // Where the open artist page was reached from, so its back link returns there.
  const [artistOrigin, setArtistOrigin] = useState<'search' | 'collection'>('search');
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

  // Spotify's saved-albums list is set aside for now (the collection is your own).
  useSavedAlbums(false, onSignOut);
  const tracks = useTopTracks(view === 'tracks', range, onSignOut);
  const search = useSearch(query, searchFilter, onSignOut);
  const artistAlbums = useArtistAlbums(artist?.id ?? null, artistGroup, onSignOut);
  // An artist opened from the Collection shows there, so the header stays on Collection.
  const artistInCollection = view === 'collection' && !!artist && artistOrigin === 'collection';
  // Your records by the open artist come first on their page (and in the overlay's ← → order).
  const artistRecords = useMemo(() => (artist ? artistRecordItems(records, artist.id) : []), [records, artist]);

  // Liked songs: a Spotify extra behind the profile menu. Back returns to whichever tab you came from.
  const [likesBackTo, setLikesBackTo] = useState<View>('collection');
  const showLikes = view === 'likes' && !artist;
  const likes = useLikes(showLikes, onSignOut);
  const likeRows = useMemo<LikeRow[]>(() => {
    const likedOnAlbum = new Map<string, string[]>();
    for (const l of likes.likes) {
      const ids = likedOnAlbum.get(l.albumId);
      if (ids) ids.push(l.trackId);
      else likedOnAlbum.set(l.albumId, [l.trackId]);
    }
    return likes.likes
      .filter((l) => likes.albums[l.albumId])
      .map((like) => ({ like, item: likedSongToItem(likes.albums[like.albumId], like.trackId, likedOnAlbum.get(like.albumId)!) }));
  }, [likes.likes, likes.albums]);
  const likedItems = useMemo(() => likeRows.map((r) => r.item), [likeRows]);




  // Records and artists are stored newest-first, so "recent" is already in order.
  const collectionItems = useMemo(() => {
    const q = recordQuery.trim().toLowerCase();
    const all = records.map(recordToItem);
    const shown = q ? all.filter((r) => r.title.toLowerCase().includes(q) || r.subtitle.toLowerCase().includes(q)) : all;
    return sortItems(shown, recordsView === 'artist' ? 'artist' : 'custom', collectionOrder);
  }, [records, recordsView, recordQuery, collectionOrder]);
  const sortedArtists = useMemo(
    () => (artistsSort === 'name' ? [...artistShelf].sort((a, b) => a.name.localeCompare(b.name)) : artistShelf),
    [artistShelf, artistsSort],
  );

  const trackItems = useMemo(
    () => (trackMode === 'grouped' ? groupTracksByAlbum(tracks.tracks) : tracks.tracks.map(trackToItem)),
    [tracks.tracks, trackMode],
  );

  const searchAlbumItems = useMemo(() => search.albums.map(searchAlbumToItem), [search.albums]);
  const searchSongItems = useMemo(() => search.tracks.map(searchTrackToItem), [search.tracks]);

  const items =
    artist && (artistInCollection || view === 'search')
      ? [...artistRecords, ...artistAlbums.items]
      : showLikes
      ? likedItems
      : view === 'collection'
      ? collectionItems
      : view === 'tracks'
        ? trackItems
        : artist
          ? artistAlbums.items
          : [...searchAlbumItems, ...searchSongItems];

  /** Opens an artist page from anywhere. Name-only refs get their photo fetched. */
  const openArtist = useCallback(
    (a: Artist | { id: string; name: string } | null, origin: 'search' | 'collection' = 'search') => {
      setSelected(null);
      window.scrollTo({ top: 0 });
      if (!a) {
        // Back from an artist page: return to wherever it was opened from.
        if (artistOrigin === 'collection') setView('collection');
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
          images: a.image ? [{ url: a.image, width: 640, height: 640 }] : [],
          external_urls: { spotify: '' },
        },
        'collection',
      ),
    [openArtist],
  );
  // Saved copies can be missing a photo (or be out of date): refresh from Spotify.
  const openSavedArtistFresh = useCallback(
    (a: SavedArtist) => {
      openSavedArtist(a);
      getArtist(a.id)
        .then((full) => {
          setArtist((cur) => (cur?.id === full.id ? full : cur));
          savedArtists.refreshInfo(full);
        })
        .catch(() => {});
    },
    [openSavedArtist],
  );

  /** "+ Collect artist" on a single record: collect them, then fill in their photo. */
  const collectArtist = useCallback((a: { id: string; name: string }) => {
    savedArtists.add({ id: a.id, name: a.name, images: [], external_urls: { spotify: '' } });
    getArtist(a.id)
      .then((full) => savedArtists.refreshInfo(full))
      .catch(() => {});
  }, []);

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

  /** Clicking the player's cover or title opens the album that's playing, on the song that's playing. */
  const openPlayingAlbum = useCallback(
    (albumId: string, trackId: string | null) => {
      const onPage = items.find((x) => x.albumId === albumId && isPlayable(x));
      const show = (item: ArtItem) => setSelected({ ...item, highlightTrackId: trackId ?? undefined });
      if (onPage) return show(onPage);
      getAlbumItem(albumId)
        .then(show)
        .catch(() => {});
    },
    [items],
  );
  // The one-at-a-time view is retired; everything is a grid sized by the slider.
  const layoutState = useMemo(() => ({ mode: 'grid' as const, selectedKey: selected?.key ?? null }), [selected]);

  return (
    <LayoutModeContext.Provider value={layoutState}>
      <LayoutGroup>
        <Header
          view={view}
          onView={(v) => {
            setSelected(null);
            // An artist page opened from the Collection belongs to that visit; leaving the tab closes it.
            if (artistOrigin === 'collection') setArtist(null);
            setView(v);
          }}
          tileSize={tileSize}
          onTileSize={setTileSize}
          user={user}
          onLogout={onSignOut}
          onLikedSongs={() => {
            setSelected(null);
            setArtist(null);
            if (view !== 'likes') setLikesBackTo(view);
            setView('likes');
            window.scrollTo({ top: 0 });
          }}
        />

        <main className="main" style={{ '--tile': `${tileSize}px` } as React.CSSProperties}>
          {artistInCollection ? (
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
              backLabel="Collection"
            />
          ) : view === 'collection' ? (
            <CollectionView
              artists={sortedArtists}
              records={collectionItems}
              totalRecords={records.length}
              query={recordQuery}
              onQuery={setRecordQuery}
              shelf={collectionShelf}
              onShelf={setCollectionShelf}
              recordsView={recordsView}
              onRecordsView={setRecordsView}
              artistsSort={artistsSort}
              onArtistsSort={setArtistsSort}
              tileSize={tileSize}
              onSelect={setSelected}
              onOpenArtist={openSavedArtistFresh}
              onCollectArtist={collectArtist}
              onBrowse={() => setView('search')}
              onBrowseLikes={() => setView('likes')}
              onArrange={setCollectionOrder}
            />
          ) : showLikes ? (
            <LikesView
              rows={likeRows}
              total={likes.total}
              loading={likes.loading}
              refreshing={likes.refreshing}
              error={likes.error}
              backLabel={likesBackTo === 'search' ? 'Search' : 'Collection'}
              onBack={() => setView(likesBackTo === 'search' ? 'search' : 'collection')}
              onOpenRecord={setSelected}
              onRefresh={likes.refresh}
            />
          ) : view === 'search' || view === 'likes' ? (
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
        <NowPlayingBar onOpenAlbum={openPlayingAlbum} />
      </LayoutGroup>
    </LayoutModeContext.Provider>
  );
}
