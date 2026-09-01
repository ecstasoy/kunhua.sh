package backup

import (
	"bytes"
	"context"
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"kunhua.sh/api/internal/store"
)

func testDB(t *testing.T) *store.DB {
	t.Helper()
	db, err := store.Open(filepath.Join(t.TempDir(), "app.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	if err := db.Migrate(); err != nil {
		t.Fatal(err)
	}
	return db
}

// A stand-in for B2, recording what arrived and verifying it the way B2 does.
type fakeB2 struct {
	*httptest.Server
	uploaded     map[string][]byte
	bucketID     string
	capabilities []string
	requests     int
}

func newFakeB2(t *testing.T, bucket string) *fakeB2 {
	t.Helper()
	f := &fakeB2{
		uploaded:     map[string][]byte{},
		bucketID:     "bucket-id-1",
		capabilities: []string{"listBuckets", "writeFiles"},
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/b2api/v4/b2_authorize_account", func(w http.ResponseWriter, r *http.Request) {
		f.requests++
		if _, _, ok := r.BasicAuth(); !ok {
			http.Error(w, `{"code":"unauthorized"}`, http.StatusUnauthorized)
			return
		}
		// Shaped from a real v4 response, not from the code under test: the
		// first fake put buckets one level too high, matching the same mistake
		// in the client, so both were wrong and the tests were green.
		_ = json.NewEncoder(w).Encode(map[string]any{
			"authorizationToken": "auth-token",
			"apiInfo": map[string]any{
				"storageApi": map[string]any{
					"apiUrl": f.URL,
					"allowed": map[string]any{
						"capabilities": f.capabilities,
						"buckets":      []map[string]string{{"id": f.bucketID, "name": bucket}},
					},
				},
			},
		})
	})
	mux.HandleFunc("/b2api/v4/b2_get_upload_url", func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "auth-token" {
			http.Error(w, `{"code":"bad_auth_token"}`, http.StatusUnauthorized)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]string{
			"uploadUrl":          f.URL + "/upload",
			"authorizationToken": "upload-token",
		})
	})
	mux.HandleFunc("/upload", func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "upload-token" {
			http.Error(w, `{"code":"bad_auth_token"}`, http.StatusUnauthorized)
			return
		}
		body, _ := io.ReadAll(r.Body)

		// B2 verifies the checksum; a fake that did not would hide a
		// truncated upload behind a green test.
		sum := sha1.Sum(body)
		if got := r.Header.Get("X-Bz-Content-Sha1"); got != hex.EncodeToString(sum[:]) {
			http.Error(w, `{"code":"checksum_mismatch"}`, http.StatusBadRequest)
			return
		}
		name, err := url.PathUnescape(r.Header.Get("X-Bz-File-Name"))
		if err != nil || name == "" {
			http.Error(w, `{"code":"bad_file_name"}`, http.StatusBadRequest)
			return
		}
		f.uploaded[name] = body
		_ = json.NewEncoder(w).Encode(map[string]string{"fileName": name})
	})

	f.Server = httptest.NewServer(mux)
	t.Cleanup(f.Close)
	return f
}

func b2For(f *fakeB2, bucket string) *B2 {
	b := NewB2("key-id", "key", bucket)
	b.AuthURL = f.URL + "/b2api/v4/b2_authorize_account"
	return b
}

// The whole path, and the only assertion that matters: what lands in the
// bucket is a database that opens and holds the notes.
func TestABackupArrivesAndCanBeOpened(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	if err := db.SaveNote(ctx, "Destroyer", "Kaputt", "the horns", time.Now()); err != nil {
		t.Fatal(err)
	}

	f := newFakeB2(t, "kunhua-sh-backup")
	dir := t.TempDir()
	at := time.Date(2026, 9, 1, 3, 0, 0, 0, time.UTC)

	if err := run(ctx, db, dir, b2For(f, "kunhua-sh-backup"), at); err != nil {
		t.Fatalf("run: %v", err)
	}

	body, ok := f.uploaded["app-2026-09-01.db"]
	if !ok {
		t.Fatalf("nothing arrived under that name; got %v", keys(f.uploaded))
	}

	// Written out and opened, because "bytes arrived" is not the claim being
	// made — "a restore would work" is.
	dest := filepath.Join(t.TempDir(), "restored.db")
	if err := os.WriteFile(dest, body, 0o600); err != nil {
		t.Fatal(err)
	}
	restored, err := store.Open(dest)
	if err != nil {
		t.Fatalf("what arrived will not open: %v", err)
	}
	defer restored.Close()

	notes, err := restored.Notes(ctx)
	if err != nil {
		t.Fatalf("what arrived will not read: %v", err)
	}
	if got := notes[store.NoteKey("Destroyer", "Kaputt")]; got != "the horns" {
		t.Errorf("the restored note is %q", got)
	}
}

func TestAnUnreachableBucketFailsTheRunButKeepsTheSnapshot(t *testing.T) {
	db := testDB(t)
	dir := t.TempDir()

	dest := NewB2("key-id", "key", "kunhua-sh-backup")
	dest.AuthURL = "http://127.0.0.1:1/b2api/v4/b2_authorize_account"
	dest.HTTP = &http.Client{Timeout: time.Second}

	err := run(context.Background(), db, dir, dest, time.Now())
	if err == nil {
		t.Error("an unreachable bucket reported success")
	}
	// The local copy is still worth having, and job_runs records the failure.
	if _, statErr := os.Stat(filepath.Join(dir, Name(time.Now()))); statErr != nil {
		t.Errorf("the snapshot was not kept: %v", statErr)
	}
}

