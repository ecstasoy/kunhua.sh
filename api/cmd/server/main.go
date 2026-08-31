// Command server is the kunhua.sh API: JSON only, listening on loopback,
// reached through Caddy at /api/*.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	// Compile the time zone database into the binary rather than reading the
	// host's /usr/share/zoneinfo. unattended-upgrades moves tzdata; nothing
	// about this service's behaviour should move with it.
	_ "time/tzdata"

	"kunhua.sh/api/internal/art"
	"kunhua.sh/api/internal/job"
	"kunhua.sh/api/internal/lastfm"
	"kunhua.sh/api/internal/server"
	"kunhua.sh/api/internal/store"
)

func main() {
	log := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(log)

	// The real work is in run() so its defers actually execute — os.Exit skips
	// them, so it may only be called here.
	if err := run(log); err != nil {
		log.Error("fatal", "err", err)
		os.Exit(1)
	}
}

func run(log *slog.Logger) error {
	dbPath := env("APP_DB", "./data/app.db")
	// Loopback, not 0.0.0.0. ufw already blocks 8080, but a bind address holds
	// even if a firewall rule is edited or a second interface appears.
	addr := env("APP_ADDR", "127.0.0.1:8080")
	// The site's release symlink, not the API's own: the homepage reports when
	// the site last deployed.
	releaseLink := env("APP_RELEASE_LINK", "/srv/kunhua.sh/current")
	// Under the one path the unit allows the service to write.
	arts := art.Store{Dir: env("APP_ART_DIR", "/srv/kunhua.sh/data/art")}

	db, err := store.Open(dbPath)
	if err != nil {
		return err
	}
	defer db.Close()

	// Migrations run before the listener opens. A database whose shape the
	// binary does not expect must not start answering requests.
	if err := db.Migrate(); err != nil {
		return err
	}
	log.Info("migrated", "db", dbPath)

	srv := &http.Server{
		Addr:    addr,
		Handler: server.New(db, log, server.Config{ReleaseLink: releaseLink, Art: arts}),
		// Without ReadHeaderTimeout a connection that sends half a request
		// header holds a slot indefinitely.
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	// Signals are registered before the listener opens: a SIGTERM arriving in
	// the gap would otherwise take the default action and kill the process.
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	waitJobs := startJobs(ctx, db, log, arts)

	// ListenAndServe blocks, so it runs on its own goroutine and reports
	// through a channel. Calling it here instead would mean a failure to bind
	// never reaches the select below.
	errc := make(chan error, 1)
	go func() {
		log.Info("listening", "addr", addr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errc <- err
		}
	}()

	select {
	case err := <-errc:
		return err
	case <-ctx.Done():
	}

	log.Info("shutting down")
	// Shorter than systemd's TimeoutStopSec (90s by default), so shutdown
	// finishes on its own terms rather than being SIGKILLed mid-way.
	sctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	err = srv.Shutdown(sctx)

	// Jobs share the signal context, so they are already unwinding; waiting
	// lets an in-flight fetch record its outcome rather than vanishing.
	waitJobs()
	return err
}

// startJobs launches the scheduled fetchers that are configured.
//
// A missing API key is not an error. Without one the fetcher simply does not
// exist: the endpoint reports nothing fetched and the page shows nothing,
// rather than a job failing every minute and filling the journal with the
// same line.
func startJobs(ctx context.Context, db *store.DB, log *slog.Logger, arts art.Store) func() {
	key, user := os.Getenv("LASTFM_API_KEY"), os.Getenv("LASTFM_USER")
	if key == "" || user == "" {
		log.Info("last.fm not configured; now-playing disabled")
		return func() {}
	}

	log.Info("last.fm configured", "user", user)
	c := lastfm.New(key, user)
	return job.Start(ctx, db, log, c.Job(db, arts), c.TopJob(db, arts))
}

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
