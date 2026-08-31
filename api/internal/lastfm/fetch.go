package lastfm

import (
	"context"
	"time"

	"kunhua.sh/api/internal/job"
	"kunhua.sh/api/internal/store"
)

// JobName is the key in job_runs. The page reports staleness against it, so it
// is a constant rather than a string repeated in three places.
const JobName = "now-playing"

// How many plays to ask for. Enough that a restart, or a minute missed, does
// not leave a hole in the history; the duplicates it re-reads every time cost
// nothing, since storing them is INSERT OR IGNORE.
const fetchLimit = 50

// Job is the scheduled fetch, ready to hand to job.Start.
//
// The numbers are here rather than at the call site because they are a single
// judgement: asked once a minute, given ten seconds, tried three times with a
// doubling wait. Three attempts over roughly six seconds covers a blip; a real
// outage is left to the next minute rather than retried harder.
func (c *Client) Job(db *store.DB) job.Job {
	return job.Job{
		Name:     JobName,
		Every:    time.Minute,
		Timeout:  10 * time.Second,
		Attempts: 3,
		Backoff:  2 * time.Second,
		Run:      func(ctx context.Context) error { return c.fetchInto(ctx, db) },
	}
}

func (c *Client) fetchInto(ctx context.Context, db *store.DB) error {
	tracks, playing, err := c.RecentTracks(ctx, fetchLimit)
	if err != nil {
		return err
	}
	if len(tracks) == 0 {
		// A successful fetch of an empty history. Nothing to store, and not a
		// failure: an account with no plays is a legitimate answer.
		return nil
	}

	if err := db.SaveScrobbles(ctx, tracks); err != nil {
		return err
	}
	return db.SaveCurrent(ctx, tracks[0], playing, time.Now())
}
