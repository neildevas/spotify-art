export type SpotifyImage = { url: string; width: number | null; height: number | null };

export type SimpleArtist = { id: string; name: string; external_urls: { spotify: string } };

export type Album = {
  id: string;
  name: string;
  album_type: 'album' | 'single' | 'compilation';
  release_date: string;
  total_tracks: number;
  images: SpotifyImage[];
  artists: SimpleArtist[];
  external_urls: { spotify: string };
};

export type Track = {
  id: string;
  name: string;
  duration_ms: number;
  explicit: boolean;
  album: Album;
  artists: SimpleArtist[];
  external_urls: { spotify: string };
};

export type Paging<T> = { items: T[]; next: string | null; total: number; limit: number; offset: number };

export type SavedAlbum = { added_at: string; album: Album };

export type User = { id: string; display_name: string | null; images: SpotifyImage[] };

export type TimeRange = 'short_term' | 'medium_term' | 'long_term';

/** One normalized thing to put on the wall: an album or a track, shown by its artwork. */
export type ArtItem = {
  key: string;
  image: string; // largest
  thumb: string; // ~300px
  title: string;
  subtitle: string;
  year: string;
  details: string[];
  url: string;
  rank?: number;
  /** Present on grouped top-track albums: the user's top tracks from this album, best rank first. */
  tracks?: { rank: number; title: string; duration: string; url: string }[];
};
