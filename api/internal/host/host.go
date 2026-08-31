// Package host reads facts about the machine itself. Nothing here calls out,
// touches the database, or can be rate-limited: the worst case is a value that
// is unavailable, never one that is slow or wrong.
package host

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

// UptimeFile is where Linux keeps the kernel's own counter. It is a variable so
// tests can point at a fixture; there is no other reason to change it.
var UptimeFile = "/proc/uptime"

// Uptime reports how long the machine has been up, straight from the kernel.
//
// Not derived from the service's own start time: restarting the service must
// not make the machine look like it just rebooted. On anything without /proc —
// a developer's macOS, say — this returns an error, and the page shows its
// placeholder. That is the degraded path being exercised in development rather
// than only in production.
func Uptime() (time.Duration, error) {
	b, err := os.ReadFile(UptimeFile)
	if err != nil {
		return 0, err
	}
	// "12345.67 89012.34" — uptime first, idle time second.
	first, _, _ := strings.Cut(strings.TrimSpace(string(b)), " ")
	secs, err := strconv.ParseFloat(first, 64)
	if err != nil {
		return 0, fmt.Errorf("parse %s: %w", UptimeFile, err)
	}
	return time.Duration(secs * float64(time.Second)), nil
}

// SymlinkTime reports when a symlink was last written — for the release link,
// the moment of the swap that put a build live.
//
// Lstat, not Stat: Stat follows the link and would report the release
// directory's own timestamp, which is when it was copied rather than when it
// began being served. Rolling back to an older release would then show a
// deploy time from days ago.
func SymlinkTime(path string) (time.Time, error) {
	fi, err := os.Lstat(path)
	if err != nil {
		return time.Time{}, err
	}
	return fi.ModTime(), nil
}
