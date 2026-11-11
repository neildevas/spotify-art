import { useSyncExternalStore } from 'react';
import type { CollectedRecord, RecordInfo } from '../spotify/types';

/**
 * The user's own record collection. Lives in this browser's localStorage, never on Spotify.
 * A tiny external store so any component can read it and every view updates together
 * (including other open tabs, via the `storage` event).
 */
const KEY = 'sleeve.collection.v1';

let records: CollectedRecord[] = load();
const listeners = new Set<() => void>();

function load(): CollectedRecord[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function commit(next: CollectedRecord[]) {
  records = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(records));
  } catch {
    /* storage full or blocked — keep the in-memory copy */
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    records = load();
    listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export const collection = {
  add(record: RecordInfo) {
    if (records.some((r) => r.id === record.id)) return;
    commit([{ ...record, addedAt: Date.now() }, ...records]);
  },
  remove(id: string) {
    commit(records.filter((r) => r.id !== id));
  },
  toggle(record: RecordInfo) {
    if (records.some((r) => r.id === record.id)) this.remove(record.id);
    else this.add(record);
  },
  /** JSON backup, since localStorage only lives in this browser. */
  exportJson() {
    return JSON.stringify({ app: 'sleeve', version: 1, records }, null, 2);
  },
  /** Merges a backup in; existing records are kept. Returns how many were new. */
  importJson(text: string) {
    const data = JSON.parse(text);
    const incoming: CollectedRecord[] = Array.isArray(data) ? data : data?.records;
    if (!Array.isArray(incoming)) throw new Error('Not a Sleeve collection file');
    const have = new Set(records.map((r) => r.id));
    const fresh = incoming.filter((r) => r && typeof r.id === 'string' && r.image && !have.has(r.id));
    commit([...records, ...fresh].sort((a, b) => b.addedAt - a.addedAt));
    return fresh.length;
  },
};

export function useCollection() {
  return useSyncExternalStore(subscribe, () => records);
}

export function useInCollection(id: string | undefined) {
  return useSyncExternalStore(subscribe, () => (id ? records.some((r) => r.id === id) : false));
}
