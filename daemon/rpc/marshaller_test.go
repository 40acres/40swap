package rpc

import (
	"testing"
)

func TestStatusMarshalJSON(t *testing.T) {
	status := Status(Status_CONTRACT_CLAIMED_UNCONFIRMED)
	expected := `"CONTRACT_CLAIMED_UNCONFIRMED"`

	result, err := status.MarshalJSON()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if string(result) != expected {
		t.Errorf("expected %s, got %s", expected, result)
	}
}

func TestStatusMarshalIndent(t *testing.T) {
	status := Status(Status_CONTRACT_CLAIMED_UNCONFIRMED)
	expected := `"CONTRACT_CLAIMED_UNCONFIRMED"`

	result, err := status.MarshalIndent("", "  ")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if string(result) != expected {
		t.Errorf("expected %s, got %s", expected, result)
	}
}
