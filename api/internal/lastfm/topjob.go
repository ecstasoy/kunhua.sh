package lastfm

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"kunhua.sh/api/internal/art"
	"kunhua.sh/api/internal/job"
	"kunhua.sh/api/internal/store"
)

// TopJobName is the key in job_runs for the daily chart fetch.
const TopJobName = "top-albums"

// TopJob fetches every period once a day.
//
// Separate from the now-playing job so a chart that fails does not make the
// current track look stale, and so the two can run at different rates.
func (c *Client) TopJob(db *store.DB, arts art.Store) job.Job {
	return job.Job{
		Name:  TopJobName,
		Every: 24 * time.Hour,
		// A first run downloads around seventy covers and took just over two
		// minutes in production; later runs are seconds, since the store is
		// content-addressed and nothing is fetched twice.
		Timeout:  10 * time.Minute,
		Attempts: 2,
		Backoff:  time.Minute,
		Run: func(ctx context.Context) error {
			return c.fetchTopInto(ctx, db, arts)
		},
	}
}

func (c *Client) fetchTopInto(ctx context.Context, db *store.DB, arts art.Store) error {
	var failed []string

	for _, period := range Periods {
		albums, err := c.TopAlbums(ctx, period, TopLimit)
		if err != nil {
			// One period failing must not discard the ones that worked.
			failed = append(failed, fmt.Sprintf("%s: %v", period, err))
			continue
		}
		if len(albums) == 0 {
			continue
		}

		if err := c.resolveCovers(ctx, db, arts, albums); err != nil {
			return err
		}
		if err := db.ReplaceTopAlbums(ctx, period, albums); err != nil {
			return err
		}
		// Per period, so a run that is slow shows where it is rather than
		// looking stuck.
		slog.Info("period stored", "job", TopJobName, "period", period, "albums", len(albums))
	}

	if len(failed) > 0 {
		return fmt.Errorf("%d of %d periods failed: %v", len(failed), len(Periods), failed)
	}
	return nil
}

// resolveCovers fills in ArtHash, downloading only what is not already stored.
func (c *Client) resolveCovers(ctx context.Context, db *store.DB, arts art.Store, albums []store.Album) error {
	urls := make([]string, 0, len(albums))
	for _, a := range albums {
		if a.ArtURL != "" {
			urls = append(urls, a.ArtURL)
		}
	}
	known, err := db.ArtHashes(ctx, urls)
	if err != nil {
		return err
	}

	for i := range albums {
		url := albums[i].ArtURL
		if url == "" {
			continue
		}
		if hash, ok := known[url]; ok {
			albums[i].ArtHash = hash
			continue
		}
		// A cover that will not download is not a failed chart: the album
		// renders with its fallback block and tomorrow's run tries again.
		hash := c.coverHash(ctx, db, arts, url)
		albums[i].ArtHash = hash
		if hash != "" {
			known[url] = hash
		}
	}
	return nil
}
