package art

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func store(t *testing.T) Store {
	t.Helper()
	return Store{Dir: filepath.Join(t.TempDir(), "art")}
}

func TestSaveIsContentAddressedAndIdempotent(t *testing.T) {
	s := store(t)
	first, err := s.Save([]byte("cover bytes"))
	if err != nil {
		t.Fatalf("Save: %v", err)
	}
	second, err := s.Save([]byte("cover bytes"))
	if err != nil {
		t.Fatal(err)
	}
	if first != second {
		t.Errorf("same bytes gave %q then %q", first, second)
	}
	other, err := s.Save([]byte("different bytes"))
	if err != nil {
		t.Fatal(err)
	}
	if other == first {
		t.Error("different bytes gave the same hash")
	}

	entries, err := os.ReadDir(s.Dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 2 {
		t.Errorf("%d files on disk, want 2", len(entries))
	}
}

func TestSavedFileIsTheBytesItWasGiven(t *testing.T) {
	s := store(t)
	hash, err := s.Save([]byte("exactly this"))
	if err != nil {
		t.Fatal(err)
	}
	path, err := s.Path(hash)
	if err != nil {
		t.Fatal(err)
	}
	got, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != "exactly this" {
		t.Errorf("read %q", got)
	}
}

func TestSaveLeavesNoTemporaryFiles(t *testing.T) {
	s := store(t)
	if _, err := s.Save([]byte("x")); err != nil {
		t.Fatal(err)
	}
	entries, err := os.ReadDir(s.Dir)
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range entries {
		if strings.HasPrefix(e.Name(), ".tmp-") {
			t.Errorf("left %q behind", e.Name())
		}
	}
}

// The hash arrives from a URL path and is used as a filename.
func TestPathRefusesAnythingThatIsNotAHash(t *testing.T) {
	s := store(t)
	for _, bad := range []string{
		"../../../etc/passwd",
		"..",
		"/etc/passwd",
		"abc",
		strings.Repeat("g", 64),
		strings.Repeat("a", 63),
		strings.Repeat("a", 65),
		"",
		strings.Repeat("A", 64),
		strings.Repeat("a", 32) + "/" + strings.Repeat("b", 31),
	} {
		if _, err := s.Path(bad); err == nil {
			t.Errorf("Path(%q) was accepted", bad)
		}
		if IsHash(bad) {
			t.Errorf("IsHash(%q) = true", bad)
		}
	}

	good := strings.Repeat("0a", 32)
	if _, err := s.Path(good); err != nil {
		t.Errorf("Path(%q) = %v, want it accepted", good, err)
	}
}
