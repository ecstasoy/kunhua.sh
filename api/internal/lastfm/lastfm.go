// Package lastfm fetches listening history from Last.fm.
package lastfm

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"kunhua.sh/api/internal/store"
)

const DefaultBaseURL = "https://ws.audioscrobbler.com/2.0/"

// Cap response size to avoid unbounded memory use.
const maxBody = 1 << 20

type Client struct {
	Key     string
	User    string
	BaseURL string
	HTTP    *http.Client
}

func New(key, user string) *Client {
	return &Client{
		Key:     key,
		User:    user,
		BaseURL: DefaultBaseURL,
		HTTP:    &http.Client{Timeout: 20 * time.Second},
	}
}

// Last.fm wire format.
type response struct {
	// Last.fm may return errors in a 200 response body.
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
			Image []struct {
				Text string `json:"#text"`
				Size string `json:"size"`
			} `json:"image"`
		} `json:"track"`
	} `json:"recenttracks"`
}

// RecentTracks returns tracks (newest first) and whether the first is now playing.
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
		// Skip malformed entries.
		if t.Artist.Text == "" || t.Name == "" {
			continue
		}

		track := store.Track{
			Artist: t.Artist.Text,
			Title:  t.Name,
			Album:  t.Album.Text,
			URL:    t.URL,
			ArtURL: coverURL(t.Image),
		}

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

// noCoverID appears in the URL Last.fm serves when an album has no cover.
const noCoverID = "2a96cbd8b46e442fc41c2b86b821562f"

// coverURL picks the largest offered image, ignoring the placeholder star.
func coverURL(images []struct {
	Text string `json:"#text"`
	Size string `json:"size"`
}) string {
	bySize := map[string]string{}
	for _, i := range images {
		if i.Text != "" && !strings.Contains(i.Text, noCoverID) {
			bySize[i.Size] = i.Text
		}
	}
	for _, size := range []string{"extralarge", "large", "medium", "small"} {
		if u := bySize[size]; u != "" {
			return u
		}
	}
	return ""
}

// maxArt caps a cover download.
const maxArt = 4 << 20

// DownloadArt fetches a cover, refusing anything that is not an image.
func (c *Client) DownloadArt(ctx context.Context, url string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "kunhua.sh/1.0 (+https://kunhua.sh)")

	res, err := c.HTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("cover returned %s", res.Status)
	}
	if ct := res.Header.Get("Content-Type"); !strings.HasPrefix(ct, "image/") {
		return nil, fmt.Errorf("cover is %q, not an image", ct)
	}

	b, err := io.ReadAll(io.LimitReader(res.Body, maxArt))
	if err != nil {
		return nil, err
	}
	if len(b) == 0 {
		return nil, fmt.Errorf("cover is empty")
	}
	return b, nil
}
