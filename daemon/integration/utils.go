package integration

import (
	"context"
	"fmt"
	"time"
)

// WaitFor waits for a condition to be true with a timeout
func WaitFor(condition func() bool, timeout time.Duration) error {
	deadline := time.After(timeout)
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-deadline:
			return fmt.Errorf("timeout waiting for condition")
		case <-ticker.C:
			if condition() {
				return nil
			}
		}
	}
}

// WaitForWithContext waits for a condition to be true with a context
func WaitForWithContext(ctx context.Context, condition func() bool) error {
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			if condition() {
				return nil
			}
		}
	}
}

// Sleep is a convenience function for sleeping in tests
func Sleep(duration time.Duration) {
	time.Sleep(duration)
}
