package server

import (
	"encoding/json"
	"io"
	"net/http"

	"kunhua.sh/api/internal/auth"
)

// maxAuthBody bounds a sign-in request, which carries one token.
const maxAuthBody = 4 << 10

type sessionResponse struct {
	SignedIn bool `json:"signed_in"`
}

// signIn exchanges the owner's token for a session cookie.
func signIn(a *auth.Auth) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if a == nil {
			http.Error(w, "sign-in is not configured", http.StatusNotFound)
			return
		}

		var body struct {
			Token string `json:"token"`
		}
		if err := json.NewDecoder(io.LimitReader(r.Body, maxAuthBody)).Decode(&body); err != nil {
			http.Error(w, "bad request", http.StatusBadRequest)
			return
		}

		id, err := a.SignIn(r.Context(), body.Token)
		if err != nil {
			// One message for a wrong token and for a database failure: the
			// difference is of no use to anyone allowed to ask.
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		auth.SetCookie(w, id)
		writeJSON(w, http.StatusOK, sessionResponse{SignedIn: true})
	}
}

func signOut(a *auth.Auth) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if a != nil {
			_ = a.SignOut(r)
		}
		auth.ClearCookie(w)
		writeJSON(w, http.StatusOK, sessionResponse{SignedIn: false})
	}
}

// session reports whether this browser is signed in, so the page knows whether
// to offer editing. It reveals nothing a visitor could not determine by trying.
func session(a *auth.Auth) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, sessionResponse{SignedIn: a != nil && a.SignedIn(r)})
	}
}

// requireSession refuses anything without a valid session.
//
// The one assertion in this service whose failure means somebody else writing
// on the site. A nil Auth refuses everything: writing is disabled when no
// token is configured, never open.
func requireSession(a *auth.Auth, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if a == nil || !a.SignedIn(r) {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		next(w, r)
	}
}
