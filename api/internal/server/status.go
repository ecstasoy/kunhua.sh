package server

import (
	"net/http"
	"time"
)

// statusResponse is the contract the homepage reads.
//
// Both values are nullable on purpose. A machine fact that cannot be read is
// absent, never zero: a zero uptime would render as "up 0m" and look like a
// reboot that never happened. The frontend has the matching type, and
// status_test.go asserts these names and types field by field, so renaming one
// here turns a test red instead of quietly emptying a line on the page.
type statusResponse struct {
	UptimeSeconds *int64  `json:"uptime_seconds"`
	DeployedAt    *string `json:"deployed_at"`
	GeneratedAt   string  `json:"generated_at"`
}

func status(cfg Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		resp := statusResponse{GeneratedAt: cfg.Now().UTC().Format(time.RFC3339)}

		// Neither failure is an error for the response: the endpoint's promise
		// is that it always answers, and the page's promise is that a missing
		// value shows as missing.
		if d, err := cfg.Uptime(); err == nil {
			secs := int64(d.Seconds())
			resp.UptimeSeconds = &secs
		}
		if t, err := cfg.SymlinkTime(cfg.ReleaseLink); err == nil {
			at := t.UTC().Format(time.RFC3339)
			resp.DeployedAt = &at
		}

		writeJSON(w, http.StatusOK, resp)
	}
}
