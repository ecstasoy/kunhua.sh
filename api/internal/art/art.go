// Package art stores cover images on disk, named by the hash of their content.
package art

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
)

// Store is a directory of cover files.
type Store struct{ Dir string }

// Names come from a URL path, so anything but 64 hex characters is refused.
var hashPattern = regexp.MustCompile(`^[0-9a-f]{64}$`)

func IsHash(s string) bool { return hashPattern.MatchString(s) }

// Save writes the bytes unless already stored, and returns their hash.
func (s Store) Save(b []byte) (string, error) {
	sum := sha256.Sum256(b)
	hash := hex.EncodeToString(sum[:])

	if err := os.MkdirAll(s.Dir, 0o750); err != nil {
		return "", err
	}
	path := filepath.Join(s.Dir, hash)
	if _, err := os.Stat(path); err == nil {
		return hash, nil
	}

	// Write then rename, so a reader never opens a half-written file.
	tmp, err := os.CreateTemp(s.Dir, ".tmp-*")
	if err != nil {
		return "", err
	}
	defer os.Remove(tmp.Name())

	if _, err := tmp.Write(b); err != nil {
		tmp.Close()
		return "", err
	}
	if err := tmp.Close(); err != nil {
		return "", err
	}
	if err := os.Chmod(tmp.Name(), 0o640); err != nil {
		return "", err
	}
	if err := os.Rename(tmp.Name(), path); err != nil {
		return "", err
	}
	return hash, nil
}

// Path returns where a hash is stored, refusing anything that is not a hash.
func (s Store) Path(hash string) (string, error) {
	if !IsHash(hash) {
		return "", fmt.Errorf("not a content hash: %q", hash)
	}
	return filepath.Join(s.Dir, hash), nil
}
