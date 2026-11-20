import { useCallback, useEffect, useRef, useState } from 'react';
import { AuthError, likedTracks, likedTracksHead } from '../spotify/api';
import type { Album, SavedTrack } from '../spotify/types';

/**
 * Your Spotify liked songs, boiled down to what Sleeve needs: which album each song is on and
 * when you liked it. Kept in localStorage like the saved-albums library:
 *  - checked in the last 6h → no requests
 *  - otherwise one tiny request (limit=1) to see if anything changed; only then refetch it all
 */
const KEY = 'sleeve.likes.v1';
const FRESH_MS = 6 * 60 * 60 * 1000;

export type Like = { trackId: string; albumId: string; addedAt: number };
type Stored = { likes: Like[]; albums: Record<string, Album>; total: number; firstId: string | null; checkedAt: number };

function read(): Stored | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
}
function write(s: Stored) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* too big for localStorage; it'll be refetched next time */
  }
}
export function clearLikes() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** Only the album fields Sleeve shows, so a big library still fits in localStorage. */
function slimAlbum(a: Album): Album {
  return {
    id: a.id,
    name: a.name,
    album_type: a.album_type,
    release_date: a.release_date,
    total_tracks: a.total_tracks,
    images: a.images,
    artists: a.artists.map(({ id, name, external_urls }) => ({ id, name, external_urls })),
    external_urls: a.external_urls,
  };
}

function absorb(page: SavedTrack[], likes: Like[], albums: Record<string, Album>) {
  for (const { added_at, track } of page) {
    if (!track?.id || !track.album?.id) continue; // local files / unavailable songs
    likes.push({ trackId: track.id, albumId: track.album.id, addedAt: Date.parse(added_at) || 0 });
    albums[track.album.id] ??= slimAlbum(track.album);
  }
}

type State = {
  likes: Like[];
  albums: Record<string, Album>;
  /** Liked songs Spotify says you have, for "Loading 400 of 3,120". */
  total: number;
  loading: boolean;
  refreshing: boolean;
  error: Error | null;
};

export function useLikes(enabled: boolean, onAuthError: () => void) {
  const [state, setState] = useState<State>(() => {
    const s = read();
    return { likes: s?.likes ?? [], albums: s?.albums ?? {}, total: s?.total ?? 0, loading: !s, refreshing: false, error: null };
  });
  const [forceToken, setForceToken] = useState(0);
  const synced = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    const force = forceToken > 0;
    if (synced.current && !force) return;
    let alive = true;

    (async () => {
      try {
        const cached = read();
        let total = cached?.total ?? 0;
        if (cached && !force) {
          if (Date.now() - cached.checkedAt < FRESH_MS) {
            synced.current = true;
            return;
          }
          const head = await likedTracksHead();
          if (!alive) return;
          total = head.total;
          if (head.total === cached.total && (head.items[0]?.track?.id ?? null) === cached.firstId) {
            write({ ...cached, checkedAt: Date.now() });
            synced.current = true;
            return;
          }
        }

        // Full fetch. With a cached copy on screen, build the new one off to the side and swap at the end.
        const progressive = !cached;
        setState((s) => ({ ...s, loading: progressive, refreshing: !progressive, error: null }));
        const likes: Like[] = [];
        const albums: Record<string, Album> = {};
        let firstId: string | null = null;
        let pages = 0;
        for await (const page of likedTracks()) {
          if (!alive) return;
          total = page.total;
          firstId ??= page.items[0]?.track?.id ?? null;
          absorb(page.items, likes, albums);
          pages++;
          // Re-render every couple of pages; each one regroups the whole list.
          if (progressive && pages % 2 === 1) setState((s) => ({ ...s, likes: [...likes], albums: { ...albums }, total: Math.max(total, likes.length) }));
        }
        if (!alive) return;
        write({ likes, albums, total: likes.length, firstId, checkedAt: Date.now() });
        synced.current = true;
        setState({ likes, albums, total: likes.length, loading: false, refreshing: false, error: null });
      } catch (error) {
        if (error instanceof AuthError) return onAuthError();
        if (alive) setState((s) => ({ ...s, loading: false, refreshing: false, error: error as Error }));
      }
    })();

    return () => {
      alive = false;
    };
  }, [enabled, forceToken, onAuthError]);

  const refresh = useCallback(() => setForceToken((n) => n + 1), []);
  return { ...state, refresh };
}
