package server

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"kunhua.sh/api/internal/auth"
	"kunhua.sh/api/internal/store"
)

const goodToken = "a-token-long-enough-to-be-real-0123456789"

func authedServer(t *testing.T, token string) (*store.DB, http.Handler) {
	t.Helper()
	db, err := store.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	if err := db.Migrate(); err != nil {
		t.Fatal(err)
	}
	log := slog.New(slog.NewJSONHandler(io.Discard, nil))
	return db, New(db, log, Config{Auth: auth.New(token, db, time.Now)})
}

func do(t *testing.T, h http.Handler, method, path, body string, cookies ...*http.Cookie) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	for _, c := range cookies {
		req.AddCookie(c)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func signInAs(t *testing.T, h http.Handler, token string) *http.Cookie {
	t.Helper()
	rec := do(t, h, http.MethodPost, "/api/session", `{"token":"`+token+`"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("sign-in = %d, want 200", rec.Code)
	}
	for _, c := range rec.Result().Cookies() {
		if c.Name == auth.CookieName {
			return c
		}
	}
	t.Fatal("no session cookie was set")
	return nil
}

// The assertion whose failure means somebody else writing on the site.
func TestAWriteWithoutASessionIsRefused(t *testing.T) {
	_, h := authedServer(t, goodToken)
	body := `{"artist":"A","album":"B","note":"mine now"}`

	for _, tc := range []struct {
		name    string
		cookies []*http.Cookie
	}{
		{"no cookie at all", nil},
		{"an invented session id", []*http.Cookie{{Name: auth.CookieName, Value: "made-up"}}},
		{"an empty session id", []*http.Cookie{{Name: auth.CookieName, Value: ""}}},
		{"the token used directly as a session", []*http.Cookie{{Name: auth.CookieName, Value: goodToken}}},
	} {
		rec := do(t, h, http.MethodPut, "/api/notes", body, tc.cookies...)
		if rec.Code != http.StatusUnauthorized {
			t.Errorf("%s: PUT /api/notes = %d, want 401", tc.name, rec.Code)
		}
	}
}

func TestAWrongTokenIsRefused(t *testing.T) {
	_, h := authedServer(t, goodToken)

	for _, token := range []string{
		"",
		"wrong",
		goodToken + "x",
		goodToken[:len(goodToken)-1],
		strings.ToUpper(goodToken),
	} {
		rec := do(t, h, http.MethodPost, "/api/session", `{"token":"`+token+`"}`)
		if rec.Code != http.StatusUnauthorized {
			t.Errorf("token %q = %d, want 401", token, rec.Code)
		}
		if len(rec.Result().Cookies()) > 0 {
			t.Errorf("token %q was refused but a cookie was set", token)
		}
	}
}

func TestAWriteWithASessionSucceedsAndIsReadBack(t *testing.T) {
	db, h := authedServer(t, goodToken)
	cookie := signInAs(t, h, goodToken)

	rec := do(t, h, http.MethodPut, "/api/notes",
		`{"artist":"Belle and Sebastian","album":"Tigermilk","note":"the one before"}`, cookie)
	if rec.Code != http.StatusOK {
		t.Fatalf("PUT = %d, want 200 (%s)", rec.Code, rec.Body.String())
	}

	notes, err := db.Notes(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	if got := notes[store.NoteKey("Belle and Sebastian", "Tigermilk")]; got != "the one before" {
		t.Errorf("stored note = %q", got)
	}
}

func TestTheSessionCookieCannotBeReadByScript(t *testing.T) {
	_, h := authedServer(t, goodToken)
	c := signInAs(t, h, goodToken)

	if !c.HttpOnly {
		t.Error("cookie is readable by script; an injected script could take the session")
	}
	if !c.Secure {
		t.Error("cookie is not Secure")
	}
	if c.SameSite != http.SameSiteStrictMode {
		t.Errorf("SameSite = %v, want Strict", c.SameSite)
	}
	if c.Path != "/" {
		t.Errorf("Path = %q, want /", c.Path)
	}
	// The __Host- prefix makes the browser enforce the three above, so a
	// future change cannot quietly weaken them.
	if !strings.HasPrefix(c.Name, "__Host-") {
		t.Errorf("cookie name %q does not carry the __Host- prefix", c.Name)
	}
	if len(c.Value) < 32 {
		t.Errorf("session id is %d characters; too few to be unguessable", len(c.Value))
	}
}

func TestSigningOutEndsTheSession(t *testing.T) {
	_, h := authedServer(t, goodToken)
	cookie := signInAs(t, h, goodToken)

	if rec := do(t, h, http.MethodDelete, "/api/session", "", cookie); rec.Code != http.StatusOK {
		t.Fatalf("sign-out = %d", rec.Code)
	}
	// The cookie is server-side state, so an old copy must stop working.
	rec := do(t, h, http.MethodPut, "/api/notes", `{"artist":"A","album":"B","note":"x"}`, cookie)
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("a write after signing out = %d, want 401", rec.Code)
	}
}

// Without a token the service is read-only, never open.
func TestWritingIsDisabledWhenNoTokenIsConfigured(t *testing.T) {
	_, h := authedServer(t, "")

	rec := do(t, h, http.MethodPut, "/api/notes", `{"artist":"A","album":"B","note":"x"}`)
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("PUT with no auth configured = %d, want 401", rec.Code)
	}
	if rec := do(t, h, http.MethodPost, "/api/session", `{"token":""}`); rec.Code == http.StatusOK {
		t.Error("sign-in succeeded with no token configured")
	}
}

// A token short enough to guess is a configuration error, not a login that
// happens to work.
func TestAShortTokenIsNotAcceptedAsConfiguration(t *testing.T) {
	short := "hunter2"
	_, h := authedServer(t, short)

	if rec := do(t, h, http.MethodPost, "/api/session", `{"token":"`+short+`"}`); rec.Code == http.StatusOK {
		t.Error("a seven-character token was accepted")
	}
}

func TestSessionEndpointReportsWhetherEditingIsOffered(t *testing.T) {
	_, h := authedServer(t, goodToken)

	var out map[string]any
	rec := do(t, h, http.MethodGet, "/api/session", "")
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	if out["signed_in"] != false {
		t.Errorf("a visitor is reported as %v", out["signed_in"])
	}

	cookie := signInAs(t, h, goodToken)
	rec = do(t, h, http.MethodGet, "/api/session", "", cookie)
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	if out["signed_in"] != true {
		t.Errorf("the owner is reported as %v", out["signed_in"])
	}
}

func TestNotesAppearInTheChartAndEditableTracksTheSession(t *testing.T) {
	db, h := authedServer(t, goodToken)
	ctx := t.Context()

	err := db.ReplaceTopAlbums(ctx, "7day", []store.Album{
		{Rank: 1, Artist: "A", Album: "Annotated"},
		{Rank: 2, Artist: "B", Album: "Bare"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.SaveNote(ctx, "A", "Annotated", "worth saying", time.Now()); err != nil {
		t.Fatal(err)
	}

	read := func(cookies ...*http.Cookie) map[string]any {
		rec := do(t, h, http.MethodGet, "/api/top-albums", "", cookies...)
		var out map[string]any
		if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
			t.Fatal(err)
		}
		return out
	}

	visitor := read()
	if visitor["editable"] != false {
		t.Errorf("editable = %v for a visitor", visitor["editable"])
	}
	albums := visitor["periods"].(map[string]any)["7day"].([]any)
	if got := albums[0].(map[string]any)["note"]; got != "worth saying" {
		t.Errorf("note = %#v; notes are public, only editing is not", got)
	}
	// Absent rather than empty, so "no note" and "an empty note" cannot differ.
	if got := albums[1].(map[string]any)["note"]; got != nil {
		t.Errorf("an album with no note reported %#v", got)
	}

	owner := read(signInAs(t, h, goodToken))
	if owner["editable"] != true {
		t.Errorf("editable = %v for the owner", owner["editable"])
	}
}

func TestAnEmptiedNoteIsRemovedRatherThanStoredBlank(t *testing.T) {
	db, h := authedServer(t, goodToken)
	cookie := signInAs(t, h, goodToken)
	ctx := t.Context()

	write := func(note string) {
		t.Helper()
		body, _ := json.Marshal(map[string]string{"artist": "A", "album": "B", "note": note})
		if rec := do(t, h, http.MethodPut, "/api/notes", string(body), cookie); rec.Code != http.StatusOK {
			t.Fatalf("PUT %q = %d", note, rec.Code)
		}
	}

	write("something")
	write("   ")

	notes, err := db.Notes(ctx)
	if err != nil {
		t.Fatal(err)
	}
	// An emptied note and one never written have to look the same, or the
	// owner's "still to write" marker would miss it.
	if _, present := notes[store.NoteKey("A", "B")]; present {
		t.Error("a blank note was stored rather than removed")
	}
}

func TestAnOversizedNoteIsRefused(t *testing.T) {
	_, h := authedServer(t, goodToken)
	cookie := signInAs(t, h, goodToken)

	body, _ := json.Marshal(map[string]string{
		"artist": "A", "album": "B",
		"note": strings.Repeat("x", store.MaxNoteLength+1),
	})
	rec := do(t, h, http.MethodPut, "/api/notes", string(body), cookie)
	if rec.Code != http.StatusRequestEntityTooLarge {
		t.Errorf("an oversized note = %d, want 413", rec.Code)
	}
}
