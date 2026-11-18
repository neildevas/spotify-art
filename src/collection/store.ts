import { useSyncExternalStore } from 'react';
import type { Artist, CollectedRecord, FavTrack, RecordInfo } from '../spotify/types';

/**
 * The user's own record collection. Lives in this browser's localStorage, never on Spotify.
 * A tiny external store so any component can read it and every view updates together
 * (including other open tabs, via the `storage` event).
 */
const KEY = 'sleeve.collection.v1';

let records: CollectedRecord[] = load();
const listeners = new Set<() => void>();

/** Artists saved from their artist page — a shortcut back to all their releases. */
export type SavedArtist = {
  id: string;
  name: string;
  image?: string; // only shown on the artist's own page
  addedAt: number;
  /** Your liner notes: why this artist matters to you. */
  note?: string;
  /** Retired top shelf. Old pins are moved into the collection on load; nothing reads this otherwise. */
  pinned?: RecordInfo[];
  /** Songs you hearted from their albums, in the order you added them. */
  favTracks?: FavTrack[];
};

const ARTISTS_KEY = 'sleeve.artists.v1';
let artists: SavedArtist[] = loadArtists();

function loadArtists(): SavedArtist[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(ARTISTS_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function commitArtists(next: SavedArtist[]) {
  artists = next;
  try {
    localStorage.setItem(ARTISTS_KEY, JSON.stringify(artists));
  } catch {
    /* keep the in-memory copy */
  }
  listeners.forEach((l) => l());
}

function load(): CollectedRecord[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function commit(next: CollectedRecord[]) {
  records = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(records));
  } catch {
    /* storage full or blocked — keep the in-memory copy */
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) records = load();
    else if (e.key === ARTISTS_KEY) artists = loadArtists();
    else return;
    listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export const collection = {
  add(record: RecordInfo) {
    if (records.some((r) => r.id === record.id)) return;
    commit([{ ...record, addedAt: Date.now() }, ...records]);
  },
  remove(id: string) {
    commit(records.filter((r) => r.id !== id));
  },
  toggle(record: RecordInfo) {
    if (records.some((r) => r.id === record.id)) this.remove(record.id);
    else this.add(record);
  },
  /** JSON backup, since localStorage only lives in this browser. */
  exportJson() {
    return JSON.stringify({ app: 'sleeve', version: 2, records, artists }, null, 2);
  },
  /** Merges a backup in (records and saved artists); existing items are kept. Returns how many were new. */
  importJson(text: string) {
    const data = JSON.parse(text);
    const incoming: CollectedRecord[] = Array.isArray(data) ? data : data?.records;
    if (!Array.isArray(incoming)) throw new Error('Not a Sleeve collection file');
    const have = new Set(records.map((r) => r.id));
    const fresh = incoming.filter((r) => r && typeof r.id === 'string' && r.image && !have.has(r.id));
    commit([...records, ...fresh].sort((a, b) => b.addedAt - a.addedAt));

    const incomingArtists: SavedArtist[] = Array.isArray(data?.artists) ? data.artists : [];
    const haveArtists = new Set(artists.map((a) => a.id));
    const freshArtists = incomingArtists.filter((a) => a && typeof a.id === 'string' && a.name && !haveArtists.has(a.id));
    if (freshArtists.length) commitArtists([...artists, ...freshArtists].sort((a, b) => b.addedAt - a.addedAt));
    collectPinnedRecords();

    return fresh.length + freshArtists.length;
  },
};

export function useCollection() {
  return useSyncExternalStore(subscribe, () => records);
}

export function useInCollection(id: string | undefined) {
  return useSyncExternalStore(subscribe, () => (id ? records.some((r) => r.id === id) : false));
}

export const savedArtists = {
  add(a: Artist) {
    if (artists.some((x) => x.id === a.id)) return;
    const image = [...a.images].sort((x, y) => (y.width ?? 0) - (x.width ?? 0))[0]?.url;
    commitArtists([{ id: a.id, name: a.name, image, addedAt: Date.now() }, ...artists]);
  },
  remove(id: string) {
    commitArtists(artists.filter((x) => x.id !== id));
  },
  toggle(a: Artist) {
    if (artists.some((x) => x.id === a.id)) this.remove(a.id);
    else this.add(a);
  },
  /** Keep a saved artist's name and photo current with what Spotify now says. */
  refreshInfo(a: Artist) {
    const cur = artists.find((x) => x.id === a.id);
    if (!cur) return;
    const image = [...a.images].sort((x, y) => (y.width ?? 0) - (x.width ?? 0))[0]?.url ?? cur.image;
    if (cur.name === a.name && cur.image === image) return;
    commitArtists(artists.map((x) => (x.id === a.id ? { ...x, name: a.name, image } : x)));
  },
  update(id: string, patch: Partial<Pick<SavedArtist, 'note' | 'pinned' | 'favTracks'>>) {
    commitArtists(artists.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  },
  toggleFav(id: string, track: FavTrack) {
    const a = artists.find((x) => x.id === id);
    if (!a) return;
    const favs = a.favTracks ?? [];
    this.update(id, {
      favTracks: favs.some((t) => t.id === track.id) ? favs.filter((t) => t.id !== track.id) : [...favs, track],
    });
  },
};

export function useSavedArtist(id: string | undefined) {
  return useSyncExternalStore(subscribe, () => (id ? artists.find((a) => a.id === id) : undefined));
}

export function useSavedArtists() {
  return useSyncExternalStore(subscribe, () => artists);
}

export function useIsArtistSaved(id: string | undefined) {
  return useSyncExternalStore(subscribe, () => (id ? artists.some((a) => a.id === id) : false));
}

/** The top shelf is retired: make sure every record that was ever pinned is in the collection. */
function collectPinnedRecords() {
  const have = new Set(records.map((r) => r.id));
  const missing: CollectedRecord[] = [];
  for (const a of artists)
    for (const r of a.pinned ?? []) {
      if (have.has(r.id)) continue;
      have.add(r.id);
      missing.push({ ...r, addedAt: a.addedAt });
    }
  if (missing.length) commit([...records, ...missing].sort((x, y) => y.addedAt - x.addedAt));
}
collectPinnedRecords();
