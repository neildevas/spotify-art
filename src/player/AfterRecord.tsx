import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useCollection } from '../collection/store';
import type { RecordInfo } from '../spotify/types';
import { type NowPlaying, usePlayer } from './PlayerContext';

/**
 * What plays after the current record. Sleeve only steps in when a record finishes, never between
 * songs: one record "on deck", or (if you choose) one pulled from your crate. No queue to manage.
 */
export type EndMode = 'stop' | 'crate';

type AfterRecordApi = {
  onDeck: RecordInfo | null;
  setOnDeck: (r: RecordInfo | null) => void;
  endMode: EndMode;
  setEndMode: (m: EndMode) => void;
  /** Sleeve's pick from your collection, shown ahead of time (crate mode, nothing on deck). */
  cratePick: RecordInfo | null;
  reroll: () => void;
  /** Skip the crate pick for the record that's playing now. */
  skipCrate: () => void;
  /** The record that will actually play next, if any. */
  upNext: RecordInfo | null;
};

const DECK_KEY = 'sleeve.onDeck';
const MODE_KEY = 'sleeve.afterRecord';
const PLAYED_KEY = 'sleeve.lastPlayed';
// A play you just asked for isn't a record ending (e.g. starting another record on the last song).
const OWN_REQUEST_GRACE_MS = 5000;
// Start the next record this long before the last song's end, to beat Spotify's Autoplay to it.
const END_LEAD_MS = 350;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeJson(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

// Records played in Sleeve within this window sit out of the crate (unless that's all there is).
const RECENT_MS = 14 * 24 * 60 * 60 * 1000;
// Don't offer the same record again until this many other picks have been shown.
const NO_REPEAT = 8;

/**
 * A random record from your whole collection, skipping the one that's on, anything you've played
 * in the last two weeks, and the last few picks you've seen (so ↻ keeps showing new ones).
 */
function pickFromCrate(records: RecordInfo[], currentId: string | null, lastPlayed: Record<string, number>, seen: string[]) {
  const others = records.filter((r) => r.id !== currentId);
  if (!others.length) return null;
  const now = Date.now();
  const notRecent = others.filter((r) => now - (lastPlayed[r.id] ?? 0) > RECENT_MS);
  const base = notRecent.length ? notRecent : others;
  const fresh = base.filter((r) => !seen.includes(r.id));
  const pool = fresh.length ? fresh : base.filter((r) => r.id !== seen[seen.length - 1]);
  const from = pool.length ? pool : base;
  return from[Math.floor(Math.random() * from.length)];
}

const Ctx = createContext<AfterRecordApi | null>(null);

export function useAfterRecord() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAfterRecord must be used inside <AfterRecordProvider>');
  return ctx;
}

