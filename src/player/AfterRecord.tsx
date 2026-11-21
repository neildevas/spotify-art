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

/** Favour records you haven't played in a while (never the one that's on). */
function pickFromCrate(records: RecordInfo[], currentId: string | null, lastPlayed: Record<string, number>, avoid?: string) {
  const pool = records.filter((r) => r.id !== currentId && r.id !== avoid);
  if (!pool.length) return null;
  const oldestFirst = [...pool].sort((a, b) => (lastPlayed[a.id] ?? 0) - (lastPlayed[b.id] ?? 0));
  const shortlist = oldestFirst.slice(0, Math.max(3, Math.ceil(pool.length / 3)));
  return shortlist[Math.floor(Math.random() * shortlist.length)];
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
    setCratePick((prev) =>
      rerollToken === 0 && prev && prev.id !== currentId && records.some((r) => r.id === prev.id)
        ? prev
        : pickFromCrate(records, currentId, lastPlayed.current, prev?.id),
    );
  }, [endMode, onDeck, currentId, recordIds, rerollToken]); // eslint-disable-line react-hooks/exhaustive-deps

  const crateActive = endMode === 'crate' && !onDeck && skippedFor !== currentId;
  const upNext = onDeck ?? (crateActive ? cratePick : null);

  // Watch for the record finishing: we were on its last song, playing, and then it stopped at the
  // start, or Spotify moved on to something else by itself (its autoplay).
  const prev = useRef<NowPlaying | null>(null);
  const handled = useRef<string | null>(null);
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
    handled.current = key;
    if (!upNext) {
      // Stop means stop, even if Spotify would carry on with its own suggestions.
      if (movedOn) player.toggle();
      return;
    }
    const next = upNext;
    if (onDeck) setOnDeck(null);
    setRerollToken(0);
    playAlbum(next.id, 0);
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
