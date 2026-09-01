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

const (
	// JobName is used in job_runs.
	JobName = "backup"
	// KeepLocal is how many local snapshots to retain.
	KeepLocal = 7
)

// Job runs daily snapshot + upload + local prune.
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

	// Prune first so failed uploads do not also grow local disk forever.
	if err := prune(dir, KeepLocal); err != nil {
		slog.Warn("pruning local backups failed", "job", JobName, "err", err)
	}

	if !dest.Configured() {
		return fmt.Errorf("snapshot written to %s but no offsite destination is configured", path)
	}
	return dest.Upload(ctx, name, path)
}

// Name is stable per UTC day and lexically sortable by date.
func Name(at time.Time) string {
	return "app-" + at.UTC().Format("2006-01-02") + ".db"
}

// prune keeps the newest n backup files by name.
func prune(dir string, n int) error {
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}

	names := make([]string, 0, len(entries))
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := e.Name()
		if strings.HasPrefix(name, "app-") && strings.HasSuffix(name, ".db") {
			names = append(names, name)
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
