package canvas

import (
	"encoding/json"
	"testing"
)

func TestOfflineSyncCreateRequestsAcceptStableIDs(t *testing.T) {
	var document DocumentRequest
	if err := json.Unmarshal([]byte(`{"id":"11111111-1111-4111-8111-111111111111","title":"offline"}`), &document); err != nil {
		t.Fatal(err)
	}
	if document.ID != "11111111-1111-4111-8111-111111111111" {
		t.Fatalf("document id not preserved: %q", document.ID)
	}
	var folder FolderRequest
	if err := json.Unmarshal([]byte(`{"id":"22222222-2222-4222-8222-222222222222","name":"folder","canvas_ids":[]}`), &folder); err != nil {
		t.Fatal(err)
	}
	if folder.ID != "22222222-2222-4222-8222-222222222222" {
		t.Fatalf("folder id not preserved: %q", folder.ID)
	}
}
