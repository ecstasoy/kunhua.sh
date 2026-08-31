package host

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestUptimeReadsTheKernelCounter(t *testing.T) {
	dir := t.TempDir()
	f := filepath.Join(dir, "uptime")
	// The real file's shape: uptime and idle time, space separated.
	if err := os.WriteFile(f, []byte("5400.42 12345.67\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	old := UptimeFile
	UptimeFile = f
	t.Cleanup(func() { UptimeFile = old })

	got, err := Uptime()
	if err != nil {
		t.Fatalf("Uptime: %v", err)
	}
	if want := 5400 * time.Second; got.Round(time.Second) != want {
		t.Errorf("Uptime = %v, want %v", got, want)
	}
}

func TestUptimeFailsRatherThanGuessing(t *testing.T) {
	// Every machine without /proc takes this path, including the one this is
	// written on. A zero would be worse than an error: it renders.
	old := UptimeFile
	UptimeFile = filepath.Join(t.TempDir(), "absent")
	t.Cleanup(func() { UptimeFile = old })

	if _, err := Uptime(); err == nil {
		t.Error("expected an error when the counter is unreadable")
	}
}

func TestSymlinkTimeReportsTheLinkNotItsTarget(t *testing.T) {
	dir := t.TempDir()
	target := filepath.Join(dir, "release")
	link := filepath.Join(dir, "current")
	if err := os.Mkdir(target, 0o755); err != nil {
		t.Fatal(err)
	}

	// A release copied a week ago and made live just now — which is what a
	// rollback looks like. Following the link would report the week-old time.
	//
	// The target is stamped rather than the link because os.Chtimes follows
	// symlinks; the standard library cannot stamp a link itself. Creating the
	// link is what dates it, and creating it is what the release script does.
	week := time.Now().Add(-7 * 24 * time.Hour)
	if err := os.Chtimes(target, week, week); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(target, link); err != nil {
		t.Fatal(err)
	}

	got, err := SymlinkTime(link)
	if err != nil {
		t.Fatalf("SymlinkTime: %v", err)
	}
	if time.Since(got) > time.Minute {
		t.Errorf("SymlinkTime = %v: it followed the link to a target dated %v", got, week)
	}
}
