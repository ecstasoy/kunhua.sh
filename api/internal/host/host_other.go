//go:build !linux

package host

import (
	"errors"
	"time"
)

// The service only ever runs on Linux. This exists so the suite builds and runs
// on a developer's machine, where the honest answer is that the kernel is not
// being asked — and where the page therefore shows the same placeholder a
// production failure would produce.
func uptime() (time.Duration, error) {
	return 0, errors.New("machine uptime is only available on linux")
}
