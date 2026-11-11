/**
 * Request cache for Spotify GETs:
 *  - in-flight dedupe: the same request made twice at once (StrictMode, two components) hits the network once
 *  - memory cache with a TTL per call site
 *  - optional localStorage persistence, so a page reload (or Vite hot reload) doesn't refetch everything
 */
type Entry = { at: number; data: unknown };

const PREFIX = 'sleeve.cache:';
const memory = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();

function readStored(key: string): Entry | undefined {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as Entry) : undefined;
  } catch {
    return undefined;
  }
}

function writeStored(key: string, entry: Entry) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(entry));
  } catch {
    /* quota exceeded — memory cache still works */
  }
}

type Options = { ttlMs: number; persist?: boolean };

/** Returns a fresh-enough cached value without loading anything. */
export function peek<T>(key: string, { ttlMs, persist }: Options): T | undefined {
  let hit = memory.get(key);
  if (!hit && persist) {
    hit = readStored(key);
    if (hit) memory.set(key, hit);
  }
  return hit && Date.now() - hit.at < ttlMs ? (hit.data as T) : undefined;
}

export function cached<T>(key: string, load: () => Promise<T>, opts: Options): Promise<T> {
  const hit = peek<T>(key, opts);
  if (hit !== undefined) return Promise.resolve(hit);

  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;

  const p = load()
    .then((data) => {
      const entry = { at: Date.now(), data };
      memory.set(key, entry);
      if (opts.persist) writeStored(key, entry);
      return data;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

/** Wipes everything cached (memory + storage), e.g. on sign-out. */
export function clearCache() {
  memory.clear();
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
