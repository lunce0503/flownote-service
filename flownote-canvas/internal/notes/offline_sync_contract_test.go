package notes

import (
	"encoding/json"
	"testing"
)

func TestOfflineSyncFolderRequestAcceptsStableID(t *testing.T) {
	var request FolderCreateRequest
	if err := json.Unmarshal([]byte(`{"id":"33333333-3333-4333-8333-333333333333","name":"folder","note_ids":[]}`), &request); err != nil {
		t.Fatal(err)
	}
	if request.ID != "33333333-3333-4333-8333-333333333333" {
		t.Fatalf("folder id not preserved: %q", request.ID)
	}
}
