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

/**
 * Spotify rate-limits groups of endpoints separately (the groups aren't published), so we back off
 * per area instead of globally: a limit on artist pages shouldn't block search, and vice versa.
 */
type Bucket = 'search' | 'artists' | 'albums' | 'top' | 'library' | 'profile' | 'player' | 'other';

const BUCKET_LABEL: Record<Bucket, string> = {
  search: 'search',
  artists: 'artist pages',
  albums: 'album tracklists',
  top: 'top tracks',
  library: 'your saved albums',
  profile: 'your profile',
  player: 'playback',
  other: 'this request',
};

function bucketFor(path: string): Bucket {
  const p = path.replace(BASE, '');
  if (p.startsWith('/search')) return 'search';
  if (p.startsWith('/artists')) return 'artists';
  if (p.startsWith('/albums')) return 'albums';
  if (p.startsWith('/me/top')) return 'top';
  if (p.startsWith('/me/player')) return 'player';
  if (p.startsWith('/me/albums')) return 'library';
  if (p === '/me' || p.startsWith('/me?')) return 'profile';
  return 'other';
}

function describeWait(sec: number, estimated: boolean) {
  if (estimated) return sec < 120 ? 'in a minute or so' : `in about ${Math.round(sec / 60)} min`;
  if (sec < 90) return `in ${Math.ceil(sec)}s`;
  const mins = Math.ceil(sec / 60);
  return `in about ${mins < 90 ? `${mins} min` : `${Math.round(mins / 60)} h`}`;
}

/** Spotify asked us to back off for longer than is worth waiting in the background. */
export class RateLimitError extends Error {
  constructor(
    public retryAfterSec: number,
    public area: string,
    public quota = false,
    estimated = false,
  ) {
    super(
      quota
        ? `You've used up Spotify's request quota for ${area} — try again ${describeWait(retryAfterSec, estimated)}.`
        : `Spotify is rate limiting ${area} — try again ${describeWait(retryAfterSec, estimated)}.`,
    );
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const pausedUntil = new Map<Bucket, { until: number; quota: boolean; estimated: boolean }>();
const SHORT_WAIT_SEC = 20;
// Browsers often can't read Spotify's Retry-After header (it isn't exposed via CORS), so when it's
// missing we guess on the cautious side rather than retrying almost immediately.
const FALLBACK_RATE_SEC = 60;
const FALLBACK_QUOTA_SEC = 15 * 60;

async function readReason(res: Response): Promise<string | undefined> {
  try {
    const body = await res.json();
    return body?.reason ?? body?.error?.reason;
  } catch {
    return undefined;
  }
}

type RequestInit = { method?: 'GET' | 'PUT' | 'POST'; body?: unknown };

async function spotify<T>(path: string, init: RequestInit = {}, attempt = 0): Promise<T> {
  const bucket = bucketFor(path);
  const pause = pausedUntil.get(bucket);
  const waitMs = pause ? pause.until - Date.now() : 0;
  if (pause && waitMs > SHORT_WAIT_SEC * 1000)
    throw new RateLimitError(waitMs / 1000, BUCKET_LABEL[bucket], pause.quota, pause.estimated);
  if (waitMs > 0) await sleep(waitMs);

  const token = await getAccessToken();
  if (!token) throw new AuthError('Not signed in');

  const res = await fetch(path.startsWith('http') ? path : `${BASE}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });

  if (res.status === 401) {
    logout();
    throw new AuthError('Session expired');
  }
  if (res.status === 429) {
    const header = Number(res.headers.get('Retry-After'));
    const quota = (await readReason(res)) === 'QUOTA_EXCEEDED';
    const estimated = !header;
    const retryAfter = header || (quota ? FALLBACK_QUOTA_SEC : FALLBACK_RATE_SEC);
    const prev = pausedUntil.get(bucket);
    pausedUntil.set(bucket, {
      until: Math.max(prev?.until ?? 0, Date.now() + retryAfter * 1000),
      quota,
      estimated,
    });
    // Only retry quietly when Spotify told us exactly how long, and it's short.
    if (!quota && !estimated && retryAfter <= SHORT_WAIT_SEC && attempt < 2) {
      await sleep(retryAfter * 1000);
      return spotify<T>(path, init, attempt + 1);
    }
    throw new RateLimitError(retryAfter, BUCKET_LABEL[bucket], quota, estimated);
  }
  if (!res.ok) throw new Error(`Spotify ${res.status}: ${await res.text()}`);
  if (res.status === 204 || res.headers.get('content-length') === '0') return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** Cached GET. Same path = same request, shared and reused until it's older than `ttlMs`. */
const get = <T,>(path: string, ttlMs: number, persist = false) =>
  cached(path, () => spotify<T>(path), { ttlMs, persist });

export const getMe = () => get<User>('/me', 24 * HOUR, true);

/** One-album peek at the library: cheap way to tell whether a cached library is still current. */
/**
 * Start an album on the given device (our in-browser player), optionally at a track index.
 * This is the only Web API call playback needs; pause/skip/seek/volume go through the SDK.
 */
export const playAlbum = (deviceId: string, albumId: string, position = 0) =>
  spotify<void>(`/me/player/play?device_id=${encodeURIComponent(deviceId)}`, {
    method: 'PUT',
    body: { context_uri: `spotify:album:${albumId}`, offset: { position } },
  });

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

/**
 * One page of an artist's releases. Pass the previous page's `next` URL to continue.
 * Pages are cached for an hour.
 */
export async function artistAlbumsPage(artistId: string, group: AlbumGroup, next?: string | null) {
  if (next) return get<Paging<Album>>(next, HOUR);
  const base = `/artists/${artistId}/albums?include_groups=${GROUPS[group]}`;
  try {
    return await get<Paging<Album>>(`${base}&limit=${artistPageSize}`, HOUR);
  } catch (e) {
    if (artistPageSize === 50 && e instanceof Error && e.message.includes('Spotify 400')) {
      artistPageSize = 10;
      return get<Paging<Album>>(`${base}&limit=10`, HOUR);
    }
    throw e;
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
