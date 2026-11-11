import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AuthError,
  albumToItem,
  artistAlbumToItem,
  artistAlbumsPage,
  peekSearch,
  savedAlbums,
  savedAlbumsHead,
  search,
  topTracks,
} from '../spotify/api';
import type { Album, AlbumGroup, Artist, ArtItem, Paging, TimeRange, Track } from '../spotify/types';

type State = { items: ArtItem[]; loading: boolean; refreshing: boolean; error: Error | null };

const LIBRARY_KEY = 'sleeve.library.v1';
const LIBRARY_FRESH_MS = 6 * 60 * 60 * 1000;
type StoredLibrary = { items: ArtItem[]; total: number; firstId: string | null; checkedAt: number };

function readLibrary(): StoredLibrary | null {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY);
    return raw ? (JSON.parse(raw) as StoredLibrary) : null;
  } catch {
    return null;
  }
}
function writeLibrary(lib: StoredLibrary) {
  try {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(lib));
  } catch {
    /* too big for localStorage — it'll just be refetched next time */
  }
}
export function clearLibrary() {
  try {
    localStorage.removeItem(LIBRARY_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Saved albums, kept in localStorage between visits. On load:
 *  - cached and checked in the last 6h → no requests at all
 *  - otherwise one tiny request (limit=1) to see if the library changed; only then refetch it all
 * `refresh()` forces a full refetch.
 */
export function useSavedAlbums(enabled: boolean, onAuthError: () => void) {
  const [state, setState] = useState<State>(() => {
    const lib = readLibrary();
    return { items: lib?.items ?? [], loading: !lib, refreshing: false, error: null };
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
        const cachedLib = readLibrary();
        if (cachedLib && !force) {
          if (Date.now() - cachedLib.checkedAt < LIBRARY_FRESH_MS) {
            synced.current = true;
            return;
          }
          const head = await savedAlbumsHead();
          if (!alive) return;
          if (head.total === cachedLib.total && (head.items[0]?.album.id ?? null) === cachedLib.firstId) {
            writeLibrary({ ...cachedLib, checkedAt: Date.now() });
            synced.current = true;
            return;
          }
        }

        // Full fetch. With a cached copy on screen, build the new list off to the side and swap at the end.
        const showProgressively = !cachedLib;
        setState((s) => ({ ...s, loading: !cachedLib, refreshing: !!cachedLib, error: null }));
        const fresh: ArtItem[] = [];
        let firstId: string | null = null;
        for await (const page of savedAlbums()) {
          if (!alive) return;
          firstId ??= page[0]?.album.id ?? null;
          fresh.push(...page.map(albumToItem));
          if (showProgressively) setState((s) => ({ ...s, items: [...fresh] }));
        }
        if (!alive) return;
        writeLibrary({ items: fresh, total: fresh.length, firstId, checkedAt: Date.now() });
        synced.current = true;
        setState({ items: fresh, loading: false, refreshing: false, error: null });
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

const EMPTY: Track[] = [];

/** Raw top 50 tracks per time range, cached per range so flipping between them is instant. */
export function useTopTracks(enabled: boolean, range: TimeRange, onAuthError: () => void) {
  const [cache, setCache] = useState<Partial<Record<TimeRange, Track[]>>>({});
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!enabled || cache[range]) return;
    let alive = true;
    topTracks(range)
      .then((page) => alive && setCache((c) => ({ ...c, [range]: page.items })))
      .catch((e) => {
        if (e instanceof AuthError) onAuthError();
        else if (alive) setError(e);
      });
    return () => {
      alive = false;
    };
  }, [enabled, range, cache, onAuthError]);

  return { tracks: cache[range] ?? EMPTY, loading: !cache[range] && !error, error };
}

export type SearchFilter = 'all' | 'artist' | 'album' | 'track';

type SearchState = {
  artists: Artist[];
  albums: Album[];
  tracks: Track[];
  loading: boolean;
  hasMore: boolean;
  error: Error | null;
};
const NO_RESULTS: SearchState = { artists: [], albums: [], tracks: [], loading: false, hasMore: false, error: null };
const PAGE = 10;
const MIN_CHARS = 2;
const DEBOUNCE_MS = 450;
const MAX_OFFSET = 1000; // Spotify won't page search past this

/**
 * Debounced search. "all" asks for artists, albums and songs in one request (10 of each);
 * a single type can keep paging in via `loadMore`.
 */
export function useSearch(query: string, filter: SearchFilter, onAuthError: () => void) {
  const [state, setState] = useState<SearchState>(NO_RESULTS);
  const requestId = useRef(0);
  const nextOffset = useRef(0);

  const run = useCallback(
    async (q: string, f: SearchFilter, offset: number) => {
      const id = ++requestId.current;
      setState((s) => ({ ...s, loading: true }));
      try {
        // The "All" request already holds page one of every type, so switching filters is free.
        const fromAll = f !== 'all' && offset === 0 ? peekSearch(q, 'artist,album,track') : undefined;
        const r = fromAll ?? (await search(q, f === 'all' ? 'artist,album,track' : f, offset));
        if (id !== requestId.current) return; // a newer query won

        // Spotify occasionally puts nulls in search results.
        const merge = <T,>(prev: T[], page?: Paging<T>) => {
          const items = (page?.items ?? []).filter(Boolean);
          return offset === 0 ? items : [...prev, ...items];
        };
        const active = f === 'artist' ? r.artists : f === 'album' ? r.albums : f === 'track' ? r.tracks : undefined;
        nextOffset.current = offset + PAGE;
        setState((s) => ({
          artists: merge(s.artists, r.artists),
          albums: merge(s.albums, r.albums),
          tracks: merge(s.tracks, r.tracks),
          loading: false,
          hasMore: !!active?.next && offset + PAGE < MAX_OFFSET,
          error: null,
        }));
      } catch (e) {
        if (e instanceof AuthError) onAuthError();
        else if (id === requestId.current) setState((s) => ({ ...s, loading: false, error: e as Error }));
      }
    },
    [onAuthError],
  );

  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_CHARS) {
      requestId.current++;
      setState(NO_RESULTS);
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    const t = setTimeout(() => run(q, filter, 0), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query, filter, run]);

  const loadMore = useCallback(() => {
    const q = query.trim();
    if (q && state.hasMore && !state.loading) run(q, filter, nextOffset.current);
  }, [query, filter, state.hasMore, state.loading, run]);

  return { ...state, loadMore };
}

type ArtistAlbumsState = { items: ArtItem[]; loading: boolean; error: Error | null; next: string | null };
const IDLE: ArtistAlbumsState = { items: [], loading: false, error: null, next: null };

/**
 * An artist's releases, one page at a time (first page on open, more on request),
 * dropping duplicate editions (same name + type).
 */
export function useArtistAlbums(artistId: string | null, group: AlbumGroup, onAuthError: () => void) {
  const [state, setState] = useState<ArtistAlbumsState>(IDLE);
  const seen = useRef(new Set<string>());
  const requestId = useRef(0);

  const load = useCallback(
    async (next: string | null) => {
      if (!artistId) return;
      const id = ++requestId.current;
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const page = await artistAlbumsPage(artistId, group, next);
        if (id !== requestId.current) return;
        const fresh = page.items
          .filter((a) => {
            const k = `${a.album_type}:${a.name.toLowerCase()}`;
            if (seen.current.has(k)) return false;
            seen.current.add(k);
            return true;
          })
          .map(artistAlbumToItem);
        setState((s) => ({ items: next ? [...s.items, ...fresh] : fresh, loading: false, error: null, next: page.next }));
      } catch (e) {
        if (e instanceof AuthError) return onAuthError();
        if (id === requestId.current) setState((s) => ({ ...s, loading: false, error: e as Error }));
      }
    },
    [artistId, group, onAuthError],
  );

  useEffect(() => {
    seen.current = new Set();
    setState(artistId ? { ...IDLE, loading: true } : IDLE);
    load(null);
  }, [artistId, load]);

  const loadMore = useCallback(() => {
    if (state.next && !state.loading) load(state.next);
  }, [state.next, state.loading, load]);

  return { ...state, hasMore: !!state.next, loadMore };
}
