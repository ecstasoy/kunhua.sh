package server

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"kunhua.sh/api/internal/store"
)

func serverWith(t *testing.T, cfg Config) http.Handler {
	t.Helper()
	db, err := store.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	if err := db.Migrate(); err != nil {
		t.Fatal(err)
	}
	return New(db, slog.New(slog.NewJSONHandler(io.Discard, nil)), cfg)
}

// A stand-in for the release link. The filesystem behaviour it replaces —
// reading the link's own mtime rather than its target's — is covered in
// internal/host. Here the subject is the shape of the response, so the time is
// injected rather than staged on disk.
func linkAt(when time.Time) func(string) (time.Time, error) {
	return func(string) (time.Time, error) { return when, nil }
}

func fixed(t time.Time) func() time.Time { return func() time.Time { return t } }

// The frontend declares a type with these exact names. Asserting the decoded
// map rather than unmarshalling into statusResponse is deliberate: decoding
// into the struct would pass even if a field were renamed, because the page
// reads JSON and not Go.
func TestStatusFieldNamesAndTypes(t *testing.T) {
	now := time.Date(2026, 8, 31, 12, 0, 0, 0, time.UTC)
	deployed := time.Date(2026, 8, 31, 9, 30, 0, 0, time.UTC)
	h := serverWith(t, Config{
		ReleaseLink: "/srv/kunhua.sh/current",
		SymlinkTime: linkAt(deployed),
		Uptime:      func() (time.Duration, error) { return 90 * time.Minute, nil },
		Now:         fixed(now),
	})

	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/status", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}

	var got map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode: %v (body %q)", err, rec.Body.String())
	}

	want := map[string]any{
		"uptime_seconds": float64(5400),
		"deployed_at":    "2026-08-31T09:30:00Z",
		"generated_at":   "2026-08-31T12:00:00Z",
	}
	if len(got) != len(want) {
		t.Errorf("fields = %v, want exactly %v", keys(got), keys(want))
	}
	for k, v := range want {
		if got[k] != v {
			t.Errorf("%s = %#v (%T), want %#v", k, got[k], got[k], v)
		}
	}
}

func TestStatusReportsMissingValuesAsNull(t *testing.T) {
	// A zero uptime would render as "up 0m" and read as a reboot that never
	// happened. Absent has to stay absent all the way to the page.
	h := serverWith(t, Config{
		ReleaseLink: filepath.Join(t.TempDir(), "no-such-link"),
		Uptime:      func() (time.Duration, error) { return 0, os.ErrNotExist },
		Now:         fixed(time.Date(2026, 8, 31, 12, 0, 0, 0, time.UTC)),
	})

	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/status", nil))
	// Still 200: this endpoint's promise is that it answers, and the page's
	// promise is that a missing value shows as missing.
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}

	var got map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	for _, k := range []string{"uptime_seconds", "deployed_at"} {
		v, present := got[k]
		if !present {
			t.Errorf("%s was omitted entirely; the frontend distinguishes null from absent", k)
		}
		if v != nil {
			t.Errorf("%s = %#v, want null", k, v)
		}
	}
	if got["generated_at"] == nil {
		t.Error("generated_at is null; the freshness line has nothing to read")
	}
}

func TestStatusIsNotCacheable(t *testing.T) {
	h := serverWith(t, Config{SymlinkTime: linkAt(time.Now())})
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/status", nil))
	if got := rec.Header().Get("Cache-Control"); got != "no-store" {
		t.Errorf("Cache-Control = %q, want no-store", got)
	}
}

func keys(m map[string]any) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}
