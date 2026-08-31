// Package host reads facts about the machine itself. Nothing here calls out,
// touches the database, or can be rate-limited: the worst case is a value that
// is unavailable, never one that is slow or wrong.
package host

import (
	"os"
	"time"
)

// Uptime reports how long the machine has been up, asked of the kernel.
//
// Not derived from the service's own start time: restarting the service must
// not make the machine look like it just rebooted.
//
// The obvious source, /proc/uptime, is unreadable to this service by design —
// the unit sets ProcSubset=pid, which hides everything in /proc that is not a
// process directory. Reading it returned "no such file" and the page showed a
// placeholder, with nothing failing anywhere. Rather than drop the constraint
// to fit the feature, the platform implementations below ask the kernel
// directly; see host_linux.go.
//
// Where there is no such call the error is returned and the page shows its
// placeholder, which means a developer meets the degraded path daily instead
// of first meeting it in production.
func Uptime() (time.Duration, error) { return uptime() }

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
