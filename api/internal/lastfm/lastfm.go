// Package lastfm reads listening history. It is the only thing in this service
// that talks to the outside world, and it is written on the assumption that
// the outside world is slow, wrong, or absent.
package lastfm

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"kunhua.sh/api/internal/store"
)

const DefaultBaseURL = "https://ws.audioscrobbler.com/2.0/"

// Bodies are read with a cap. A response that never ends would otherwise fill
// memory on a machine chosen for being small, and no legitimate answer here is
// anywhere near this size.
const maxBody = 1 << 20

type Client struct {
	Key  string
	User string
	// BaseURL is a field so tests can point at a server that times out, fails,
	// or returns nonsense — which is most of what this package has to handle.
	BaseURL string
	HTTP    *http.Client
}

func New(key, user string) *Client {
	return &Client{
		Key:     key,
		User:    user,
		BaseURL: DefaultBaseURL,
		// A timeout on the client as well as the context: the context bounds
		// the call, this bounds a connection that hangs before the request is
		// even sent.
		HTTP: &http.Client{Timeout: 20 * time.Second},
	}
}

// The wire format, which is JSON pretending to be XML: every value is a string,
// and the fields that matter are named "#text" and "@attr". Kept in one place
// so the rest of the service never sees it.
type response struct {
	// Last.fm reports its own errors with HTTP 200 and a body like
	// {"error":6,"message":"User not found"}. Ignoring this would turn a wrong
	// username into "no tracks" — a silence that looks like not listening.
	Error   int    `json:"error"`
	Message string `json:"message"`

	RecentTracks struct {
		Track []struct {
			Name   string `json:"name"`
			URL    string `json:"url"`
			Artist struct {
				Text string `json:"#text"`
			} `json:"artist"`
			Album struct {
				Text string `json:"#text"`
			} `json:"album"`
			Attr struct {
				NowPlaying string `json:"nowplaying"`
			} `json:"@attr"`
			Date struct {
				UTS string `json:"uts"`
			} `json:"date"`
		} `json:"track"`
	} `json:"recenttracks"`
}

// RecentTracks returns the most recent plays, newest first, and whether the
// first of them is playing right now.
func (c *Client) RecentTracks(ctx context.Context, limit int) ([]store.Track, bool, error) {
	q := url.Values{
		"method":  {"user.getrecenttracks"},
		"user":    {c.User},
		"api_key": {c.Key},
		"format":  {"json"},
		"limit":   {strconv.Itoa(limit)},
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.BaseURL+"?"+q.Encode(), nil)
	if err != nil {
		return nil, false, err
	}
	// Identifying the caller is a courtesy to whoever has to look at their own
	// logs, and the thing that gets a project unblocked rather than banned.
	req.Header.Set("User-Agent", "kunhua.sh/1.0 (+https://kunhua.sh)")

	res, err := c.HTTP.Do(req)
	if err != nil {
		return nil, false, fmt.Errorf("last.fm request: %w", err)
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		return nil, false, fmt.Errorf("last.fm returned %s", res.Status)
	}

	var body response
	if err := json.NewDecoder(io.LimitReader(res.Body, maxBody)).Decode(&body); err != nil {
		return nil, false, fmt.Errorf("last.fm response: %w", err)
	}
	if body.Error != 0 {
		return nil, false, fmt.Errorf("last.fm error %d: %s", body.Error, body.Message)
	}

	tracks := make([]store.Track, 0, len(body.RecentTracks.Track))
	playing := false
	for i, t := range body.RecentTracks.Track {
		// A track with no artist or title is not something to put on a page.
		if t.Artist.Text == "" || t.Name == "" {
			continue
		}
		track := store.Track{
			Artist: t.Artist.Text,
			Title:  t.Name,
			Album:  t.Album.Text,
			URL:    t.URL,
		}
		// Whatever is playing has no date: it has not finished. Everything
		// else carries a unix timestamp, as a string.
		if secs, err := strconv.ParseInt(t.Date.UTS, 10, 64); err == nil && secs > 0 {
			track.PlayedAt = time.Unix(secs, 0).UTC()
		} else if i == 0 && t.Attr.NowPlaying == "true" {
			playing = true
		}
		tracks = append(tracks, track)
	}

	if len(tracks) == 0 {
		return nil, false, nil
	}
	return tracks, playing, nil
}
