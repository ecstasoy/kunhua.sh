package store

import (
	"context"
	"testing"
	"time"
)

func migrated(t *testing.T) *DB {
	t.Helper()
	db := open(t)
	if err := db.Migrate(); err != nil {
		t.Fatal(err)
	}
	return db
}

func played(unix int64, artist, title string) Track {
	return Track{Artist: artist, Title: title, PlayedAt: time.Unix(unix, 0).UTC()}
}

func countScrobbles(t *testing.T, db *DB) int {
	t.Helper()
	var n int
	if err := db.R.QueryRow(`SELECT count(*) FROM scrobbles`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

// The fetcher re-reads an overlapping window every minute, so almost every row
// it offers is one already stored. Storing has to be idempotent or the history
// would be mostly duplicates.
func TestSavingTheSamePlaysTwiceStoresThemOnce(t *testing.T) {
	db := migrated(t)
	ctx := context.Background()
	tracks := []Track{played(1756600000, "A", "One"), played(1756600300, "B", "Two")}

	for i := 0; i < 3; i++ {
		if err := db.SaveScrobbles(ctx, tracks); err != nil {
			t.Fatalf("save %d: %v", i, err)
		}
	}
	if got := countScrobbles(t, db); got != 2 {
		t.Errorf("stored %d rows, want 2", got)
	}
}

func TestTheTrackThatIsPlayingIsNotHistory(t *testing.T) {
	db := migrated(t)
	// No PlayedAt: it has not finished, and may never finish. Storing it as a
	// scrobble would record a play that did not happen.
	err := db.SaveScrobbles(context.Background(), []Track{
		{Artist: "A", Title: "Still going"},
		played(1756600000, "B", "Finished"),
	})
	if err != nil {
		t.Fatal(err)
	}
	if got := countScrobbles(t, db); got != 1 {
		t.Errorf("stored %d rows, want only the finished play", got)
	}
}

func TestCurrentIsReplacedRatherThanAccumulated(t *testing.T) {
	db := migrated(t)
	ctx := context.Background()
	at := time.Date(2026, 8, 31, 12, 0, 0, 0, time.UTC)

	if err := db.SaveCurrent(ctx, Track{Artist: "A", Title: "First"}, true, at); err != nil {
		t.Fatal(err)
	}
	later := at.Add(time.Minute)
	if err := db.SaveCurrent(ctx, Track{Artist: "B", Title: "Second", Album: "Alb"}, false, later); err != nil {
		t.Fatal(err)
	}

	got, found, err := db.Current(ctx)
	if err != nil || !found {
		t.Fatalf("Current: %v found=%v", err, found)
	}
	if got.Track.Title != "Second" || got.Track.Artist != "B" {
		t.Errorf("track = %+v, want the second one", got.Track)
	}
	if got.Playing {
		t.Error("playing = true; the second save said it was not")
	}
	if !got.UpdatedAt.Equal(later) {
		t.Errorf("updated_at = %v, want %v", got.UpdatedAt, later)
	}

	var rows int
	if err := db.R.QueryRow(`SELECT count(*) FROM now_playing`).Scan(&rows); err != nil {
		t.Fatal(err)
	}
	if rows != 1 {
		t.Errorf("now_playing has %d rows, want exactly 1", rows)
	}
}

func TestCurrentIsAbsentNotAnErrorOnAFreshDatabase(t *testing.T) {
	db := migrated(t)
	_, found, err := db.Current(context.Background())
	if err != nil {
		t.Fatalf("Current: %v", err)
	}
	if found {
		t.Error("found = true on a database nothing has been written to")
	}
}

func TestAMissingAlbumIsStoredAsAbsent(t *testing.T) {
	db := migrated(t)
	ctx := context.Background()
	at := time.Now()
	// Last.fm omits the album for plenty of entries. A missing cover is not a
	// reason to drop the track, and an empty string is not the same as null.
	if err := db.SaveCurrent(ctx, Track{Artist: "A", Title: "T"}, false, at); err != nil {
		t.Fatal(err)
	}

	var album any
	if err := db.R.QueryRow(`SELECT album FROM now_playing WHERE id = 1`).Scan(&album); err != nil {
		t.Fatal(err)
	}
	if album != nil {
		t.Errorf("album = %#v, want NULL", album)
	}

	got, _, err := db.Current(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if got.Track.Album != "" {
		t.Errorf("Album = %q, want empty", got.Track.Album)
	}
}
