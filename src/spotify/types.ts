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

/** Track as it appears inside a full album object (no album/images of its own). */
export type AlbumTrack = {
  id: string;
  name: string;
  duration_ms: number;
  track_number: number;
  explicit: boolean;
  external_urls: { spotify: string };
};

export type Paging<T> = { items: T[]; next: string | null; total: number; limit: number; offset: number };

export type SavedAlbum = { added_at: string; album: Album };

export type Artist = {
  id: string;
  name: string;
  images: SpotifyImage[];
  genres?: string[];
  external_urls: { spotify: string };
};

/** Which releases to show on an artist page. */
export type AlbumGroup = 'album' | 'single' | 'all';

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
  tracks?: TrackEntry[];
  /** Album to fetch a full tracklist for in the detail view (when `tracks` isn't set). */
  albumId?: string;
  /** Song to highlight in that tracklist. */
  highlightTrackId?: string;
  /** Linkable artists, so the detail view can jump to an artist page. */
  artists?: { id: string; name: string }[];
  /** The record (album / single / EP) this tile belongs to, so it can be added to the collection. */
  record?: RecordInfo;
};

/** Everything needed to show a record without asking Spotify again. */
export type RecordInfo = {
  id: string; // Spotify album id
  name: string;
  artists: { id: string; name: string }[];
  year: string;
  type: Album['album_type'];
  totalTracks: number;
  image: string;
  thumb: string;
  url: string;
};

/** A record in the user's own (local) collection. */
export type CollectedRecord = RecordInfo & { addedAt: number };

export type TrackEntry = { rank: number; title: string; duration: string; url: string; id?: string };
