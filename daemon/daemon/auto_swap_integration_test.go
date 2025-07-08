package daemon

import (
	"context"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/40acres/40swap/daemon/lightning"
	"github.com/40acres/40swap/daemon/rpc"
	swaps "github.com/40acres/40swap/daemon/swaps"
	"github.com/lightningnetwork/lnd/lnrpc"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

// Integration test helpers
type TestAutoSwapEnvironment struct {
	Config          *AutoSwapConfig
	SwapClient      swaps.ClientInterface
	LightningClient lightning.Client
	RPCClient       rpc.SwapServiceClient
	Service         *AutoSwapService
}

func setupTestEnvironment(_ *testing.T) *TestAutoSwapEnvironment {
	config := NewAutoSwapConfig()
	config.Enabled = true
	config.TargetBalanceBTC = 1.0
	config.MaxSwapSizeBTC = 0.1
	config.MinSwapSizeBTC = 0.001
	config.MaxAttempts = 3
	config.BackoffFactor = 0.5
	config.RoutingFeeLimitPPM = 1000

	// Create mock clients
	swapClient := &MockSwapClient{}
	lightningClient := &MockLightningClient{}
	rpcClient := &MockRPCClient{}

	service := NewAutoSwapService(swapClient, rpcClient, lightningClient, config)

	return &TestAutoSwapEnvironment{
		Config:          config,
		SwapClient:      swapClient,
		LightningClient: lightningClient,
		RPCClient:       rpcClient,
		Service:         service,
	}
}

func setupBenchmarkEnvironment(_ *testing.B) *TestAutoSwapEnvironment {
	config := NewAutoSwapConfig()
	config.Enabled = true
	config.TargetBalanceBTC = 1.0
	config.MaxSwapSizeBTC = 0.1
	config.MinSwapSizeBTC = 0.001
	config.MaxAttempts = 3
	config.BackoffFactor = 0.5
	config.RoutingFeeLimitPPM = 1000

	swapClient := &MockSwapClient{}
	lightningClient := &MockLightningClient{}
	rpcClient := &MockRPCClient{}

	service := NewAutoSwapService(swapClient, rpcClient, lightningClient, config)

	return &TestAutoSwapEnvironment{
		Config:          config,
		SwapClient:      swapClient,
		LightningClient: lightningClient,
		RPCClient:       rpcClient,
		Service:         service,
	}
}

func TestAutoSwapIntegration(t *testing.T) {
	t.Run("CompleteAutoSwapWorkflow", func(t *testing.T) {
		env := setupTestEnvironment(t)

		// Setup mocks for a complete workflow
		env.LightningClient.(*MockLightningClient).On("GetInfo", mock.Anything).Return(&lnrpc.GetInfoResponse{
			Features: map[uint32]*lnrpc.Feature{
				17: {Name: "MPP_OPT", IsKnown: true},
			},
		}, nil)

		env.LightningClient.(*MockLightningClient).On("GetChannelLocalBalance", mock.Anything).Return(
			decimal.NewFromFloat(1.5), nil)

		env.LightningClient.(*MockLightningClient).On("GenerateAddress", mock.Anything).Return("bc1test", nil)

		env.RPCClient.(*MockRPCClient).On("SwapOut", mock.Anything, mock.Anything).Return(&rpc.SwapOutResponse{
			SwapId:     "test-swap-id",
			AmountSats: 100000000,
		}, nil)

		// Test the complete workflow
		err := env.Service.RunAutoSwapCheck(context.Background())
		require.NoError(t, err)

		// Verify swap was initiated
		assert.True(t, env.Service.hasRunningSwap())
		assert.Contains(t, env.Service.runningSwaps, "test-swap-id")

		// Verify the correct amount was requested (excess amount capped at max size)
		expectedAmount := uint64(0.1 * 100000000) // 0.1 BTC in sats
		env.RPCClient.(*MockRPCClient).AssertCalled(t, "SwapOut", mock.Anything, mock.MatchedBy(func(req *rpc.SwapOutRequest) bool {
			return req.AmountSats == expectedAmount
		}))
	})

	t.Run("AutoSwapWithBackoffRetry", func(t *testing.T) {
		env := setupTestEnvironment(t)
		env.Config.MaxAttempts = 2

		// Setup mocks
		env.LightningClient.(*MockLightningClient).On("GetInfo", mock.Anything).Return(&lnrpc.GetInfoResponse{
			Features: map[uint32]*lnrpc.Feature{
				17: {Name: "MPP_OPT", IsKnown: true},
			},
		}, nil)

		env.LightningClient.(*MockLightningClient).On("GetChannelLocalBalance", mock.Anything).Return(
			decimal.NewFromFloat(1.5), nil)

		env.LightningClient.(*MockLightningClient).On("GenerateAddress", mock.Anything).Return("bc1test", nil)

		// First attempt fails
		env.RPCClient.(*MockRPCClient).On("SwapOut", mock.Anything, mock.MatchedBy(func(req *rpc.SwapOutRequest) bool {
			return req.AmountSats == 10000000 // 0.1 BTC
		})).Return(nil, assert.AnError)

		// Second attempt succeeds with reduced amount
		env.RPCClient.(*MockRPCClient).On("SwapOut", mock.Anything, mock.MatchedBy(func(req *rpc.SwapOutRequest) bool {
			return req.AmountSats == 5000000 // 0.05 BTC (0.1 * 0.5)
		})).Return(&rpc.SwapOutResponse{
			SwapId:     "test-swap-id",
			AmountSats: 5000000,
		}, nil)

		err := env.Service.RunAutoSwapCheck(context.Background())
		require.NoError(t, err)

		// Verify both attempts were made
		env.RPCClient.(*MockRPCClient).AssertNumberOfCalls(t, "SwapOut", 2)
	})

	t.Run("AutoSwapMonitoring", func(t *testing.T) {
		env := setupTestEnvironment(t)

		// Add a swap to the running list
		env.Service.addRunningSwap("test-swap")

		// Mock GetSwapOut to return different statuses
		env.RPCClient.(*MockRPCClient).On("GetSwapOut", mock.Anything, &rpc.GetSwapOutRequest{Id: "test-swap"}).Return(
			&rpc.GetSwapOutResponse{
				Id:     "test-swap",
				Status: rpc.Status_DONE,
			}, nil)

		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()

		// Start monitoring
		go env.Service.monitorSwapUntilTerminal(ctx, "test-swap")

		// Wait for monitoring to complete
		time.Sleep(100 * time.Millisecond)

		// Verify swap was removed
		assert.False(t, env.Service.hasRunningSwap())
	})

	t.Run("AutoSwapWithDifferentConfigurations", func(t *testing.T) {
		testCases := []struct {
			name          string
			config        *AutoSwapConfig
			balance       float64
			expectedSwaps int
			expectedError bool
		}{
			{
				name: "High balance with large max size",
				config: func() *AutoSwapConfig {
					c := NewAutoSwapConfig()
					c.Enabled = true
					c.TargetBalanceBTC = 1.0
					c.MaxSwapSizeBTC = 0.5
					c.MinSwapSizeBTC = 0.001
					return c
				}(),
				balance:       2.0,
				expectedSwaps: 1,
				expectedError: false,
			},
			{
				name: "Low balance - no swap needed",
				config: func() *AutoSwapConfig {
					c := NewAutoSwapConfig()
					c.Enabled = true
					c.TargetBalanceBTC = 1.0
					c.MaxSwapSizeBTC = 0.1
					c.MinSwapSizeBTC = 0.001
					return c
				}(),
				balance:       0.5,
				expectedSwaps: 0,
				expectedError: false,
			},
			{
				name: "Excess amount below minimum",
				config: func() *AutoSwapConfig {
					c := NewAutoSwapConfig()
					c.Enabled = true
					c.TargetBalanceBTC = 1.0
					c.MaxSwapSizeBTC = 0.1
					c.MinSwapSizeBTC = 0.1
					return c
				}(),
				balance:       1.05, // Only 0.05 BTC excess
				expectedSwaps: 0,
				expectedError: false,
			},
		}

		for _, tc := range testCases {
			t.Run(tc.name, func(t *testing.T) {
				env := setupTestEnvironment(t)
				env.Service.config = tc.config

				// Setup mocks
				env.LightningClient.(*MockLightningClient).On("GetInfo", mock.Anything).Return(&lnrpc.GetInfoResponse{
					Features: map[uint32]*lnrpc.Feature{
						17: {Name: "MPP_OPT", IsKnown: true},
					},
				}, nil)

				env.LightningClient.(*MockLightningClient).On("GetChannelLocalBalance", mock.Anything).Return(
					decimal.NewFromFloat(tc.balance), nil)

				if tc.expectedSwaps > 0 {
					env.LightningClient.(*MockLightningClient).On("GenerateAddress", mock.Anything).Return("bc1test", nil)
					env.RPCClient.(*MockRPCClient).On("SwapOut", mock.Anything, mock.Anything).Return(&rpc.SwapOutResponse{
						SwapId:     "test-swap-id",
						AmountSats: 100000000,
					}, nil)
				}

				err := env.Service.RunAutoSwapCheck(context.Background())

				if tc.expectedError {
					assert.Error(t, err)
				} else {
					assert.NoError(t, err)
				}

				env.RPCClient.(*MockRPCClient).AssertNumberOfCalls(t, "SwapOut", tc.expectedSwaps)
			})
		}
	})
}

func TestAutoSwapErrorHandling(t *testing.T) {
	t.Run("LightningClientErrors", func(t *testing.T) {
		testCases := []struct {
			name          string
			getInfoError  error
			balanceError  error
			addressError  error
			expectedError bool
		}{
			{
				name:          "GetInfo fails",
				getInfoError:  assert.AnError,
				balanceError:  nil,
				addressError:  nil,
				expectedError: false, // Should continue despite GetInfo failure
			},
			{
				name:          "GetBalance fails",
				getInfoError:  nil,
				balanceError:  assert.AnError,
				addressError:  nil,
				expectedError: true,
			},
			{
				name:          "GenerateAddress fails",
				getInfoError:  nil,
				balanceError:  nil,
				addressError:  assert.AnError,
				expectedError: true,
			},
		}

		for _, tc := range testCases {
			t.Run(tc.name, func(t *testing.T) {
				env := setupTestEnvironment(t)

				// Setup mocks
				if tc.getInfoError != nil {
					env.LightningClient.(*MockLightningClient).On("GetInfo", mock.Anything).Return(nil, tc.getInfoError)
				} else {
					env.LightningClient.(*MockLightningClient).On("GetInfo", mock.Anything).Return(&lnrpc.GetInfoResponse{
						Features: map[uint32]*lnrpc.Feature{
							17: {Name: "MPP_OPT", IsKnown: true},
						},
					}, nil)
				}

				if tc.balanceError != nil {
					env.LightningClient.(*MockLightningClient).On("GetChannelLocalBalance", mock.Anything).Return(
						decimal.Zero, tc.balanceError)
				} else {
					env.LightningClient.(*MockLightningClient).On("GetChannelLocalBalance", mock.Anything).Return(
						decimal.NewFromFloat(1.5), nil)
				}

				if tc.addressError != nil {
					env.LightningClient.(*MockLightningClient).On("GenerateAddress", mock.Anything).Return("", tc.addressError)
				} else if tc.balanceError == nil {
					env.LightningClient.(*MockLightningClient).On("GenerateAddress", mock.Anything).Return("bc1test", nil)
				}

				err := env.Service.RunAutoSwapCheck(context.Background())

				if tc.expectedError {
					assert.Error(t, err)
				} else {
					assert.NoError(t, err)
				}
			})
		}
	})

	t.Run("RPCClientErrors", func(t *testing.T) {
		env := setupTestEnvironment(t)

		// Setup mocks
		env.LightningClient.(*MockLightningClient).On("GetInfo", mock.Anything).Return(&lnrpc.GetInfoResponse{
			Features: map[uint32]*lnrpc.Feature{
				17: {Name: "MPP_OPT", IsKnown: true},
			},
		}, nil)

		env.LightningClient.(*MockLightningClient).On("GetChannelLocalBalance", mock.Anything).Return(
			decimal.NewFromFloat(1.5), nil)

		env.LightningClient.(*MockLightningClient).On("GenerateAddress", mock.Anything).Return("bc1test", nil)

		// Mock SwapOut to fail
		env.RPCClient.(*MockRPCClient).On("SwapOut", mock.Anything, mock.Anything).Return(nil, assert.AnError)

		err := env.Service.RunAutoSwapCheck(context.Background())
		assert.Error(t, err)
		assert.Contains(t, err.Error(), assert.AnError.Error())
	})

	t.Run("MonitoringErrors", func(t *testing.T) {
		env := setupTestEnvironment(t)

		// Add a swap to the running list
		env.Service.addRunningSwap("test-swap")

		// Mock GetSwapOut to return error
		env.RPCClient.(*MockRPCClient).On("GetSwapOut", mock.Anything, &rpc.GetSwapOutRequest{Id: "test-swap"}).Return(
			nil, assert.AnError)

		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()

		// Start monitoring
		go env.Service.monitorSwapUntilTerminal(ctx, "test-swap")

		// Wait for monitoring to attempt polling
		time.Sleep(100 * time.Millisecond)

		// Verify swap is still in running list (error occurred, should continue polling)
		assert.True(t, env.Service.hasRunningSwap())
	})
}

func TestAutoSwapConcurrencyAndRaceConditions(t *testing.T) {
	t.Run("ConcurrentAutoSwapChecks", func(t *testing.T) {
		env := setupTestEnvironment(t)

		// Setup mocks
		env.LightningClient.(*MockLightningClient).On("GetInfo", mock.Anything).Return(&lnrpc.GetInfoResponse{
			Features: map[uint32]*lnrpc.Feature{
				17: {Name: "MPP_OPT", IsKnown: true},
			},
		}, nil)

		env.LightningClient.(*MockLightningClient).On("GetChannelLocalBalance", mock.Anything).Return(
			decimal.NewFromFloat(1.5), nil)

		env.LightningClient.(*MockLightningClient).On("GenerateAddress", mock.Anything).Return("bc1test", nil)

		env.RPCClient.(*MockRPCClient).On("SwapOut", mock.Anything, mock.Anything).Return(&rpc.SwapOutResponse{
			SwapId:     "test-swap-id",
			AmountSats: 100000000,
		}, nil)

		// Run multiple concurrent auto swap checks
		var wg sync.WaitGroup
		const numGoroutines = 5

		wg.Add(numGoroutines)
		for i := 0; i < numGoroutines; i++ {
			go func() {
				defer wg.Done()
				env.Service.RunAutoSwapCheck(context.Background())
			}()
		}

		wg.Wait()

		// Only one swap should be running (the first one)
		assert.Len(t, env.Service.runningSwaps, 1)
		assert.Contains(t, env.Service.runningSwaps, "test-swap-id")
	})

	t.Run("ConcurrentMonitoring", func(t *testing.T) {
		env := setupTestEnvironment(t)

		// Add multiple swaps
		env.Service.addRunningSwap("swap1")
		env.Service.addRunningSwap("swap2")
		env.Service.addRunningSwap("swap3")

		// Mock GetSwapOut for all swaps
		env.RPCClient.(*MockRPCClient).On("GetSwapOut", mock.Anything, &rpc.GetSwapOutRequest{Id: "swap1"}).Return(
			&rpc.GetSwapOutResponse{Id: "swap1", Status: rpc.Status_DONE}, nil)
		env.RPCClient.(*MockRPCClient).On("GetSwapOut", mock.Anything, &rpc.GetSwapOutRequest{Id: "swap2"}).Return(
			&rpc.GetSwapOutResponse{Id: "swap2", Status: rpc.Status_CONTRACT_EXPIRED}, nil)
		env.RPCClient.(*MockRPCClient).On("GetSwapOut", mock.Anything, &rpc.GetSwapOutRequest{Id: "swap3"}).Return(
			&rpc.GetSwapOutResponse{Id: "swap3", Status: rpc.Status_DONE}, nil)

		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()

		// Start concurrent monitoring
		var wg sync.WaitGroup
		wg.Add(3)
		go func() {
			defer wg.Done()
			env.Service.monitorSwapUntilTerminal(ctx, "swap1")
		}()
		go func() {
			defer wg.Done()
			env.Service.monitorSwapUntilTerminal(ctx, "swap2")
		}()
		go func() {
			defer wg.Done()
			env.Service.monitorSwapUntilTerminal(ctx, "swap3")
		}()

		wg.Wait()

		// All swaps should be removed
		assert.False(t, env.Service.hasRunningSwap())
		assert.Empty(t, env.Service.runningSwaps)
	})
}

func TestAutoSwapConfigurationValidation(t *testing.T) {
	t.Run("InvalidConfigurations", func(t *testing.T) {
		testCases := []struct {
			name        string
			config      *AutoSwapConfig
			expectError bool
		}{
			{
				name: "Negative target balance",
				config: func() *AutoSwapConfig {
					c := NewAutoSwapConfig()
					c.TargetBalanceBTC = -1.0
					return c
				}(),
				expectError: true,
			},
			{
				name: "Zero check interval",
				config: func() *AutoSwapConfig {
					c := NewAutoSwapConfig()
					c.CheckIntervalMinutes = 0
					return c
				}(),
				expectError: true,
			},
			{
				name: "Invalid backoff factor",
				config: func() *AutoSwapConfig {
					c := NewAutoSwapConfig()
					c.BackoffFactor = 1.5
					return c
				}(),
				expectError: true,
			},
			{
				name: "Max size less than min size",
				config: func() *AutoSwapConfig {
					c := NewAutoSwapConfig()
					c.MinSwapSizeBTC = 0.1
					c.MaxSwapSizeBTC = 0.05
					return c
				}(),
				expectError: true,
			},
		}

		for _, tc := range testCases {
			t.Run(tc.name, func(t *testing.T) {
				err := tc.config.Validate()
				if tc.expectError {
					assert.Error(t, err)
				} else {
					assert.NoError(t, err)
				}
			})
		}
	})
}

// Benchmark tests
func BenchmarkAutoSwapService(b *testing.B) {
	env := setupBenchmarkEnvironment(b)

	// Setup mocks
	env.LightningClient.(*MockLightningClient).On("GetInfo", mock.Anything).Return(&lnrpc.GetInfoResponse{
		Features: map[uint32]*lnrpc.Feature{
			17: {Name: "MPP_OPT", IsKnown: true},
		},
	}, nil)

	env.LightningClient.(*MockLightningClient).On("GetChannelLocalBalance", mock.Anything).Return(
		decimal.NewFromFloat(1.5), nil)

	env.LightningClient.(*MockLightningClient).On("GenerateAddress", mock.Anything).Return("bc1test", nil)

	env.RPCClient.(*MockRPCClient).On("SwapOut", mock.Anything, mock.Anything).Return(&rpc.SwapOutResponse{
		SwapId:     "test-swap-id",
		AmountSats: 100000000,
	}, nil)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		env.Service.RunAutoSwapCheck(context.Background())
		// Reset the running swaps for next iteration
		env.Service.runningSwaps = env.Service.runningSwaps[:0]
	}
}

func BenchmarkRunningSwapsManagement(b *testing.B) {
	service := NewAutoSwapService(&MockSwapClient{}, &MockRPCClient{}, &MockLightningClient{}, NewAutoSwapConfig())

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		swapID := fmt.Sprintf("swap-%d", i)
		service.addRunningSwap(swapID)
		service.hasRunningSwap()
		service.removeRunningSwap(swapID)
	}
}