// Not configured is a failed run, not a quiet one: a local-only backup does
// not survive losing the machine, which is the case it exists for.
func TestNoDestinationIsAFailure(t *testing.T) {
	db := testDB(t)
	dir := t.TempDir()

	err := run(context.Background(), db, dir, NewB2("", "", ""), time.Now())
	if err == nil {
		t.Error("a backup with nowhere to go reported success")
	}
	if _, statErr := os.Stat(filepath.Join(dir, Name(time.Now()))); statErr != nil {
		t.Errorf("the snapshot was not written: %v", statErr)
	}
}

func TestAWrongBucketNameIsRefused(t *testing.T) {
	f := newFakeB2(t, "someone-elses-bucket")
	err := b2For(f, "kunhua-sh-backup").Upload(context.Background(), "x.db", writeTemp(t, "x"))
	if err == nil {
		t.Error("uploading to a bucket the key does not name succeeded")
	}
}

func TestLocalCopiesExpire(t *testing.T) {
	db := testDB(t)
	f := newFakeB2(t, "b")
	dir := t.TempDir()

	// Twelve days, one run each.
	start := time.Date(2026, 9, 1, 3, 0, 0, 0, time.UTC)
	for i := 0; i < 12; i++ {
		if err := run(context.Background(), db, dir, b2For(f, "b"), start.AddDate(0, 0, i)); err != nil {
			t.Fatalf("day %d: %v", i, err)
		}
	}

	local, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(local) != KeepLocal {
		t.Errorf("%d local copies remain, want %d", len(local), KeepLocal)
	}
	// The newest, not an arbitrary seven.
	if _, err := os.Stat(filepath.Join(dir, Name(start.AddDate(0, 0, 11)))); err != nil {
		t.Error("the newest copy was pruned")
	}
	if _, err := os.Stat(filepath.Join(dir, Name(start))); !os.IsNotExist(err) {
		t.Error("the oldest copy survived")
	}
	// Every day still reached the bucket: expiry there is B2's business, and
	// the machine's key cannot delete anything.
	if len(f.uploaded) != 12 {
		t.Errorf("%d copies reached the bucket, want 12", len(f.uploaded))
	}
}

func TestPruningLeavesFilesItDidNotWrite(t *testing.T) {
	dir := t.TempDir()
	for _, name := range []string{"app-2026-01-01.db", "app-2026-01-02.db", "notes.txt", "app.db"} {
		if err := os.WriteFile(filepath.Join(dir, name), []byte("x"), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	if err := prune(dir, 1); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"notes.txt", "app.db", "app-2026-01-02.db"} {
		if _, err := os.Stat(filepath.Join(dir, name)); err != nil {
			t.Errorf("%s was removed", name)
		}
	}
}

func writeTemp(t *testing.T, body string) string {
	t.Helper()
	p := filepath.Join(t.TempDir(), "f")
	if err := os.WriteFile(p, []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
	return p
}

func keys(m map[string][]byte) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}

// The response shape is the thing that broke in production while every test
// passed, so it is pinned to a capture of the real one.
func TestTheAuthorizeResponseIsReadFromWhereB2PutsIt(t *testing.T) {
	// Trimmed from an actual v4 response.
	const real = `{
	  "accountId": "8545b6aaac2d",
	  "apiInfo": {
	    "storageApi": {
	      "allowed": {
	        "buckets": [{"id": "b805a4352b965abaaa0c021d", "name": "kunhua-sh-backup"}],
	        "capabilities": ["listBuckets", "writeFiles"],
	        "namePrefix": null
	      },
	      "apiUrl": "https://api005.backblazeb2.com",
	      "downloadUrl": "https://f005.backblazeb2.com"
	    }
	  },
	  "authorizationToken": "4_00..."
	}`

	var out authResponse
	if err := json.Unmarshal([]byte(real), &out); err != nil {
		t.Fatal(err)
	}
	if out.APIInfo.StorageAPI.APIURL != "https://api005.backblazeb2.com" {
		t.Errorf("apiUrl = %q", out.APIInfo.StorageAPI.APIURL)
	}
	buckets := out.APIInfo.StorageAPI.Allowed.Buckets
	if len(buckets) != 1 || buckets[0].Name != "kunhua-sh-backup" {
		t.Errorf("buckets = %+v; they live under allowed", buckets)
	}
	if len(out.APIInfo.StorageAPI.Allowed.Capabilities) != 2 {
		t.Errorf("capabilities = %v", out.APIInfo.StorageAPI.Allowed.Capabilities)
	}
}

// The key B2's web console calls "Write Only" carries deleteFiles and
// writeBucketLifecycleRules, either of which lets whoever holds this machine
// destroy the history the backup exists to preserve.
func TestAKeyThatCanDeleteIsReportedAsTooPowerful(t *testing.T) {
	var buf bytes.Buffer
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&buf, nil)))
	t.Cleanup(func() { slog.SetDefault(prev) })

	warnIfTooPowerful([]string{"listBuckets", "writeFiles", "deleteFiles"})
	if !strings.Contains(buf.String(), "deleteFiles") {
		t.Errorf("a key that can delete was not reported:\n%s", buf.String())
	}

	buf.Reset()
	warnIfTooPowerful([]string{"listBuckets", "writeFiles"})
	if buf.Len() != 0 {
		t.Errorf("a write-only key was reported anyway:\n%s", buf.String())
	}
}
