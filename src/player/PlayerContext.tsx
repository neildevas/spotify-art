import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  RateLimitError,
  addToQueue as apiAddToQueue,
  playAlbum as apiPlayAlbum,
  playTracks as apiPlayTracks,
} from '../spotify/api';
import { PLAYBACK_SCOPES, getAccessToken, hasScopes } from '../spotify/auth';

/**
 * In-browser playback via the Spotify Web Playback SDK. The SDK script is only loaded the first
 * time something is played. Starting an album is one Web API call; everything after that
 * (pause, skip, seek, volume) talks to the SDK directly, so it doesn't count toward rate limits.
 */

export type NowPlaying = {
  albumId: string | null;
  trackId: string | null;
  trackName: string;
  artists: string;
  albumName: string;
  image: string;
  paused: boolean;
  position: number;
  duration: number;
  /** When `position` was measured, for smooth progress between SDK updates. */
  measuredAt: number;
};

type Status = 'idle' | 'connecting' | 'ready' | 'error';

type PlayerApi = {
  status: Status;
  error: string | null;
  /** Session predates playback scopes — user needs to sign in with Spotify again. */
  needsReconnect: boolean;
  nowPlaying: NowPlaying | null;
  volume: number;
  playAlbum: (albumId: string, trackIndex?: number) => Promise<void>;
  /** Play a list of songs in order, starting at `index`. */
  playTracks: (trackIds: string[], index?: number) => Promise<void>;
  /** Add a song to Spotify's queue (or just play it, if nothing is playing yet). */
  queueTrack: (trackId: string, title: string) => Promise<void>;
  /** Queue a whole record: its songs go onto Spotify's queue in order (or it just plays, if nothing is on). */
  queueRecord: (albumId: string, trackIds: string[], title: string) => Promise<void>;
  /** Bumps whenever something is added to the queue, so an open "Up next" list can refresh. */
  queueVersion: number;
  /** A short, friendly confirmation (e.g. "Added to queue"); clears itself. */
  notice: string | null;
  toggle: () => void;
  next: () => void;
  previous: () => void;
  seek: (ms: number) => void;
  setVolume: (v: number) => void;
  dismissError: () => void;
};

const PlayerContext = createContext<PlayerApi | null>(null);

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used inside <PlayerProvider>');
  return ctx;
}

const SDK_URL = 'https://sdk.scdn.co/spotify-player.js';
let sdkPromise: Promise<void> | null = null;

function loadSdk() {
  sdkPromise ??= new Promise<void>((resolve, reject) => {
    if (window.Spotify) return resolve();
    window.onSpotifyWebPlaybackSDKReady = () => resolve();
    const script = document.createElement('script');
    script.src = SDK_URL;
    script.async = true;
    script.onerror = () => {
      sdkPromise = null;
      reject(new Error('Couldn’t load the Spotify player.'));
    };
    document.body.appendChild(script);
  });
  return sdkPromise;
}

const albumIdFromUri = (uri: string | null | undefined) => (uri?.startsWith('spotify:album:') ? uri.split(':')[2] : null);

function toNowPlaying(s: Spotify.PlaybackState): NowPlaying {
  const t = s.track_window.current_track;
  const images = [...t.album.images].sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
  return {
    albumId: albumIdFromUri(t.album.uri) ?? albumIdFromUri(s.context.uri),
    trackId: t.id,
    trackName: t.name,
    artists: t.artists.map((a) => a.name).join(', '),
    albumName: t.album.name,
    image: images.find((i) => (i.width ?? 0) <= 320)?.url ?? images[0]?.url ?? '',
    paused: s.paused,
    position: s.position,
    duration: s.duration,
    measuredAt: Date.now(),
  };
}

