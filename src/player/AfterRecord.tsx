import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useCollection } from '../collection/store';
import type { RecordInfo } from '../spotify/types';
import { usePlayer } from './PlayerContext';

/**
 * "What's next?": one record you've saved as a reminder to play next, and a suggestion from your
 * collection. Neither plays by itself: Sleeve never changes what Spotify plays, so when a record
 * ends Spotify carries on as usual, and you press Play now when you want one of these.
 */

/** All the wording for the reminder in one place, so it's easy to rename. */
export const SAVE_COPY = {
  action: 'Save for next',
  saved: 'Saved for next',
  remove: 'Remove',
  toast: (name: string) => `Saved “${name}” for next. It’ll wait in the player until you play it.`,
  replaced: (name: string, old: string) => `Saved “${name}” for next (replaces “${old}”).`,
  removed: (name: string) => `Removed “${name}” from next.`,
};

type AfterRecordApi = {
  /** The record you've saved as a reminder to play next (one at most). */
  saved: RecordInfo | null;
  setSaved: (r: RecordInfo | null) => void;
  /** A record from your collection you haven't played in a while. */
  cratePick: RecordInfo | null;
  reroll: () => void;
};

const PLAYED_KEY = 'sleeve.lastPlayed';
const SAVED_KEY = 'sleeve.savedNext';
// Records played in Sleeve within this window sit out of the crate (unless that's all there is).
const RECENT_MS = 14 * 24 * 60 * 60 * 1000;
// Don't suggest the same record again until this many others have been shown.
const NO_REPEAT = 8;

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

/**
 * A random record from your whole collection, skipping the one that's on, anything you've played
 * in the last two weeks, and the last few suggestions (so ↻ keeps showing new ones).
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
  const { nowPlaying } = usePlayer();
  const records = useCollection();
  const [cratePick, setCratePick] = useState<RecordInfo | null>(null);
  const [saved, setSavedState] = useState<RecordInfo | null>(() => readJson(SAVED_KEY, null));
  const setSaved = useCallback((r: RecordInfo | null) => {
    setSavedState(r);
    writeJson(SAVED_KEY, r);
  }, []);
  const [rerollToken, setRerollToken] = useState(0);
  const lastPlayed = useRef<Record<string, number>>(readJson(PLAYED_KEY, {}));
  const seen = useRef<string[]>([]);

  // On deck was retired; clear any record left there.
  useEffect(() => writeJson('sleeve.onDeck', null), []);

  const currentId = nowPlaying?.albumId ?? null;

  // Remember when each record was last on (suggestions favour ones you haven't heard in a while),
  // and once your saved record is playing, it's done its job.
  useEffect(() => {
    if (!currentId || !nowPlaying?.fromAlbum) return;
    lastPlayed.current = { ...lastPlayed.current, [currentId]: Date.now() };
    writeJson(PLAYED_KEY, lastPlayed.current);
    if (saved?.id === currentId) setSaved(null);
  }, [currentId, nowPlaying?.fromAlbum]); // eslint-disable-line react-hooks/exhaustive-deps

  // A fresh crate suggestion when the record changes, when you ask for another, or when the collection changes.
  const recordIds = records.map((r) => r.id).join(',');
  useEffect(() => {
    if (!currentId) return;
    setCratePick((prev) => {
      if (rerollToken === 0 && prev && prev.id !== currentId && prev.id !== saved?.id && records.some((r) => r.id === prev.id))
        return prev;
      const next = pickFromCrate(
        records.filter((r) => r.id !== saved?.id),
        currentId,
        lastPlayed.current,
        seen.current,
      );
      if (next) seen.current = [...seen.current.filter((id) => id !== next.id), next.id].slice(-NO_REPEAT);
      return next;
    });
  }, [currentId, recordIds, rerollToken, saved?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const api = useMemo<AfterRecordApi>(
    () => ({
      saved,
      setSaved,
      cratePick: cratePick && cratePick.id !== saved?.id ? cratePick : null,
      reroll: () => setRerollToken((n) => n + 1),
    }),
    [saved, setSaved, cratePick],
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
