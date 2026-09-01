// Package backup uploads the irreplaceable database snapshot off-machine.
package backup

import (
	"bytes"
	"context"
	"crypto/sha1"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"time"
)

const (
	DefaultAuthURL = "https://api.backblazeb2.com/b2api/v4/b2_authorize_account"
	maxJSONBody    = 1 << 20
	errorSnippet   = 400
)

type B2 struct {
	KeyID   string
	Key     string
	Bucket  string
	AuthURL string
	HTTP    *http.Client
}

func NewB2(keyID, key, bucket string) *B2 {
	return &B2{
		KeyID:   keyID,
		Key:     key,
		Bucket:  bucket,
		AuthURL: DefaultAuthURL,
		HTTP:    &http.Client{Timeout: 2 * time.Minute},
	}
}

// Configured reports whether upload credentials are present.
func (b *B2) Configured() bool {
	return b != nil && b.KeyID != "" && b.Key != "" && b.Bucket != ""
}

type authResponse struct {
	AuthorizationToken string `json:"authorizationToken"`
	APIInfo            struct {
		StorageAPI struct {
			APIURL  string `json:"apiUrl"`
			Buckets []struct {
				ID   string `json:"id"`
				Name string `json:"name"`
			} `json:"buckets"`
		} `json:"storageApi"`
	} `json:"apiInfo"`
}

type uploadURLResponse struct {
	UploadURL          string `json:"uploadUrl"`
	AuthorizationToken string `json:"authorizationToken"`
}

// Upload sends one local file to B2 under name.
func (b *B2) Upload(ctx context.Context, name, path string) error {
	body, err := os.ReadFile(path)
	if err != nil {
		return err
	}

	auth, bucketID, err := b.authorize(ctx)
	if err != nil {
		return err
	}
	target, err := b.uploadURL(ctx, auth, bucketID)
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, target.UploadURL, bytes.NewReader(body))
	if err != nil {
		return err
	}

	sum := sha1.Sum(body)
	req.Header.Set("Authorization", target.AuthorizationToken)
	req.Header.Set("X-Bz-File-Name", url.PathEscape(name))
	req.Header.Set("Content-Type", "application/octet-stream")
	req.Header.Set("X-Bz-Content-Sha1", hex.EncodeToString(sum[:]))
	req.ContentLength = int64(len(body))

	res, err := b.HTTP.Do(req)
	if err != nil {
		return fmt.Errorf("upload: %w", err)
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("upload returned %s: %s", res.Status, snippet(res.Body))
	}
	return nil
}

func (b *B2) authorize(ctx context.Context) (*authResponse, string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, b.AuthURL, nil)
	if err != nil {
		return nil, "", err
	}

	creds := base64.StdEncoding.EncodeToString([]byte(b.KeyID + ":" + b.Key))
	req.Header.Set("Authorization", "Basic "+creds)

	res, err := b.HTTP.Do(req)
	if err != nil {
		return nil, "", fmt.Errorf("authorize: %w", err)
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		return nil, "", fmt.Errorf("authorize returned %s: %s", res.Status, snippet(res.Body))
	}

	var out authResponse
	if err := json.NewDecoder(io.LimitReader(res.Body, maxJSONBody)).Decode(&out); err != nil {
		return nil, "", fmt.Errorf("authorize response: %w", err)
	}

	for _, bucket := range out.APIInfo.StorageAPI.Buckets {
		if bucket.Name == b.Bucket {
			return &out, bucket.ID, nil
		}
	}
	return nil, "", fmt.Errorf("the key does not name the bucket %q", b.Bucket)
}

func (b *B2) uploadURL(ctx context.Context, auth *authResponse, bucketID string) (*uploadURLResponse, error) {
	payload, err := json.Marshal(map[string]string{"bucketId": bucketID})
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		auth.APIInfo.StorageAPI.APIURL+"/b2api/v4/b2_get_upload_url",
		bytes.NewReader(payload),
	)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", auth.AuthorizationToken)
	req.Header.Set("Content-Type", "application/json")

	res, err := b.HTTP.Do(req)
	if err != nil {
		return nil, fmt.Errorf("get upload url: %w", err)
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("get upload url returned %s: %s", res.Status, snippet(res.Body))
	}

	var out uploadURLResponse
	if err := json.NewDecoder(io.LimitReader(res.Body, maxJSONBody)).Decode(&out); err != nil {
		return nil, err
	}
	return &out, nil
}

// snippet returns a small trimmed part of an error body.
func snippet(r io.Reader) string {
	b, _ := io.ReadAll(io.LimitReader(r, errorSnippet))
	return string(bytes.TrimSpace(b))
}