export function AfterRecordProvider({ children }: { children: React.ReactNode }) {
  const player = usePlayer();
  const { nowPlaying, playAlbum, lastPlayRequestAt } = player;
  const records = useCollection();
  const [onDeck, setOnDeckState] = useState<RecordInfo | null>(() => readJson(DECK_KEY, null));
  const [endMode, setEndModeState] = useState<EndMode>(() => (readJson<string>(MODE_KEY, 'stop') === 'crate' ? 'crate' : 'stop'));
  const [cratePick, setCratePick] = useState<RecordInfo | null>(null);
  const [skippedFor, setSkippedFor] = useState<string | null>(null);
  const [rerollToken, setRerollToken] = useState(0);
  const lastPlayed = useRef<Record<string, number>>(readJson(PLAYED_KEY, {}));
  // Recent crate picks this session, so re-rolling moves through the collection instead of circling.
  const seen = useRef<string[]>([]);

  const setOnDeck = useCallback((r: RecordInfo | null) => {
    setOnDeckState(r);
    writeJson(DECK_KEY, r);
  }, []);
  const setEndMode = useCallback((m: EndMode) => {
    setEndModeState(m);
    writeJson(MODE_KEY, m);
    setSkippedFor(null);
  }, []);

  const currentId = nowPlaying?.albumId ?? null;

  // Remember when each record was last on, for the crate's "haven't heard it in a while".
  useEffect(() => {
    if (!currentId || !nowPlaying?.fromAlbum) return;
    lastPlayed.current = { ...lastPlayed.current, [currentId]: Date.now() };
    writeJson(PLAYED_KEY, lastPlayed.current);
    // A record that's now playing can't also be on deck.
    if (onDeck?.id === currentId) setOnDeck(null);
  }, [currentId, nowPlaying?.fromAlbum]); // eslint-disable-line react-hooks/exhaustive-deps

  // Choose the crate pick ahead of time so it can be shown (and re-rolled) before the record ends.
  const recordIds = records.map((r) => r.id).join(',');
  useEffect(() => {
    if (endMode !== 'crate' || onDeck || !currentId) return setCratePick(null);
    setCratePick((prev) => {
      if (rerollToken === 0 && prev && prev.id !== currentId && records.some((r) => r.id === prev.id)) return prev;
      const next = pickFromCrate(records, currentId, lastPlayed.current, seen.current);
      if (next) seen.current = [...seen.current.filter((id) => id !== next.id), next.id].slice(-NO_REPEAT);
      return next;
    });
  }, [endMode, onDeck, currentId, recordIds, rerollToken]); // eslint-disable-line react-hooks/exhaustive-deps

  const crateActive = endMode === 'crate' && !onDeck && skippedFor !== currentId;
  const upNext = onDeck ?? (crateActive ? cratePick : null);

  const prev = useRef<NowPlaying | null>(null);
  const handled = useRef<string | null>(null);

  const startNext = useCallback(
    (key: string) => {
      if (handled.current === key || !upNext) return false;
      handled.current = key;
      const next = upNext;
      if (onDeck) setOnDeck(null);
      setRerollToken(0);
      playAlbum(next.id, 0);
      return true;
    },
    [upNext, onDeck, setOnDeck, playAlbum],
  );

  // On the last song with something up next: start it right as the song ends, so Spotify's own
  // Autoplay doesn't get in first. Re-timed on every update (pause, seek, skip).
  useEffect(() => {
    const np = nowPlaying;
    if (!np || !np.fromAlbum || !np.isLast || np.paused || !upNext) return;
    const remaining = np.duration - (np.position + (Date.now() - np.measuredAt));
    const key = `${np.albumId}:${np.trackId}`;
    const t = setTimeout(() => startNext(key), Math.max(0, remaining - END_LEAD_MS));
    return () => clearTimeout(t);
  }, [nowPlaying, upNext, startNext]);

  // Backstop: we were on the last song, playing, and then it stopped at the start or Spotify moved on
  // to something else by itself (its Autoplay).
  useEffect(() => {
    const p = prev.current;
    prev.current = nowPlaying;
    if (!p || !nowPlaying || !p.fromAlbum || !p.isLast || p.paused) return;
    const stoppedAtStart = nowPlaying.paused && nowPlaying.position === 0;
    const movedOn = nowPlaying.albumId !== p.albumId;
    if (!stoppedAtStart && !movedOn) return;
    if (Date.now() - lastPlayRequestAt() < OWN_REQUEST_GRACE_MS) return; // you started something yourself
    const key = `${p.albumId}:${p.trackId}`;
    if (handled.current === key) return;
    if (upNext) {
      startNext(key);
      return;
    }
    handled.current = key;
    // Stop means stop, even if Spotify would carry on with its own suggestions.
    if (movedOn && !nowPlaying.paused) player.toggle();
  }, [nowPlaying]); // eslint-disable-line react-hooks/exhaustive-deps

  const api = useMemo<AfterRecordApi>(
    () => ({
      onDeck,
      setOnDeck,
      endMode,
      setEndMode,
      cratePick: crateActive ? cratePick : null,
      reroll: () => setRerollToken((n) => n + 1),
      skipCrate: () => setSkippedFor(currentId),
      upNext,
    }),
    [onDeck, setOnDeck, endMode, setEndMode, crateActive, cratePick, currentId, upNext],
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
