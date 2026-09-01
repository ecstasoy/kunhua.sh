package backup

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"kunhua.sh/api/internal/job"
	"kunhua.sh/api/internal/store"
)

// JobName is the key in job_runs, so a backup that stopped working is visible
// the same way a fetcher that stopped working is.
const JobName = "backup"

// KeepLocal bounds the copies on the machine. Short, because the machine's own
// copies protect against a mistake made a moment ago; anything older is what
// the offsite copy is for.
const KeepLocal = 7

// Job snapshots the database daily, uploads it, and prunes local copies.
func Job(db *store.DB, dir string, dest *B2) job.Job {
	return job.Job{
		Name:     JobName,
		Every:    24 * time.Hour,
		Timeout:  10 * time.Minute,
		Attempts: 3,
		Backoff:  time.Minute,
		Run: func(ctx context.Context) error {
			return run(ctx, db, dir, dest, time.Now())
		},
	}
}

func run(ctx context.Context, db *store.DB, dir string, dest *B2, now time.Time) error {
	name := Name(now)
	path := filepath.Join(dir, name)

	if err := db.Snapshot(ctx, path); err != nil {
		return err
	}

	// Pruned before uploading, so a bucket that is unreachable for a week does
	// not also fill the disk.
	if err := prune(dir, KeepLocal); err != nil {
		slog.Warn("pruning local backups failed", "job", JobName, "err", err)
	}

	if !dest.Configured() {
		// A local-only backup is worth having and worth being loud about: it
		// does not survive losing the machine, which is the case it exists for.
		return fmt.Errorf("snapshot written to %s but no offsite destination is configured", path)
	}
	return dest.Upload(ctx, name, path)
}

// Name is the file's name in both places. Dated and sortable, and the same
// every day so B2's own versioning keeps the history rather than the name.
func Name(at time.Time) string {
	return "app-" + at.UTC().Format("2006-01-02") + ".db"
}

// prune keeps the newest n snapshots by name, which is by date.
func prune(dir string, n int) error {
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}

	var names []string
	for _, e := range entries {
		// Only files this job wrote: the directory is not assumed to be ours
		// alone, and deleting by pattern is safer than deleting by exclusion.
		if !e.IsDir() && strings.HasPrefix(e.Name(), "app-") && strings.HasSuffix(e.Name(), ".db") {
			names = append(names, e.Name())
		}
	}
	sort.Sort(sort.Reverse(sort.StringSlice(names)))

	for _, name := range names[min(n, len(names)):] {
		if err := os.Remove(filepath.Join(dir, name)); err != nil {
			return err
		}
	}
	return nil
}
