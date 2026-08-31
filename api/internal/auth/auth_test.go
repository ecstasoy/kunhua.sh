package auth

import (
	"context"
	"os"
	"path/filepath"
	"regexp"
	"strings"
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

const token = "a-token-long-enough-to-be-real-0123456789"

func TestSessionIdsAreUnguessableAndUnique(t *testing.T) {
	a := New(token, testDB(t), time.Now)

	seen := map[string]bool{}
	for i := 0; i < 50; i++ {
		id, err := a.SignIn(context.Background(), token)
		if err != nil {
			t.Fatalf("SignIn: %v", err)
		}
		if seen[id] {
			t.Fatalf("session id repeated after %d sign-ins", i)
		}
		seen[id] = true
		// 32 random bytes, base64url: anything shorter is not from crypto/rand.
		if len(id) < 40 {
			t.Fatalf("session id is %d characters", len(id))
		}
	}
}

func TestAnExpiredSessionStopsWorking(t *testing.T) {
	db := testDB(t)
	start := time.Date(2026, 8, 31, 12, 0, 0, 0, time.UTC)
	a := New(token, db, func() time.Time { return start })

	id, err := a.SignIn(context.Background(), token)
	if err != nil {
		t.Fatal(err)
	}

	ok, err := db.SessionValid(context.Background(), id, start.Add(TTL-time.Hour))
	if err != nil || !ok {
		t.Errorf("valid before expiry: %v %v", ok, err)
	}
	ok, err = db.SessionValid(context.Background(), id, start.Add(TTL+time.Hour))
	if err != nil {
		t.Fatal(err)
	}
	if ok {
		t.Error("an expired session still authenticates")
	}
}

func TestSigningInClearsExpiredSessions(t *testing.T) {
	db := testDB(t)
	start := time.Date(2026, 8, 31, 12, 0, 0, 0, time.UTC)
	now := start
	a := New(token, db, func() time.Time { return now })

	if _, err := a.SignIn(context.Background(), token); err != nil {
		t.Fatal(err)
	}
	now = start.Add(TTL + time.Hour)
	if _, err := a.SignIn(context.Background(), token); err != nil {
		t.Fatal(err)
	}

	var n int
	if err := db.R.QueryRow(`SELECT count(*) FROM sessions`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Errorf("%d sessions remain; the expired one was not cleared", n)
	}
}

func TestNewRefusesAWeakToken(t *testing.T) {
	db := testDB(t)
	for _, weak := range []string{"", "short", strings.Repeat("x", MinTokenLength-1)} {
		if New(weak, db, time.Now) != nil {
			t.Errorf("a %d-character token was accepted as configuration", len(weak))
		}
	}
	if New(strings.Repeat("x", MinTokenLength), db, time.Now) == nil {
		t.Error("a token of exactly the minimum length was refused")
	}
}

// The one property with no behaviour to observe: a byte-by-byte comparison
// returns the right answer every time and leaks the length of the matching
// prefix through timing, which recovers the token one character at a time. No
// functional test can see the difference, so the source is checked instead.
func TestTheTokenIsComparedInConstantTime(t *testing.T) {
	src, err := os.ReadFile("auth.go")
	if err != nil {
		t.Fatal(err)
	}
	body := string(src)

	if !strings.Contains(body, "subtle.ConstantTimeCompare") {
		t.Error("the token is not compared with subtle.ConstantTimeCompare")
	}
	// Any direct comparison against the stored token, however written.
	direct := regexp.MustCompile(`(token\s*[!=]=\s*a\.token|a\.token\s*[!=]=\s*token)`)
	if direct.MatchString(body) {
		t.Error("the token is compared directly somewhere, which leaks its prefix through timing")
	}
}
