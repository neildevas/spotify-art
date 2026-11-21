import { motion } from 'framer-motion';
import { type SavedArtist, savedArtists } from '../collection/store';
import { usePlayer } from '../player/PlayerContext';
import type { FavTrack } from '../spotify/types';
import { HeartIcon } from './DetailOverlay';

type Props = { artist: SavedArtist };

const EMPTY_HINT = 'Open any album and tap ♡ next to a song to keep it here.';

/** Songs you hearted for this artist, as a setlist in the hero beside their portrait. */
export function FavTracks({ artist }: Props) {
  const favs = artist.favTracks ?? [];
  const player = usePlayer();
  const ids = favs.map((t) => t.id);
  const play = (i: number) => player.playTracks(ids, i);
  const playingId = player.nowPlaying?.trackId;

  const rank = (t: FavTrack, i: number) =>
    t.id === playingId && !player.nowPlaying?.paused ? (
      <span className="eq eq-sm" aria-label="Playing">
        <i />
        <i />
        <i />
      </span>
    ) : (
      String(i + 1).padStart(2, '0')
    );

  const unfav = (t: FavTrack) => (
    <button
      className="fav-heart"
      aria-label={`Remove ${t.title} from favourites`}
      title="Remove from favourite tracks"
      onClick={(e) => {
        e.stopPropagation();
        savedArtists.toggleFav(artist.id, t);
      }}
    >
      <HeartIcon filled size={15} />
    </button>
  );

  return (
    <div className="fav-setlist">
      <div className="fav-setlist-head">
        <span className="eyebrow">Favourite tracks</span>
        <div className="fav-setlist-tools">
          {favs.length > 0 && (
            <button className="text-btn" onClick={() => play(0)}>
              ▶ Play all
            </button>
          )}
        </div>
      </div>
      {favs.length ? (
        <ol className="fav-setlist-list">
          {favs.map((t, i) => (
            <motion.li
              key={t.id}
              layout
              className={t.id === playingId ? 'is-playing' : ''}
              onClick={() => play(i)}
              title={`Play ${t.title}`}
            >
              <span className="fav-num">{rank(t, i)}</span>
              {t.thumb ? <img className="fav-thumb" src={t.thumb} alt="" /> : <span className="fav-thumb" />}
              <span className="fav-text">
                <span className="fav-title">{t.title}</span>
                <span className="fav-album">{t.albumName}</span>
              </span>
              <span className="fav-dur">{t.duration}</span>
              {unfav(t)}
            </motion.li>
          ))}
        </ol>
      ) : (
        <p className="liner-hint">{EMPTY_HINT}</p>
      )}
    </div>
  );
}
