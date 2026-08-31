package lastfm

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"

	"kunhua.sh/api/internal/store"
)

// Periods are Last.fm's own names, used verbatim as storage keys and in the
// API this service serves, so no table maps one spelling to another.
var Periods = []string{"7day", "1month", "3month", "6month", "12month", "overall"}

// TopLimit fills the largest grid the page offers.
const TopLimit = 25

type topAlbumsResponse struct {
	Error   int    `json:"error"`
	Message string `json:"message"`

	TopAlbums struct {
		Album []struct {
			Name      string `json:"name"`
			URL       string `json:"url"`
			Playcount string `json:"playcount"`
			Artist    struct {
				Name string `json:"name"`
			} `json:"artist"`
			Image []struct {
				Text string `json:"#text"`
				Size string `json:"size"`
			} `json:"image"`
		} `json:"album"`
	} `json:"topalbums"`
}

// TopAlbums returns the most played albums for one period, ranked.
func (c *Client) TopAlbums(ctx context.Context, period string, limit int) ([]store.Album, error) {
	q := url.Values{
		"method":  {"user.gettopalbums"},
		"user":    {c.User},
		"api_key": {c.Key},
		"format":  {"json"},
		"period":  {period},
		"limit":   {strconv.Itoa(limit)},
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.BaseURL+"?"+q.Encode(), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "kunhua.sh/1.0 (+https://kunhua.sh)")

	res, err := c.HTTP.Do(req)
	if err != nil {
		return nil, fmt.Errorf("last.fm request: %w", err)
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("last.fm returned %s", res.Status)
	}

	var body topAlbumsResponse
	if err := json.NewDecoder(io.LimitReader(res.Body, maxBody)).Decode(&body); err != nil {
		return nil, fmt.Errorf("last.fm response: %w", err)
	}
	// Last.fm reports its own errors with HTTP 200 and an error in the body.
	if body.Error != 0 {
		return nil, fmt.Errorf("last.fm error %d: %s", body.Error, body.Message)
	}

	albums := make([]store.Album, 0, len(body.TopAlbums.Album))
	for _, a := range body.TopAlbums.Album {
		if a.Name == "" || a.Artist.Name == "" {
			continue
		}
		plays, _ := strconv.Atoi(a.Playcount)
		albums = append(albums, store.Album{
			// Rank comes from position, not from @attr: the ordering is what
			// the chart means, and a missing attribute would silently collapse
			// every album to rank zero.
			Rank:      len(albums) + 1,
			Artist:    a.Artist.Name,
			Album:     a.Name,
			URL:       a.URL,
			Playcount: plays,
			ArtURL:    coverURL(a.Image),
		})
	}
	return albums, nil
}
