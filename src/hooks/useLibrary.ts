import { useEffect, useRef, useState } from 'react';
import { AuthError, albumToItem, savedAlbums, topTracks } from '../spotify/api';
import type { ArtItem, TimeRange, Track } from '../spotify/types';

type State = { items: ArtItem[]; loading: boolean; total: number | null; error: Error | null };

/** Streams the whole saved-albums library in, 50 at a time. */
export function useSavedAlbums(enabled: boolean, onAuthError: () => void) {
  const [state, setState] = useState<State>({ items: [], loading: true, total: null, error: null });
  const started = useRef(false);

  useEffect(() => {
    if (!enabled || started.current) return;
    started.current = true;
    let alive = true;

    (async () => {
      try {
        for await (const page of savedAlbums()) {
          if (!alive) return;
          setState((s) => ({ ...s, items: [...s.items, ...page.map(albumToItem)] }));
        }
        if (alive) setState((s) => ({ ...s, loading: false, total: s.items.length }));
      } catch (error) {
        if (error instanceof AuthError) return onAuthError();
        if (alive) setState((s) => ({ ...s, loading: false, error: error as Error }));
      }
    })();

    return () => {
      alive = false;
      started.current = false;
    };
  }, [enabled, onAuthError]);

  return state;
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
