import { useEffect, useState } from 'react';
import { getAlbumTracks } from '../spotify/api';
import type { TrackEntry } from '../spotify/types';

// Tracklists never really change, so keep the last few hundred around between visits.
const KEY = 'sleeve.tracklists.v1';
const MAX_KEPT = 300;
// Wait this long before fetching, so arrowing quickly through covers doesn't fire a request per cover.
const SETTLE_MS = 400;

const cache = new Map<string, TrackEntry[]>(load());

function load(): [string, TrackEntry[]][] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]');
  } catch {
    return [];
  }
}

function remember(albumId: string, list: TrackEntry[]) {
  cache.delete(albumId);
  cache.set(albumId, list); // Map keeps insertion order → oldest first
  while (cache.size > MAX_KEPT) cache.delete(cache.keys().next().value!);
  try {
    localStorage.setItem(KEY, JSON.stringify([...cache]));
  } catch {
    /* ignore */
  }
}

/** Lazily loads (and caches) an album's tracklist for the detail view. Pass undefined to skip. */
export function useAlbumTracks(albumId: string | undefined) {
  const [tracks, setTracks] = useState<TrackEntry[] | null>(albumId ? cache.get(albumId) ?? null : null);

  useEffect(() => {
    if (!albumId) return setTracks(null);
    const hit = cache.get(albumId);
    if (hit) return setTracks(hit);

    setTracks(null);
    let alive = true;
    const t = setTimeout(() => {
      getAlbumTracks(albumId)
        .then((list) => {
          remember(albumId, list);
          if (alive) setTracks(list);
        })
        .catch(() => {});
    }, SETTLE_MS);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [albumId]);

  return tracks;
}
