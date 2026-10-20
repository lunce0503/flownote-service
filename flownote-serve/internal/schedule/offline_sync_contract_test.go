package schedule

import (
	"encoding/json"
	"testing"
)

func TestOfflineSyncScheduleRequestAcceptsStableID(t *testing.T) {
	var request itemRequest
	if err := json.Unmarshal([]byte(`{"id":"44444444-4444-4444-8444-444444444444","title":"offline","days_of_week":["MON"],"start_time":"09:00","end_time":"10:00"}`), &request); err != nil {
		t.Fatal(err)
	}
	if request.ID != "44444444-4444-4444-8444-444444444444" {
		t.Fatalf("schedule id not preserved: %q", request.ID)
	}
}
