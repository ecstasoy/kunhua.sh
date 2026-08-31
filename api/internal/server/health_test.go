package server

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"kunhua.sh/api/internal/store"
)

func newTestServer(t *testing.T) (http.Handler, *store.DB) {
	t.Helper()
	db, err := store.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	if err := db.Migrate(); err != nil {
		t.Fatalf("Migrate: %v", err)
	}
	// Discard the access log: these tests assert on responses, and a logger
	// writing to stdout would bury the failure output.
	log := slog.New(slog.NewJSONHandler(io.Discard, nil))
	return New(db, log, Config{}), db
}

func get(t *testing.T, h http.Handler, path string) *httptest.ResponseRecorder {
	t.Helper()
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
	return rec
}

func TestHealthzIsUnderApiPrefix(t *testing.T) {
	h, _ := newTestServer(t)

	// Caddy proxies /api/* without stripping the prefix. Registering /healthz
	// instead would pass under `go run` and 404 in production.
	if got := get(t, h, "/api/healthz").Code; got != http.StatusOK {
		t.Errorf("GET /api/healthz = %d, want 200", got)
	}
	if got := get(t, h, "/healthz").Code; got != http.StatusNotFound {
		t.Errorf("GET /healthz = %d, want 404", got)
	}
}

func TestHealthzReportsJobs(t *testing.T) {
	h, db := newTestServer(t)

	if _, err := db.W.Exec(`
		INSERT INTO job_runs (name, started_at, finished_at, ok, error)
		VALUES ('scrobble', datetime('now'), datetime('now'), 0, 'lastfm timeout')`,
	); err != nil {
		t.Fatal(err)
	}

	rec := get(t, h, "/api/healthz")
	// A failing fetcher is reported, not fatal: Last.fm being down is not this
	// service being down, and a 503 here would block deploys.
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}

	var resp healthResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode: %v (body %q)", err, rec.Body.String())
	}
	if !resp.OK {
		t.Error("ok = false, want true")
	}
	if len(resp.Jobs) != 1 || resp.Jobs[0].Name != "scrobble" || resp.Jobs[0].OK {
		t.Errorf("jobs = %+v, want one failing scrobble", resp.Jobs)
	}
	if resp.Jobs[0].Error != "lastfm timeout" {
		t.Errorf("error = %q, want the recorded message", resp.Jobs[0].Error)
	}
}

func TestHealthzFailsWhenDatabaseIsGone(t *testing.T) {
	h, db := newTestServer(t)

	// The failure this endpoint exists to catch. Without it a deploy would be
	// declared successful against a service that cannot read its own data.
	db.Close()

	rec := get(t, h, "/api/healthz")
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", rec.Code)
	}
	var resp healthResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp.OK || resp.Database == "ok" {
		t.Errorf("response says healthy: %+v", resp)
	}
}

func TestHealthzIsNotCacheable(t *testing.T) {
	h, _ := newTestServer(t)
	// A cached 200 outlives the condition it described.
	if got := get(t, h, "/api/healthz").Header().Get("Cache-Control"); got != "no-store" {
		t.Errorf("Cache-Control = %q, want no-store", got)
	}
}

func TestResponsesCarryRequestID(t *testing.T) {
	h, _ := newTestServer(t)
	if got := get(t, h, "/api/healthz").Header().Get("X-Request-Id"); got == "" {
		t.Error("X-Request-Id is empty; a reported failure cannot be traced to a log line")
	}
}
