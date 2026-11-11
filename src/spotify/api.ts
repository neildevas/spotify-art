import { getAccessToken, logout } from './auth';
import { HOUR, MINUTE, cached, peek } from './cache';
import type {
  Album,
  AlbumGroup,
  AlbumTrack,
  Artist,
  ArtItem,
  CollectedRecord,
  Paging,
  SavedAlbum,
  TimeRange,
  RecordInfo,
  Track,
  TrackEntry,
  User,
} from './types';

const BASE = 'https://api.spotify.com/v1';

export class AuthError extends Error {}

/** Spotify asked us to back off for longer than is worth waiting in the background. */
export class RateLimitError extends Error {
  constructor(public retryAfterSec: number) {
    const mins = Math.ceil(retryAfterSec / 60);
    super(
      retryAfterSec < 90
        ? `Spotify is rate limiting requests — try again in ${Math.ceil(retryAfterSec)}s.`
        : `Spotify is rate limiting requests — try again in about ${mins < 90 ? `${mins} min` : `${Math.round(mins / 60)} h`}.`,
    );
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// One shared back-off window: after a 429, *every* request waits, instead of each one hammering
// Spotify and collecting its own 429.
let pausedUntil = 0;
const SHORT_WAIT_SEC = 20;

async function spotify<T>(path: string, attempt = 0): Promise<T> {
  const waitMs = pausedUntil - Date.now();
  if (waitMs > SHORT_WAIT_SEC * 1000) throw new RateLimitError(waitMs / 1000);
  if (waitMs > 0) await sleep(waitMs);

  const token = await getAccessToken();
  if (!token) throw new AuthError('Not signed in');

  const res = await fetch(path.startsWith('http') ? path : `${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401) {
    logout();
    throw new AuthError('Session expired');
  }
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get('Retry-After')) || 5;
    pausedUntil = Math.max(pausedUntil, Date.now() + retryAfter * 1000);
    if (retryAfter <= SHORT_WAIT_SEC && attempt < 2) {
      await sleep(retryAfter * 1000);
      return spotify<T>(path, attempt + 1);
    }
    throw new RateLimitError(retryAfter);
  }
  if (!res.ok) throw new Error(`Spotify ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

/** Cached GET. Same path = same request, shared and reused until it's older than `ttlMs`. */
const get = <T,>(path: string, ttlMs: number, persist = false) =>
  cached(path, () => spotify<T>(path), { ttlMs, persist });

export const getMe = () => get<User>('/me', 24 * HOUR, true);

/** One-album peek at the library: cheap way to tell whether a cached library is still current. */
export const savedAlbumsHead = () => spotify<Paging<SavedAlbum>>('/me/albums?limit=1');

/** Yields saved albums page by page (50 at a time) so the grid can fill in progressively. */
export async function* savedAlbums(): AsyncGenerator<SavedAlbum[]> {
  let next: string | null = '/me/albums?limit=50';
  while (next) {
    const page: Paging<SavedAlbum> = await get<Paging<SavedAlbum>>(next, 0); // dedupe only
    yield page.items;
    next = page.next;
  }
}

// Top tracks only shift slowly; six hours is plenty fresh.
export const topTracks = (range: TimeRange) =>
  get<Paging<Track>>(`/me/top/tracks?limit=50&time_range=${range}`, 6 * HOUR, true);

export type SearchResponse = { artists?: Paging<Artist>; albums?: Paging<Album>; tracks?: Paging<Track> };

/** Development-mode apps get at most 10 results per type per request; page with `offset`. */
const searchPath = (query: string, types: string, offset: number) =>
  `/search?type=${types}&limit=10&offset=${offset}&q=${encodeURIComponent(query.toLowerCase())}`;
const SEARCH_TTL = 30 * MINUTE;

export const search = (query: string, types: string, offset = 0) =>
  get<SearchResponse>(searchPath(query, types, offset), SEARCH_TTL);

/** A search result we already have in memory, without making a request. */
export const peekSearch = (query: string, types: string, offset = 0) =>
  peek<SearchResponse>(searchPath(query, types, offset), { ttlMs: SEARCH_TTL });

export const getArtist = (id: string) => get<Artist>(`/artists/${id}`, 6 * HOUR);

/** Full tracklist for one album (first 50 tracks, which covers nearly every record). */
export const getAlbumTracks = (id: string): Promise<TrackEntry[]> =>
  get<{ tracks: Paging<AlbumTrack> }>(`/albums/${id}`, HOUR).then((a) =>
    a.tracks.items.map((t) => ({
      id: t.id,
      rank: t.track_number,
      title: t.name,
      duration: formatDuration(t.duration_ms),
      url: t.external_urls.spotify,
    })),
  );

const GROUPS: Record<AlbumGroup, string> = { album: 'album', single: 'single', all: 'album,single,compilation' };

// Whether this app may ask for 50 releases per page; learned on the first try so we don't
// pay for a failed request on every artist page.
let artistPageSize: 50 | 10 = 50;

/** Yields an artist's releases page by page. Pages are cached for an hour. */
export async function* artistAlbums(artistId: string, group: AlbumGroup): AsyncGenerator<Album[]> {
  const base = `/artists/${artistId}/albums?include_groups=${GROUPS[group]}`;
  let first: Paging<Album>;
  try {
    first = await get<Paging<Album>>(`${base}&limit=${artistPageSize}`, HOUR);
  } catch (e) {
    if (artistPageSize === 50 && e instanceof Error && e.message.includes('400')) {
      artistPageSize = 10;
      first = await get<Paging<Album>>(`${base}&limit=10`, HOUR);
    } else throw e;
  }
  yield first.items;
  let next = first.next;
  while (next) {
    const page: Paging<Album> = await get<Paging<Album>>(next, HOUR);
    yield page.items;
    next = page.next;
  }
}

/** Largest image, plus one around 300px for small slots. Works for albums and artists. */
export function pickImageSet(images: { url: string; width: number | null }[]) {
  const sorted = [...images].sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
  const image = sorted[0]?.url ?? '';
  const thumb = sorted.find((i) => (i.width ?? 0) <= 320)?.url ?? image;
  return { image, thumb };
}

// --- normalizing into ArtItem ---

const pickImages = (album: Album) => pickImageSet(album.images);

const albumTypeLabel = (album: Album) =>
  album.album_type === 'album' ? 'Album' : album.album_type === 'single' ? 'Single / EP' : 'Compilation';

const artistNames = (a: { name: string }[]) => a.map((x) => x.name).join(', ');
const artistRefs = (a: { id: string; name: string }[]) => a.map(({ id, name }) => ({ id, name }));

export function albumRecord(album: Album): RecordInfo {
  return {
    id: album.id,
    name: album.name,
    artists: artistRefs(album.artists),
    year: album.release_date.slice(0, 4),
    type: album.album_type,
    totalTracks: album.total_tracks,
    ...pickImages(album),
    url: album.external_urls.spotify,
  };
}

export function formatDuration(ms: number) {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function albumToItem({ album, added_at }: SavedAlbum): ArtItem {
  return {
    key: `album-${album.id}`,
    ...pickImages(album),
    title: album.name,
    subtitle: artistNames(album.artists),
    year: album.release_date.slice(0, 4),
    details: [
      albumTypeLabel(album),
      `${album.total_tracks} track${album.total_tracks === 1 ? '' : 's'}`,
      `Saved ${new Date(added_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`,
    ],
    url: album.external_urls.spotify,
    albumId: album.id,
    artists: artistRefs(album.artists),
    record: albumRecord(album),
  };
}

export function artistAlbumToItem(album: Album): ArtItem {
  return {
    key: `artistalbum-${album.id}`,
    ...pickImages(album),
    title: album.name,
    subtitle: artistNames(album.artists),
    year: album.release_date.slice(0, 4),
    details: [albumTypeLabel(album), `${album.total_tracks} track${album.total_tracks === 1 ? '' : 's'}`],
    url: album.external_urls.spotify,
    albumId: album.id,
    artists: artistRefs(album.artists),
    record: albumRecord(album),
  };
}

export const searchAlbumToItem = (album: Album): ArtItem => ({
  ...artistAlbumToItem(album),
  key: `search-album-${album.id}`,
});

export function searchTrackToItem(track: Track): ArtItem {
  return {
    key: `search-track-${track.id}`,
    ...pickImages(track.album),
    title: track.name,
    subtitle: artistNames(track.artists),
    year: track.album.release_date.slice(0, 4),
    details: [`From ${track.album.name}`, formatDuration(track.duration_ms), ...(track.explicit ? ['Explicit'] : [])],
    url: track.external_urls.spotify,
    albumId: track.album.id,
    highlightTrackId: track.id,
    artists: artistRefs(track.artists),
    record: albumRecord(track.album),
  };
}

/** Collapses top tracks into one tile per album, ordered by each album's best-ranked track. */
export function groupTracksByAlbum(tracks: Track[]): ArtItem[] {
  const groups = new Map<string, { album: Album; entries: { track: Track; rank: number }[] }>();
  tracks.forEach((track, i) => {
    const g = groups.get(track.album.id) ?? { album: track.album, entries: [] };
    g.entries.push({ track, rank: i + 1 });
    groups.set(track.album.id, g);
  });

  return [...groups.values()].map(({ album, entries }) => ({
    key: `topalbum-${album.id}`,
    ...pickImages(album),
    title: album.name,
    subtitle: artistNames(album.artists),
    year: album.release_date.slice(0, 4),
    details: [`${entries.length} of your top ${tracks.length}`, `Best rank #${entries[0].rank}`],
    url: album.external_urls.spotify,
    albumId: album.id,
    artists: artistRefs(album.artists),
    record: albumRecord(album),
    rank: entries[0].rank,
    tracks: entries.map(({ track, rank }) => ({
      rank,
      title: track.name,
      duration: formatDuration(track.duration_ms),
      url: track.external_urls.spotify,
      id: track.id,
    })),
  }));
}

export function trackToItem(track: Track, index: number): ArtItem {
  return {
    key: `track-${track.id}`,
    ...pickImages(track.album),
    title: track.name,
    subtitle: artistNames(track.artists),
    year: track.album.release_date.slice(0, 4),
    details: [`From ${track.album.name}`, formatDuration(track.duration_ms), ...(track.explicit ? ['Explicit'] : [])],
    url: track.external_urls.spotify,
    albumId: track.album.id,
    highlightTrackId: track.id,
    artists: artistRefs(track.artists),
    record: albumRecord(track.album),
    rank: index + 1,
  };
}

const TYPE_LABEL: Record<RecordInfo['type'], string> = { album: 'Album', single: 'Single / EP', compilation: 'Compilation' };

export function recordToItem(r: CollectedRecord): ArtItem {
  return {
    key: `record-${r.id}`,
    image: r.image,
    thumb: r.thumb,
    title: r.name,
    subtitle: artistNames(r.artists),
    year: r.year,
    details: [
      TYPE_LABEL[r.type],
      `${r.totalTracks} track${r.totalTracks === 1 ? '' : 's'}`,
      `Added ${new Date(r.addedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`,
    ],
    url: r.url,
    albumId: r.id,
    artists: r.artists,
    record: r,
  };
}
