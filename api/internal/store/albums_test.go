package store

import (
	"context"
	"testing"
	"time"
)

func album(rank int, name string) Album {
	return Album{Rank: rank, Artist: "Artist", Album: name, Playcount: 100 - rank}
}

// An album that falls off the chart has to leave, so the period is replaced
// rather than merged.
func TestReplacingAPeriodDropsWhatIsGone(t *testing.T) {
	db := migrated(t)
	ctx := context.Background()

	if err := db.ReplaceTopAlbums(ctx, "7day", []Album{album(1, "A"), album(2, "B"), album(3, "C")}); err != nil {
		t.Fatal(err)
	}
	if err := db.ReplaceTopAlbums(ctx, "7day", []Album{album(1, "B"), album(2, "D")}); err != nil {
		t.Fatal(err)
	}

	stored, err := db.TopAlbums(ctx)
	if err != nil {
		t.Fatal(err)
	}
	got := stored["7day"]
	if len(got) != 2 {
		t.Fatalf("period has %d albums, want 2", len(got))
	}
	if got[0].Album != "B" || got[1].Album != "D" {
		t.Errorf("albums = %q, %q", got[0].Album, got[1].Album)
	}
}

func TestPeriodsDoNotDisturbEachOther(t *testing.T) {
	db := migrated(t)
	ctx := context.Background()

	if err := db.ReplaceTopAlbums(ctx, "7day", []Album{album(1, "Week")}); err != nil {
		t.Fatal(err)
	}
	if err := db.ReplaceTopAlbums(ctx, "overall", []Album{album(1, "Ever")}); err != nil {
		t.Fatal(err)
	}
	if err := db.ReplaceTopAlbums(ctx, "7day", []Album{album(1, "New week")}); err != nil {
		t.Fatal(err)
	}

	stored, err := db.TopAlbums(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(stored["overall"]) != 1 || stored["overall"][0].Album != "Ever" {
		t.Errorf("overall = %+v", stored["overall"])
	}
	if stored["7day"][0].Album != "New week" {
		t.Errorf("7day = %+v", stored["7day"])
	}
}

func TestAlbumsComeBackInRankOrder(t *testing.T) {
	db := migrated(t)
	// Inserted out of order; the chart's meaning is its ordering.
	err := db.ReplaceTopAlbums(context.Background(), "7day",
		[]Album{album(3, "Third"), album(1, "First"), album(2, "Second")})
	if err != nil {
		t.Fatal(err)
	}

	stored, err := db.TopAlbums(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	for i, want := range []string{"First", "Second", "Third"} {
		if stored["7day"][i].Album != want {
			t.Errorf("position %d = %q, want %q", i, stored["7day"][i].Album, want)
		}
	}
}

func TestArtHashesLooksUpManyAtOnce(t *testing.T) {
	db := migrated(t)
	ctx := context.Background()

	if err := db.RememberArt(ctx, "http://a/1", "hash-one", time.Now()); err != nil {
		t.Fatal(err)
	}
	if err := db.RememberArt(ctx, "http://a/2", "hash-two", time.Now()); err != nil {
		t.Fatal(err)
	}

	got, err := db.ArtHashes(ctx, []string{"http://a/1", "http://a/2", "http://a/missing"})
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 {
		t.Errorf("got %d hashes, want 2: %v", len(got), got)
	}
	if got["http://a/1"] != "hash-one" || got["http://a/2"] != "hash-two" {
		t.Errorf("hashes = %v", got)
	}

	empty, err := db.ArtHashes(ctx, nil)
	if err != nil {
		t.Errorf("ArtHashes(nil) = %v", err)
	}
	if len(empty) != 0 {
		t.Errorf("ArtHashes(nil) returned %v", empty)
	}
}
