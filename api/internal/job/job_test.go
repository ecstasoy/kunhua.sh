package job

import (
	"bytes"
	"context"
	"errors"
	"io"
	"log/slog"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"kunhua.sh/api/internal/store"
)

func testDB(t *testing.T) *store.DB {
	t.Helper()
	db, err := store.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	if err := db.Migrate(); err != nil {
		t.Fatal(err)
	}
	return db
}

func quiet() *slog.Logger { return slog.New(slog.NewJSONHandler(io.Discard, nil)) }

// runOnce is exercised directly rather than through the ticker: a test that
// waits for a scheduler is a test that is slow and occasionally wrong.
func run(t *testing.T, db *store.DB, j Job) store.JobRun {
	t.Helper()
	runOnce(context.Background(), db, quiet(), j)

	got, found, err := db.LastJobRun(context.Background(), j.Name)
	if err != nil {
		t.Fatal(err)
	}
	if !found {
		t.Fatalf("job %q recorded nothing", j.Name)
	}
	return got
}

func TestRecordsSuccess(t *testing.T) {
	db := testDB(t)
	got := run(t, db, Job{
		Name: "ok-job", Attempts: 1, Timeout: time.Second,
		Run: func(context.Context) error { return nil },
	})

	if !got.OK {
		t.Errorf("ok = false, want true (error %q)", got.Error)
	}
	if got.LastOKAt.IsZero() {
		t.Error("last_ok_at is empty after a successful run")
	}
}

func TestRecordsTheFailureMessage(t *testing.T) {
	db := testDB(t)
	got := run(t, db, Job{
		Name: "bad-job", Attempts: 1, Timeout: time.Second,
		Run: func(context.Context) error { return errors.New("upstream refused") },
	})

	if got.OK {
		t.Error("ok = true after a failing run")
	}
	if got.Error != "upstream refused" {
		t.Errorf("error = %q, want the message the job returned", got.Error)
	}
}

// The distinction the page depends on. A job that succeeded once and has
// failed ever since must still report when it last worked, or the page has no
// way to say the song it is showing is a week old.
func TestFailureKeepsTheLastSuccessTime(t *testing.T) {
	db := testDB(t)
	name := "flaky"

	ok := run(t, db, Job{Name: name, Attempts: 1, Timeout: time.Second,
		Run: func(context.Context) error { return nil }})
	if ok.LastOKAt.IsZero() {
		t.Fatal("no last_ok_at after the successful run")
	}

	failed := run(t, db, Job{Name: name, Attempts: 1, Timeout: time.Second,
		Run: func(context.Context) error { return errors.New("token expired") }})

	if failed.OK {
		t.Error("ok = true after a failure")
	}
	if !failed.LastOKAt.Equal(ok.LastOKAt) {
		t.Errorf("last_ok_at = %v after a failure, want the earlier %v", failed.LastOKAt, ok.LastOKAt)
	}
}

// A fetcher is third-party-shaped code handling third-party-shaped data. A nil
// map anywhere in it would otherwise take down the HTTP server with it, for
// the sake of one line in the footer.
func TestAPanicBecomesAFailedRunRatherThanADeadProcess(t *testing.T) {
	db := testDB(t)
	got := run(t, db, Job{
		Name: "panicky", Attempts: 1, Timeout: time.Second,
		Run: func(context.Context) error { panic("index out of range") },
	})

	if got.OK {
		t.Error("ok = true after a panic")
	}
	if got.Error == "" {
		t.Error("the panic was swallowed without a message")
	}
}

func TestRetriesThenGivesUp(t *testing.T) {
	db := testDB(t)
	var calls atomic.Int32

	got := run(t, db, Job{
		Name: "retrying", Attempts: 3, Timeout: time.Second, Backoff: time.Millisecond,
		Run: func(context.Context) error {
			calls.Add(1)
			return errors.New("still down")
		},
	})

	// Attempts is the total number of tries, not the number of retries — an
	// off-by-one here means either one fewer try than intended or one more
	// request per minute to someone else's service.
	if n := calls.Load(); n != 3 {
		t.Errorf("called %d times, want 3", n)
	}
	if got.OK {
		t.Error("ok = true after exhausting the attempts")
	}
}

func TestStopsRetryingOnceItSucceeds(t *testing.T) {
	db := testDB(t)
	var calls atomic.Int32

	got := run(t, db, Job{
		Name: "recovers", Attempts: 3, Timeout: time.Second, Backoff: time.Millisecond,
		Run: func(context.Context) error {
			if calls.Add(1) < 2 {
				return errors.New("blip")
			}
			return nil
		},
	})

	if n := calls.Load(); n != 2 {
		t.Errorf("called %d times, want 2", n)
	}
	if !got.OK {
		t.Errorf("ok = false; the second attempt succeeded (error %q)", got.Error)
	}
}

func TestATimeoutIsAFailure(t *testing.T) {
	db := testDB(t)
	got := run(t, db, Job{
		Name: "slow", Attempts: 1, Timeout: 20 * time.Millisecond,
		Run: func(ctx context.Context) error {
			<-ctx.Done()
			return ctx.Err()
		},
	})

	if got.OK {
		t.Error("ok = true for a job that ran out of time")
	}
}

func TestStartStopsWhenTheContextIsCancelled(t *testing.T) {
	db := testDB(t)
	ctx, cancel := context.WithCancel(context.Background())
	var calls atomic.Int32

	// A long interval, so the only run is the one at startup — which exists so
	// a restart does not leave the page stale for a whole interval.
	wait := Start(ctx, db, quiet(), Job{
		Name: "looping", Every: time.Hour, Attempts: 1, Timeout: time.Second,
		Run: func(context.Context) error { calls.Add(1); return nil },
	})

	done := make(chan struct{})
	go func() { wait(); close(done) }()

	cancel()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("jobs did not stop when the context was cancelled")
	}

	if n := calls.Load(); n != 1 {
		t.Errorf("ran %d times, want the one startup run", n)
	}
}

// A job that takes minutes was indistinguishable from one that never started.
func TestALongRunSaysItStarted(t *testing.T) {
	db := testDB(t)
	var buf bytes.Buffer
	log := slog.New(slog.NewJSONHandler(&buf, nil))

	runOnce(context.Background(), db, log, Job{
		Name: "slow-but-fine", Attempts: 1, Timeout: time.Second,
		Run: func(context.Context) error { return nil },
	})

	if !strings.Contains(buf.String(), `"msg":"job started"`) {
		t.Errorf("nothing was logged before the work began:\n%s", buf.String())
	}
	// The start line has to come first, or it says nothing a reader could use.
	started := strings.Index(buf.String(), `"job started"`)
	finished := strings.Index(buf.String(), `"job ok"`)
	if started == -1 || finished == -1 || started > finished {
		t.Errorf("start was not logged before the outcome:\n%s", buf.String())
	}
}
