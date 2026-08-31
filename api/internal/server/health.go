package server

import (
	"encoding/json"
	"net/http"

	"kunhua.sh/api/internal/store"
)

type jobStatus struct {
	Name       string `json:"name"`
	OK         bool   `json:"ok"`
	FinishedAt string `json:"finished_at,omitempty"`
	Error      string `json:"error,omitempty"`
}

type healthResponse struct {
	OK       bool        `json:"ok"`
	Database string      `json:"database"`
	Jobs     []jobStatus `json:"jobs"`
}

// health reports service health.
// HTTP status depends only on database/query availability.
func health(db *store.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		resp := healthResponse{
			OK:       true,
			Database: "ok",
			Jobs:     []jobStatus{},
		}

		var one int
		if err := db.R.QueryRowContext(r.Context(), `SELECT 1`).Scan(&one); err != nil {
			failHealth(w, &resp, err)
			return
		}

		jobs, err := lastJobRuns(r, db)
		if err != nil {
			// SELECT 1 passed, so this points to schema/query mismatch.
			failHealth(w, &resp, err)
			return
		}
		resp.Jobs = jobs

		writeJSON(w, http.StatusOK, resp)
	}
}

func failHealth(w http.ResponseWriter, resp *healthResponse, err error) {
	resp.OK = false
	resp.Database = err.Error()
	writeJSON(w, http.StatusServiceUnavailable, *resp)
}

func lastJobRuns(r *http.Request, db *store.DB) ([]jobStatus, error) {
	rows, err := db.R.QueryContext(r.Context(), `
		SELECT name, ok, COALESCE(finished_at, ''), COALESCE(error, '')
		FROM job_runs ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	jobs := []jobStatus{}
	for rows.Next() {
		var j jobStatus
		var ok int
		if err := rows.Scan(&j.Name, &ok, &j.FinishedAt, &j.Error); err != nil {
			return nil, err
		}
		j.OK = ok == 1
		jobs = append(jobs, j)
	}

	return jobs, rows.Err()
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	// Health responses must not be cached.
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
