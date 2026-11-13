// Minimal types for the Spotify Web Playback SDK (https://sdk.scdn.co/spotify-player.js).
declare namespace Spotify {
  interface Image { url: string; width?: number | null; height?: number | null }
  interface Entity { uri: string; name: string }
  interface Track {
    id: string | null;
    uri: string;
    name: string;
    duration_ms: number;
    album: Entity & { images: Image[] };
    artists: Entity[];
  }
  interface PlaybackState {
    context: { uri: string | null };
    paused: boolean;
    position: number;
    duration: number;
    timestamp: number;
    track_window: { current_track: Track; previous_tracks: Track[]; next_tracks: Track[] };
  }
  interface Error { message: string }
  interface ReadyEvent { device_id: string }

  interface PlayerInit {
    name: string;
    getOAuthToken: (cb: (token: string) => void) => void;
    volume?: number;
  }

  class Player {
    constructor(options: PlayerInit);
    connect(): Promise<boolean>;
    disconnect(): void;
    activateElement(): Promise<void>;
    getCurrentState(): Promise<PlaybackState | null>;
    togglePlay(): Promise<void>;
    pause(): Promise<void>;
    resume(): Promise<void>;
    nextTrack(): Promise<void>;
    previousTrack(): Promise<void>;
    seek(positionMs: number): Promise<void>;
    setVolume(volume: number): Promise<void>;
    addListener(event: 'ready' | 'not_ready', cb: (e: ReadyEvent) => void): boolean;
    addListener(event: 'player_state_changed', cb: (state: PlaybackState | null) => void): boolean;
    addListener(
      event: 'initialization_error' | 'authentication_error' | 'account_error' | 'playback_error' | 'autoplay_failed',
      cb: (e: Error) => void,
    ): boolean;
  }
}

interface Window {
  Spotify?: typeof Spotify;
  onSpotifyWebPlaybackSDKReady?: () => void;
}
