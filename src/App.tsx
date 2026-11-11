import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArtGrid } from './components/ArtGrid';
import { DetailOverlay } from './components/DetailOverlay';
import { Header, Segmented, type View } from './components/Header';
import { Login } from './components/Login';
import { useSavedAlbums, useTopTracks } from './hooks/useLibrary';
import { getMe, groupTracksByAlbum, trackToItem } from './spotify/api';
import { handleCallback, hasSession, logout } from './spotify/auth';
import type { ArtItem, TimeRange, User } from './spotify/types';

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
    setAuthed(false);
  }, []);

  if (!authed) return <Login error={authError} />;
  return <Wall onSignOut={signOut} />;
}

function Wall({ onSignOut }: { onSignOut: () => void }) {
  const [view, setView] = usePersisted<View>('sleeve.view', 'albums');
  const [tileSize, setTileSize] = usePersisted('sleeve.tile', 180);
  const [range, setRange] = usePersisted<TimeRange>('sleeve.range', 'short_term');
  const [sort, setSort] = usePersisted<Sort>('sleeve.sort', 'recent');
  const [trackMode, setTrackMode] = usePersisted<TrackMode>('sleeve.trackMode', 'grouped');
  const [user, setUser] = useState<User | null>(null);
  const [selected, setSelected] = useState<ArtItem | null>(null);

  useEffect(() => {
    getMe().then(setUser).catch(() => {});
  }, []);

  const albums = useSavedAlbums(true, onSignOut);
  const tracks = useTopTracks(view === 'tracks', range, onSignOut);

  const albumItems = useMemo(() => {
    if (sort === 'recent') return albums.items;
    const copy = [...albums.items];
    if (sort === 'artist') copy.sort((a, b) => a.subtitle.localeCompare(b.subtitle) || a.year.localeCompare(b.year));
    if (sort === 'year') copy.sort((a, b) => b.year.localeCompare(a.year));
    return copy;
  }, [albums.items, sort]);

  const trackItems = useMemo(
    () => (trackMode === 'grouped' ? groupTracksByAlbum(tracks.tracks) : tracks.tracks.map(trackToItem)),
    [tracks.tracks, trackMode],
  );

  const items = view === 'albums' ? albumItems : trackItems;
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

  return (
    <LayoutGroup>
      <Header
        view={view}
        onView={(v) => {
          setSelected(null);
          setView(v);
        }}
        tileSize={tileSize}
        onTileSize={setTileSize}
        user={user}
        onLogout={onSignOut}
      />

      <main className="main">
        <div className="toolbar">
          <motion.h1 key={view} className="view-title" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}>
            {view === 'albums' ? 'Your collection' : 'On repeat'}
            <span className="count">
              {view === 'albums'
                ? `${albums.items.length}${albums.loading && albums.items.length ? '…' : ''} albums`
                : trackMode === 'grouped'
                  ? `${trackItems.length} albums · ${tracks.tracks.length} tracks`
                  : `${tracks.tracks.length} tracks`}
            </span>
          </motion.h1>
          {view === 'albums' ? (
            <Segmented small groupId="sort" value={sort} options={SORTS} onChange={setSort} />
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
      </main>

      <AnimatePresence>
        {selected && <DetailOverlay key="overlay" item={selected} onClose={close} onStep={step} />}
      </AnimatePresence>
    </LayoutGroup>
  );
}
