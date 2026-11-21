import { motion } from 'framer-motion';
import type { SavedArtist } from '../collection/store';
import type { ArtItem } from '../spotify/types';
import { ArtGrid } from './ArtGrid';
import { ArtistFolders } from './ArtistFolders';
import { ArtistCards } from './ArtistCards';
import { Segmented } from './Header';

/** Records: your own order (newest on top until you move things), or grouped by artist. */
export type RecordsView = 'order' | 'artist';
export type ArtistsSort = 'recent' | 'name';
export type CollectionShelf = 'records' | 'artists';

const RECORD_VIEWS: { id: RecordsView; label: string }[] = [
  { id: 'order', label: 'Albums' },
  { id: 'artist', label: 'By artist' },
];
const ARTIST_SORTS: { id: ArtistsSort; label: string }[] = [
  { id: 'recent', label: 'Recently added' },
  { id: 'name', label: 'Name' },
];

type Props = {
  artists: SavedArtist[]; // already sorted
  records: ArtItem[]; // already filtered and sorted
  totalRecords: number;
  query: string;
  onQuery: (q: string) => void;
  shelf: CollectionShelf;
  onShelf: (s: CollectionShelf) => void;
  recordsView: RecordsView;
  onRecordsView: (v: RecordsView) => void;
  artistsSort: ArtistsSort;
  onArtistsSort: (s: ArtistsSort) => void;
  tileSize: number;
  onSelect: (item: ArtItem) => void;
  onOpenArtist: (a: SavedArtist) => void;
  /** Open any artist's page (from a "By artist" folder). */
  onOpenArtistRef: (a: { id: string; name: string }) => void;
  onCollectArtist: (a: { id: string; name: string }) => void;
  onBrowse: () => void;
  /** Go to the Likes tab (records from your Spotify liked songs). */
  onBrowseLikes: () => void;
  /** "Your order": save a new arrangement (record album ids, first to last). */
  onArrange: (albumIds: string[]) => void;
};

/**
 * The collection: every record you've kept (the everyday view, ready to play), and the artists
 * you've collected as another way in.
 */
export function CollectionView({
  artists,
  records,
  totalRecords,
  query,
  onQuery,
  shelf,
  onShelf,
  recordsView,
  onRecordsView,
  artistsSort,
  onArtistsSort,
  tileSize,
  onSelect,
  onOpenArtist,
  onOpenArtistRef,
  onCollectArtist,
  onBrowse,
  onBrowseLikes,
  onArrange,
}: Props) {
  const collectedIds = new Set(artists.map((a) => a.id));
  const empty = artists.length === 0 && totalRecords === 0;

  return (
    <>
      <div className="toolbar">
        <motion.h1 className="view-title" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}>
          Your collection
          <span className="count">
            {totalRecords} record{totalRecords === 1 ? '' : 's'} · {artists.length} artist{artists.length === 1 ? '' : 's'}
            {shelf === 'records' && recordsView === 'order' && !query && totalRecords > 1 && ' · drag to arrange'}
          </span>
        </motion.h1>
        <div className="collection-tools">
          {!empty && (
            shelf === 'artists' ? (
              <Segmented small groupId="artistsSort" value={artistsSort} options={ARTIST_SORTS} onChange={onArtistsSort} />
            ) : (
              <Segmented small groupId="recordsView" value={recordsView} options={RECORD_VIEWS} onChange={onRecordsView} />
            )
          )}
        </div>
      </div>

      <div className="collection-shelves">
        <Segmented
          groupId="collectionShelf"
          value={shelf}
          onChange={onShelf}
          options={[
            { id: 'records', label: 'Records' },
            { id: 'artists', label: 'Artists' },
          ]}
        />
        {shelf === 'records' && totalRecords > 0 && (
          <label className="record-filter">
            <input
              type="search"
              value={query}
              onChange={(e) => onQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && query && (e.stopPropagation(), onQuery(''))}
              placeholder="Filter by album or artist"
              aria-label="Filter records by album or artist"
            />
          </label>
        )}
      </div>

      {empty ? (
        <motion.div className="empty-collection" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <h2>An empty crate</h2>
          <p>
            Find an artist you love in Search and hit <strong>Add artist</strong>. You can also keep a single record
            on its own. Everything stays here, in this browser.
          </p>
          <div className="empty-actions">
            <button className="btn-collect" onClick={onBrowse}>
              Start digging
            </button>
            <button className="btn-ghost" onClick={onBrowseLikes}>
              Start from your liked songs
            </button>
          </div>
        </motion.div>
      ) : shelf === 'artists' ? (
        <motion.section
          key="artists"
          className="collection-section"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {artists.length ? (
            <ArtistCards artists={artists} onOpenArtist={onOpenArtist} />
          ) : (
            <p className="search-hint">
              No artists yet.{' '}
              <button className="text-btn inline-link" onClick={onBrowse}>
                Find one in Search →
              </button>
            </p>
          )}
        </motion.section>
      ) : (
        <motion.section
          key="records"
          className="collection-section"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {records.length ? (
            <motion.div key={recordsView} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              {recordsView === 'artist' ? (
                <ArtistFolders items={records} tileSize={tileSize} onSelect={onSelect} onOpenArtist={onOpenArtistRef} />
              ) : (
                <ArtGrid
                  items={records}
                  loading={false}
                  tileSize={tileSize}
                  onSelect={onSelect}
                  collectedArtistIds={collectedIds}
                  onCollectArtist={onCollectArtist}
                  onReorder={!query ? (ordered) => onArrange(ordered.map((r) => r.albumId!).filter(Boolean)) : undefined}
                />
              )}
            </motion.div>
          ) : (
            <p className="search-hint">
              {query ? (
                <>
                  Nothing matches “{query}”.{' '}
                  <button className="text-btn inline-link" onClick={() => onQuery('')}>
                    Clear filter
                  </button>
                </>
              ) : (
                <>
                  No records yet. Open any album and hit <strong>Add record</strong>, or pin one on an artist’s page.
                </>
              )}
            </p>
          )}
        </motion.section>
      )}
    </>
  );
}
