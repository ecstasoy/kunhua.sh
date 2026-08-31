package host

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
	"time"
)

func TestUptimeAnswersOnLinuxAndAdmitsItElsewhere(t *testing.T) {
	got, err := Uptime()

	if runtime.GOOS != "linux" {
		// No pretending. A zero would render as "up 0m", which reads as a
		// reboot that never happened.
		if err == nil {
			t.Errorf("Uptime = %v with no error on %s", got, runtime.GOOS)
		}
		return
	}

	if err != nil {
		t.Fatalf("Uptime: %v", err)
	}
	if got <= 0 {
		t.Errorf("Uptime = %v, want a positive duration", got)
	}
	// Sanity, not precision: the machine running this booted at some point.
	if got > 100*365*24*time.Hour {
		t.Errorf("Uptime = %v, which is not a plausible machine", got)
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

func TestSymlinkTimeFailsWhenTheLinkIsMissing(t *testing.T) {
	if _, err := SymlinkTime(filepath.Join(t.TempDir(), "absent")); err == nil {
		t.Error("expected an error for a link that does not exist")
	}
}
