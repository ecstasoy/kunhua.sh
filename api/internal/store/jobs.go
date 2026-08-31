package store

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

// JobRun stores the latest run details for one job.
type JobRun struct {
	Name       string
	StartedAt  time.Time
	FinishedAt time.Time
	OK         bool
	Error      string
	// LastOKAt is the last successful finish time, preserved across failures.
	LastOKAt time.Time
}

// RecordJobRun upserts one job row.
// last_ok_at is updated only when this run succeeds.
func (db *DB) RecordJobRun(ctx context.Context, name string, started, finished time.Time, runErr error) error {
	ok := 1
	msg := ""
	if runErr != nil {
		ok = 0
		msg = runErr.Error()
	}

	startedAt := started.UTC().Format(time.RFC3339)
	finishedAt := finished.UTC().Format(time.RFC3339)

	_, err := db.W.ExecContext(ctx, `
		INSERT INTO job_runs (name, started_at, finished_at, ok, error, last_ok_at)
		VALUES (?, ?, ?, ?, ?, CASE WHEN ? = 1 THEN ? ELSE NULL END)
		ON CONFLICT(name) DO UPDATE SET
			started_at  = excluded.started_at,
			finished_at = excluded.finished_at,
			ok          = excluded.ok,
			error       = excluded.error,
			last_ok_at  = COALESCE(excluded.last_ok_at, job_runs.last_ok_at)`,
		name, startedAt, finishedAt, ok, nullable(msg), ok, finishedAt,
	)
	return err
}

// LastJobRun returns (run, found, err). found=false means no row yet.
func (db *DB) LastJobRun(ctx context.Context, name string) (JobRun, bool, error) {
	var r JobRun
	var started, finished, lastOK, errMsg sql.NullString
	var ok int

	err := db.R.QueryRowContext(ctx, `
		SELECT name, started_at, finished_at, ok, error, last_ok_at
		FROM job_runs WHERE name = ?`, name).
		Scan(&r.Name, &started, &finished, &ok, &errMsg, &lastOK)
	if errors.Is(err, sql.ErrNoRows) {
		return JobRun{}, false, nil
	}
	if err != nil {
		return JobRun{}, false, err
	}

	r.OK = ok == 1
	r.Error = errMsg.String
	r.StartedAt = parseTime(started)
	r.FinishedAt = parseTime(finished)
	r.LastOKAt = parseTime(lastOK)

	return r, true, nil
}

// parseTime returns zero time for null, empty, or invalid timestamps.
func parseTime(s sql.NullString) time.Time {
	if !s.Valid || s.String == "" {
		return time.Time{}
	}
	t, err := time.Parse(time.RFC3339, s.String)
	if err != nil {
		return time.Time{}
	}
	return t
}
