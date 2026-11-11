import { getAccessToken, logout } from './auth';
import type { Album, ArtItem, Paging, SavedAlbum, TimeRange, Track, User } from './types';

const BASE = 'https://api.spotify.com/v1';

export class AuthError extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function spotify<T>(path: string, attempt = 0): Promise<T> {
  const token = await getAccessToken();
  if (!token) throw new AuthError('Not signed in');

  const res = await fetch(path.startsWith('http') ? path : `${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401) {
    logout();
    throw new AuthError('Session expired');
  }
  if (res.status === 429 && attempt < 3) {
    const wait = Number(res.headers.get('Retry-After') ?? '2');
    await sleep(wait * 1000);
    return spotify<T>(path, attempt + 1);
  }
  if (!res.ok) throw new Error(`Spotify ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

export const getMe = () => spotify<User>('/me');

/** Yields saved albums page by page (50 at a time) so the grid can fill in progressively. */
export async function* savedAlbums(): AsyncGenerator<SavedAlbum[]> {
  let next: string | null = '/me/albums?limit=50';
  while (next) {
    const page: Paging<SavedAlbum> = await spotify<Paging<SavedAlbum>>(next);
    yield page.items;
    next = page.next;
  }
}

export const topTracks = (range: TimeRange) =>
  spotify<Paging<Track>>(`/me/top/tracks?limit=50&time_range=${range}`);

// --- normalizing into ArtItem ---

function pickImages(album: Album) {
  // Spotify returns images widest-first (640, 300, 64).
  const sorted = [...album.images].sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
  const image = sorted[0]?.url ?? '';
  const thumb = sorted.find((i) => (i.width ?? 0) <= 320)?.url ?? image;
  return { image, thumb };
}

const artistNames = (a: { name: string }[]) => a.map((x) => x.name).join(', ');

function formatDuration(ms: number) {
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
      album.album_type === 'album' ? 'Album' : album.album_type === 'single' ? 'Single / EP' : 'Compilation',
      `${album.total_tracks} track${album.total_tracks === 1 ? '' : 's'}`,
      `Saved ${new Date(added_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`,
    ],
    url: album.external_urls.spotify,
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
    rank: entries[0].rank,
    tracks: entries.map(({ track, rank }) => ({
      rank,
      title: track.name,
      duration: formatDuration(track.duration_ms),
      url: track.external_urls.spotify,
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
    rank: index + 1,
  };
}
