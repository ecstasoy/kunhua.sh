//go:build linux

package host

import (
	"fmt"
	"time"

	"golang.org/x/sys/unix"
)

// uptime asks the kernel with sysinfo(2), which needs no filesystem at all and
// so survives the unit's ProcSubset=pid.
//
// The call is permitted by SystemCallFilter=@system-service and is not in
// @privileged, which the unit subtracts — checked with `systemd-analyze
// syscall-filter` before relying on it, since the filter's default action is
// SIGSYS and a wrong guess kills the process on the first request.
func uptime() (time.Duration, error) {
	var si unix.Sysinfo_t
	if err := unix.Sysinfo(&si); err != nil {
		return 0, fmt.Errorf("sysinfo: %w", err)
	}
	return time.Duration(si.Uptime) * time.Second, nil
}
