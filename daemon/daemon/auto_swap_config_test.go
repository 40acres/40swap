package daemon

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

// NewAutoSwapTestConfig creates a new AutoSwapConfig with default values
func NewAutoSwapTestConfig() *AutoSwapConfig {
	return &AutoSwapConfig{
		Enabled:              false,
		CheckIntervalMinutes: 10,
		TargetBalanceBTC:     1.0,
		BackoffFactor:        0.5,
		MaxAttempts:          3,
		RoutingFeeLimitPPM:   1000,
		MinSwapSizeBTC:       0.001,
		MaxSwapSizeBTC:       0.1,
	}
}

func TestAutoSwapConfig(t *testing.T) {
	t.Run("NewAutoSwapConfig", func(t *testing.T) {
		config := NewAutoSwapTestConfig()
		require.NotNil(t, config)
		require.False(t, config.Enabled)
		require.Equal(t, 10, config.CheckIntervalMinutes)
		require.Equal(t, 1.0, config.TargetBalanceBTC)
		require.Equal(t, 0.5, config.BackoffFactor)
		require.Equal(t, 3, config.MaxAttempts)
		require.Equal(t, 1000, config.RoutingFeeLimitPPM)
		require.Equal(t, 0.001, config.MinSwapSizeBTC)
		require.Equal(t, 0.1, config.MaxSwapSizeBTC)
	})

	t.Run("NewAutoSwapConfigFromFlags", func(t *testing.T) {
		config := NewAutoSwapConfigFromFlags(
			true,  // enabled
			5,     // interval
			2.0,   // target balance
			0.7,   // backoff factor
			5,     // max attempts
			500,   // routing fee limit
			0.005, // min swap size
			0.2,   // max swap size
		)
		require.NotNil(t, config)
		require.True(t, config.Enabled)
		require.Equal(t, 5, config.CheckIntervalMinutes)
		require.Equal(t, 2.0, config.TargetBalanceBTC)
		require.Equal(t, 0.7, config.BackoffFactor)
		require.Equal(t, 5, config.MaxAttempts)
		require.Equal(t, 500, config.RoutingFeeLimitPPM)
		require.Equal(t, 0.005, config.MinSwapSizeBTC)
		require.Equal(t, 0.2, config.MaxSwapSizeBTC)
	})

	t.Run("GetCheckInterval", func(t *testing.T) {
		config := NewAutoSwapTestConfig()
		interval := config.GetCheckInterval()
		require.Equal(t, 10*time.Minute, interval)
	})

	t.Run("IsEnabled", func(t *testing.T) {
		config := NewAutoSwapTestConfig()
		require.False(t, config.IsEnabled())

		config.Enabled = true
		require.True(t, config.IsEnabled())
	})

	t.Run("Validate", func(t *testing.T) {
		t.Run("Valid config", func(t *testing.T) {
			config := NewAutoSwapTestConfig()
			err := config.Validate()
			require.NoError(t, err)
		})

		t.Run("Invalid check interval", func(t *testing.T) {
			config := NewAutoSwapTestConfig()
			config.CheckIntervalMinutes = 0
			err := config.Validate()
			require.Error(t, err)
			require.Contains(t, err.Error(), "check interval must be positive")
		})

		t.Run("Invalid target balance", func(t *testing.T) {
			config := NewAutoSwapTestConfig()
			config.TargetBalanceBTC = -1.0
			err := config.Validate()
			require.Error(t, err)
			require.Contains(t, err.Error(), "target balance must be positive")
		})

		t.Run("Invalid backoff factor", func(t *testing.T) {
			config := NewAutoSwapTestConfig()
			config.BackoffFactor = 1.5
			err := config.Validate()
			require.Error(t, err)
			require.Contains(t, err.Error(), "backoff factor must be between 0 and 1")
		})

		t.Run("Invalid swap sizes", func(t *testing.T) {
			config := NewAutoSwapTestConfig()
			config.MinSwapSizeBTC = 0.2
			config.MaxSwapSizeBTC = 0.1
			err := config.Validate()
			require.Error(t, err)
			require.Contains(t, err.Error(), "max swap size must be greater than min swap size")
		})
	})
}
