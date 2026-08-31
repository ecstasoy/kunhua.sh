// Package auth turns the owner's token into a session.
package auth

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"net/http"
	"time"

	"kunhua.sh/api/internal/store"
)

// CookieName carries the session. The __Host- prefix is enforced by the
// browser: it refuses the cookie unless it is Secure, has no Domain and is
// scoped to /, so no subdomain can set one for this site.
const CookieName = "__Host-session"

// TTL is how long a session lasts. Long, because the only user is the owner
// and re-entering a long token is what would stop notes being written at all.
const TTL = 30 * 24 * time.Hour

// MinTokenLength refuses a token short enough to guess. Too short is a
// configuration error, not a login failure.
const MinTokenLength = 24

type Auth struct {
	token string
	db    *store.DB
	now   func() time.Time
}

// New returns nil when no usable token is set, which is how the service runs
// with writing disabled rather than with writing open.
func New(token string, db *store.DB, now func() time.Time) *Auth {
	if len(token) < MinTokenLength {
		return nil
	}
	if now == nil {
		now = time.Now
	}
	return &Auth{token: token, db: db, now: now}
}

// SignIn exchanges the owner's token for a new session id.
//
// Constant-time comparison: a byte-by-byte one leaks the length of the
// matching prefix through timing, which recovers a token one character at a
// time.
func (a *Auth) SignIn(ctx context.Context, token string) (string, error) {
	if subtle.ConstantTimeCompare([]byte(token), []byte(a.token)) != 1 {
		return "", errors.New("wrong token")
	}

	id, err := newID()
	if err != nil {
		return "", err
	}
	now := a.now()
	if err := a.db.CreateSession(ctx, id, now, TTL); err != nil {
		return "", err
	}
	// Cheap here, so expired rows never need a job to clear them.
	_ = a.db.DeleteExpiredSessions(ctx, now)
	return id, nil
}

func (a *Auth) SignedIn(r *http.Request) bool {
	c, err := r.Cookie(CookieName)
	if err != nil {
		return false
	}
	ok, err := a.db.SessionValid(r.Context(), c.Value, a.now())
	return err == nil && ok
}

func (a *Auth) SignOut(r *http.Request) error {
	c, err := r.Cookie(CookieName)
	if err != nil {
		return nil
	}
	return a.db.DeleteSession(r.Context(), c.Value)
}

func SetCookie(w http.ResponseWriter, id string) {
	http.SetCookie(w, &http.Cookie{
		Name:  CookieName,
		Value: id,
		Path:  "/",
		// Script cannot read it, so an injected script cannot steal the
		// session. Secure and the attributes below are what __Host- requires.
		HttpOnly: true,
		Secure:   true,
		// Strict rather than Lax: nothing here is reached by following a link
		// from elsewhere while signed in, and it removes the request-forgery
		// class rather than most of it.
		SameSite: http.SameSiteStrictMode,
		MaxAge:   int(TTL.Seconds()),
	})
}

// ClearCookie expires the cookie. The attributes must match the ones it was
// set with, or the browser keeps the original.
func ClearCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     CookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteStrictMode,
		MaxAge:   -1,
	})
}

func newID() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}
