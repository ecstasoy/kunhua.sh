// Package job runs scheduled work and records outcomes.
package job

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"kunhua.sh/api/internal/store"
)

type Job struct {
	// Name keys the row in job_runs.
	Name string
	// Every is the time between runs.
	Every time.Duration
	// Timeout bounds one attempt.
	Timeout time.Duration
	// Attempts is total tries per run.
	Attempts int
	// Backoff is the delay before retry 2; it doubles after each failure.
	Backoff time.Duration

	Run func(context.Context) error
}

// Start launches all jobs and returns a wait function for shutdown.
func Start(ctx context.Context, db *store.DB, log *slog.Logger, jobs ...Job) (wait func()) {
	var wg sync.WaitGroup
	for _, j := range jobs {
		wg.Add(1)
		go func(j Job) {
			defer wg.Done()
			loop(ctx, db, log, j)
		}(j)
	}
	return wg.Wait
}

func loop(ctx context.Context, db *store.DB, log *slog.Logger, j Job) {
	// Run immediately at startup.
	runOnce(ctx, db, log, j)

	ticker := time.NewTicker(j.Every)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Info("job stopped", "job", j.Name)
			return
		case <-ticker.C:
			runOnce(ctx, db, log, j)
		}
	}
}

func runOnce(ctx context.Context, db *store.DB, log *slog.Logger, j Job) {
	started := time.Now()
	// Logged before the work, not only after it. A job that takes minutes was
	// indistinguishable from one that never started: nothing was written until
	// the last attempt finished, which with retries is ten minutes away.
	log.Info("job started", "job", j.Name)

	var runErr error
	for attempt := 1; attempt <= j.Attempts; attempt++ {
		runErr = attemptOnce(ctx, j)
		if runErr == nil || attempt == j.Attempts {
			break
		}

		// Exponential backoff.
		wait := j.Backoff << (attempt - 1)
		log.Warn("job attempt failed",
			"job", j.Name,
			"attempt", attempt,
			"retry_in", wait,
			"err", runErr,
		)

		select {
		case <-ctx.Done():
			return
		case <-time.After(wait):
		}
	}

	// Record outcome with a context that survives cancellation of the run ctx.
	recordCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
	defer cancel()
	if recErr := db.RecordJobRun(recordCtx, j.Name, started, time.Now(), runErr); recErr != nil {
		log.Error("recording job run failed", "job", j.Name, "err", recErr)
	}

	if runErr != nil {
		log.Error("job failed", "job", j.Name, "err", runErr, "took", time.Since(started))
		return
	}
	log.Info("job ok", "job", j.Name, "took", time.Since(started))
}

// attemptOnce runs one attempt with timeout and panic protection.
func attemptOnce(ctx context.Context, j Job) (err error) {
	defer func() {
		if v := recover(); v != nil {
			err = fmt.Errorf("panic: %v", v)
		}
	}()

	runCtx, cancel := context.WithTimeout(ctx, j.Timeout)
	defer cancel()

	return j.Run(runCtx)
}