const VOLUME_KEY = 'sleeve.volume';
// Queuing a record: pause between songs, and how long a rate-limit wait we'll sit through before giving up.
const QUEUE_GAP_MS = 300;
const MAX_QUEUE_WAIT_SEC = 20;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [queueVersion, setQueueVersion] = useState(0);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 2600);
    return () => clearTimeout(t);
  }, [notice]);
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null);
  const [volume, setVolumeState] = useState(() => {
    const v = Number(localStorage.getItem(VOLUME_KEY));
    return Number.isFinite(v) && v > 0 ? v : 0.6;
  });
  const needsReconnect = !hasScopes(PLAYBACK_SCOPES);

  const player = useRef<Spotify.Player | null>(null);
  const device = useRef<Promise<string> | null>(null);

  /** Creates and connects the in-browser player once; resolves with its device id. */
  const ensureDevice = useCallback(() => {
    device.current ??= (async () => {
      setStatus('connecting');
      await loadSdk();
      return new Promise<string>((resolve, reject) => {
        const p = new window.Spotify!.Player({
          name: 'Sleeve',
          volume,
          getOAuthToken: (cb) => {
            getAccessToken().then((t) => t && cb(t));
          },
        });
        const fail = (message: string) => {
          device.current = null;
          setStatus('error');
          setError(message);
          reject(Object.assign(new Error(message), { fromPlayer: true }));
        };
        p.addListener('ready', ({ device_id }) => {
          setStatus('ready');
          resolve(device_id);
        });
        p.addListener('not_ready', () => setStatus('connecting'));
        p.addListener('player_state_changed', (s) => setNowPlaying(s ? toNowPlaying(s) : null));
        p.addListener('initialization_error', () =>
          fail('This browser can’t play Spotify here (it needs encrypted media support — try Chrome, Edge or Firefox).'),
        );
        p.addListener('authentication_error', () => fail('Spotify didn’t accept this session for playback. Try signing in again.'));
        p.addListener('account_error', () => fail('Playing music in the browser needs Spotify Premium.'));
        p.addListener('playback_error', (e) => setError(`Playback error: ${e.message}`));
        p.addListener('autoplay_failed', () => setError('Your browser blocked autoplay — press play again.'));
        player.current = p;
        p.connect().then((ok) => !ok && fail('Couldn’t connect to the Spotify player.'));
      });
    })();
    return device.current;
  }, [volume]);

  useEffect(() => () => player.current?.disconnect(), []);

  const playAlbum = useCallback(
    async (albumId: string, trackIndex?: number) => {
      if (needsReconnect) return;
      // Same album, no specific track: just pause/resume.
      if (trackIndex === undefined && nowPlaying?.albumId === albumId && player.current) {
        player.current.togglePlay();
        return;
      }
      // Browsers only allow audio after a user gesture; this must run before any await.
      player.current?.activateElement();
      setError(null);
      try {
        const deviceId = await ensureDevice();
        player.current?.activateElement();
        await apiPlayAlbum(deviceId, albumId, trackIndex ?? 0);
      } catch (e) {
        if (e instanceof RateLimitError) setError(e.message);
        else if (!(e as { fromPlayer?: boolean }).fromPlayer) setError(`Couldn’t start playback: ${(e as Error).message}`);
      }
    },
    [needsReconnect, nowPlaying?.albumId, ensureDevice],
  );

  const playTracks = useCallback(
    async (trackIds: string[], index = 0) => {
      if (needsReconnect || !trackIds.length) return;
      // Same song already loaded: just pause/resume.
      if (nowPlaying?.trackId === trackIds[index] && player.current) {
        player.current.togglePlay();
        return;
      }
      player.current?.activateElement();
      setError(null);
      try {
        const deviceId = await ensureDevice();
        player.current?.activateElement();
        await apiPlayTracks(deviceId, trackIds, index);
      } catch (e) {
        if (e instanceof RateLimitError) setError(e.message);
        else if (!(e as { fromPlayer?: boolean }).fromPlayer) setError(`Couldn’t start playback: ${(e as Error).message}`);
      }
    },
    [needsReconnect, nowPlaying?.trackId, ensureDevice],
  );

  const queueTrack = useCallback(
    async (trackId: string, title: string) => {
      if (needsReconnect) return;
      // Spotify can only queue onto something that's playing; with nothing on, just start the song.
      if (!nowPlaying) return playTracks([trackId]);
      setError(null);
      try {
        const deviceId = await ensureDevice();
        await apiAddToQueue(deviceId, trackId);
        setNotice(`Added “${title}” to the queue`);
        setQueueVersion((v) => v + 1);
      } catch (e) {
        if (e instanceof RateLimitError) setError(e.message);
        else setError(`Couldn’t add to the queue: ${(e as Error).message}`);
      }
    },
    [needsReconnect, nowPlaying, playTracks, ensureDevice],
  );

  const queueRecord = useCallback(
    async (albumId: string, trackIds: string[], title: string) => {
      if (needsReconnect || !trackIds.length) return;
      if (!nowPlaying) return playAlbum(albumId);
      setError(null);
      setNotice(`Adding “${title}” to the queue…`);
      try {
        const deviceId = await ensureDevice();
        // Spotify only queues one song per request. Add them one after another (keeps their order),
        // spaced out so a long record doesn't trip Spotify's rate limit; if it does, wait and carry on.
        for (const [i, id] of trackIds.entries()) {
          if (i > 0) await sleep(QUEUE_GAP_MS);
          for (let attempt = 0; ; attempt++) {
            try {
              await apiAddToQueue(deviceId, id);
              break;
            } catch (e) {
              if (!(e instanceof RateLimitError) || attempt >= 2 || e.retryAfterSec > MAX_QUEUE_WAIT_SEC) throw e;
              setNotice(`Adding “${title}” to the queue… (${i} of ${trackIds.length})`);
              await sleep(e.retryAfterSec * 1000 + 250);
            }
          }
        }
        setNotice(`Added ${trackIds.length} song${trackIds.length === 1 ? '' : 's'} from “${title}” to the queue`);
      } catch (e) {
        setNotice(null);
        if (e instanceof RateLimitError) setError(e.message);
        else setError(`Couldn’t add “${title}” to the queue: ${(e as Error).message}`);
      } finally {
        setQueueVersion((v) => v + 1);
      }
    },
    [needsReconnect, nowPlaying, playAlbum, ensureDevice],
  );

  const api = useMemo<PlayerApi>(
    () => ({
      status,
      error,
      needsReconnect,
      nowPlaying,
      volume,
      playAlbum,
      playTracks,
      queueTrack,
      queueRecord,
      queueVersion,
      notice,
      toggle: () => player.current?.togglePlay(),
      next: () => player.current?.nextTrack(),
      previous: () => player.current?.previousTrack(),
      seek: (ms) => {
        player.current?.seek(ms);
        setNowPlaying((n) => (n ? { ...n, position: ms, measuredAt: Date.now() } : n));
      },
      setVolume: (v) => {
        setVolumeState(v);
        localStorage.setItem(VOLUME_KEY, String(v));
        player.current?.setVolume(v);
      },
      dismissError: () => setError(null),
    }),
    [status, error, needsReconnect, nowPlaying, volume, playAlbum, playTracks, queueTrack, queueRecord, queueVersion, notice],
  );

  return <PlayerContext.Provider value={api}>{children}</PlayerContext.Provider>;
}
