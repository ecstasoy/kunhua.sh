package lastfm

import (
	"context"
	"time"

	"kunhua.sh/api/internal/art"
	"kunhua.sh/api/internal/job"
	"kunhua.sh/api/internal/store"
)

// JobName is stored in job_runs and used for staleness checks.
const JobName = "now-playing"

// fetchLimit keeps history resilient across short gaps; duplicates are fine.
const fetchLimit = 50

// Job returns the scheduled fetch configuration.
func (c *Client) Job(db *store.DB, arts art.Store) job.Job {
	return job.Job{
		Name:     JobName,
		Every:    30 * time.Second,
		Timeout:  10 * time.Second,
		Attempts: 3,
		Backoff:  2 * time.Second,
		Run: func(ctx context.Context) error {
			return c.fetchInto(ctx, db, arts)
		},
	}
}

func (c *Client) fetchInto(ctx context.Context, db *store.DB, arts art.Store) error {
	tracks, playing, err := c.RecentTracks(ctx, fetchLimit)
	if err != nil {
		return err
	}
	if len(tracks) == 0 {
		// Empty history is valid, not an error.
		return nil
	}

	if err := db.SaveScrobbles(ctx, tracks); err != nil {
		return err
	}

	top := tracks[0]
	top.ArtHash = c.coverHash(ctx, db, arts, top.ArtURL)
	return db.SaveCurrent(ctx, top, playing, time.Now())
}

// coverHash resolves an upstream cover URL to a stored hash, downloading once.
//
// A cover that will not download is not a failed fetch: the track still shows,
// with the fallback block, and the next run tries again.
func (c *Client) coverHash(ctx context.Context, db *store.DB, arts art.Store, url string) string {
	if url == "" {
		return ""
	}
	if hash, found, err := db.ArtFor(ctx, url); err == nil && found {
		return hash
	}

	b, err := c.DownloadArt(ctx, url)
	if err != nil {
		return ""
	}
	hash, err := arts.Save(b)
	if err != nil {
		return ""
	}
	if err := db.RememberArt(ctx, url, hash, time.Now()); err != nil {
		return ""
	}
	return hash
}
