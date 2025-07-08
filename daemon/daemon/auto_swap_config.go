package daemon

import (
	"fmt"
	"time"
)

// ErrInvalidConfig is returned when the auto swap configuration is invalid
func ErrInvalidConfig(message string) error {
	return fmt.Errorf("invalid auto swap config: %s", message)
}

// AutoSwapConfig holds the configuration for auto swap functionality
type AutoSwapConfig struct {
	Enabled              bool
	CheckIntervalMinutes int
	TargetBalanceBTC     float64
	BackoffFactor        float64
	MaxAttempts          int
	RoutingFeeLimitPPM   int
	MinSwapSizeBTC       float64
	MaxSwapSizeBTC       float64
}

// NewAutoSwapConfig creates a new AutoSwapConfig with default values
func NewAutoSwapConfig() *AutoSwapConfig {
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

// NewAutoSwapConfigFromFlags creates a new AutoSwapConfig from CLI flags
func NewAutoSwapConfigFromFlags(
	enabled bool,
	interval int,
	targetBalance float64,
	backoffFactor float64,
	maxAttempts int,
	routingFeeLimitPPM int,
	minSwapSize float64,
	maxSwapSize float64,
) *AutoSwapConfig {
	return &AutoSwapConfig{
		Enabled:              enabled,
		CheckIntervalMinutes: interval,
		TargetBalanceBTC:     targetBalance,
		BackoffFactor:        backoffFactor,
		MaxAttempts:          maxAttempts,
		RoutingFeeLimitPPM:   routingFeeLimitPPM,
		MinSwapSizeBTC:       minSwapSize,
		MaxSwapSizeBTC:       maxSwapSize,
	}
}

// GetCheckInterval returns the check interval as a time.Duration
func (c *AutoSwapConfig) GetCheckInterval() time.Duration {
	return time.Duration(c.CheckIntervalMinutes) * time.Minute
}

// IsEnabled returns whether auto swap is enabled
func (c *AutoSwapConfig) IsEnabled() bool {
	return c.Enabled
}

// Validate checks if the configuration is valid
func (c *AutoSwapConfig) Validate() error {
	if c.CheckIntervalMinutes <= 0 {
		return ErrInvalidConfig("check interval must be positive")
	}
	if c.TargetBalanceBTC <= 0 {
		return ErrInvalidConfig("target balance must be positive")
	}
	if c.BackoffFactor <= 0 || c.BackoffFactor >= 1 {
		return ErrInvalidConfig("backoff factor must be between 0 and 1")
	}
	if c.MaxAttempts <= 0 {
		return ErrInvalidConfig("max attempts must be positive")
	}
	if c.RoutingFeeLimitPPM < 0 {
		return ErrInvalidConfig("routing fee limit must be non-negative")
	}
	if c.MinSwapSizeBTC <= 0 {
		return ErrInvalidConfig("min swap size must be positive")
	}
	if c.MaxSwapSizeBTC <= c.MinSwapSizeBTC {
		return ErrInvalidConfig("max swap size must be greater than min swap size")
	}
	return nil
}
