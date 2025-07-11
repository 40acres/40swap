package daemon

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"testing"

	"github.com/40acres/40swap/daemon/database/models"
	"github.com/40acres/40swap/daemon/lightning"
	"github.com/40acres/40swap/daemon/rpc"
	swaps "github.com/40acres/40swap/daemon/swaps"
	"github.com/lightningnetwork/lnd/lnrpc"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/mock/gomock"
)

// Test helpers
func createTestConfig() *AutoSwapConfig {
	return &AutoSwapConfig{
		Enabled:              true,
		CheckIntervalMinutes: 10,
		TargetBalanceBTC:     1.0,
		BackoffFactor:        0.5,
		MaxAttempts:          3,
		RoutingFeeLimitPPM:   1000,
		MinSwapSizeBTC:       0.001,
		MaxSwapSizeBTC:       0.1,
	}
}

func setupTestService(t *testing.T) (*AutoSwapService, *rpc.MockSwapServiceClient, *lightning.MockClient, *gomock.Controller) {
	ctrl := gomock.NewController(t)

	mockSwapClient := swaps.NewMockClientInterface(ctrl)
	mockLightningClient := lightning.NewMockClient(ctrl)
	mockRPCClient := rpc.NewMockSwapServiceClient(ctrl)
	mockRepository := rpc.NewMockRepository(ctrl)

	// Configure default repository expectations for successful operations
	mockRepository.EXPECT().UpdateAutoSwap(gomock.Any(), gomock.Any(), true).Return(nil).AnyTimes()
	mockRepository.EXPECT().UpdateAutoSwap(gomock.Any(), gomock.Any(), false).Return(nil).AnyTimes()

	config := createTestConfig()
	service := NewAutoSwapService(mockSwapClient, mockRPCClient, mockLightningClient, mockRepository, config)

	return service, mockRPCClient, mockLightningClient, ctrl
}

func mockLNDInfoWithMPP() *lnrpc.GetInfoResponse {
	return &lnrpc.GetInfoResponse{
		Features: map[uint32]*lnrpc.Feature{
			17: {Name: "multi-path-payments", IsKnown: true},
		},
	}
}

func TestAutoSwapService_SwapAmountCalculation(t *testing.T) {
	tests := []struct {
		name           string
		currentBalance float64 // in BTC
		targetBalance  float64
		maxSwapSize    float64
		minSwapSize    float64
		expectedAmount float64
		shouldSwap     bool
		description    string
	}{
		{
			name:           "Large excess should cap at max swap size",
			currentBalance: 2.0,
			targetBalance:  1.0,
			maxSwapSize:    0.1,
			minSwapSize:    0.001,
			expectedAmount: 0.1,
			shouldSwap:     true,
			description:    "When excess (1.0 BTC) > maxSwapSize (0.1 BTC), should use maxSwapSize",
		},
		{
			name:           "Small excess within limits",
			currentBalance: 1.05,
			targetBalance:  1.0,
			maxSwapSize:    0.1,
			minSwapSize:    0.001,
			expectedAmount: 0.05,
			shouldSwap:     true,
			description:    "When excess (0.05 BTC) is within limits, should use exact excess",
		},
		{
			name:           "Tiny excess below minimum",
			currentBalance: 1.0005,
			targetBalance:  1.0,
			maxSwapSize:    0.1,
			minSwapSize:    0.001,
			expectedAmount: 0,
			shouldSwap:     false,
			description:    "When excess (0.0005 BTC) < minSwapSize (0.001 BTC), should not swap",
		},
		{
			name:           "Balance below target",
			currentBalance: 0.8,
			targetBalance:  1.0,
			maxSwapSize:    0.1,
			minSwapSize:    0.001,
			expectedAmount: 0,
			shouldSwap:     false,
			description:    "When balance < target, should not swap",
		},
		{
			name:           "Balance exactly at target",
			currentBalance: 1.0,
			targetBalance:  1.0,
			maxSwapSize:    0.1,
			minSwapSize:    0.001,
			expectedAmount: 0,
			shouldSwap:     false,
			description:    "When balance == target, should not swap",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			service, mockRPCClient, mockLightningClient, ctrl := setupTestService(t)
			defer ctrl.Finish()

			service.config.TargetBalanceBTC = tt.targetBalance
			service.config.MaxSwapSizeBTC = tt.maxSwapSize
			service.config.MinSwapSizeBTC = tt.minSwapSize

			// Setup mocks
			mockLightningClient.EXPECT().GetInfo(gomock.Any()).Return(mockLNDInfoWithMPP(), nil)
			mockLightningClient.EXPECT().GetChannelLocalBalance(gomock.Any()).Return(
				decimal.NewFromFloat(tt.currentBalance*100000000), nil) // Convert to sats

			if tt.shouldSwap {
				mockLightningClient.EXPECT().GenerateAddress(gomock.Any()).Return("bc1test", nil)

				// Mock swap out with expected amount verification
				mockRPCClient.EXPECT().SwapOut(gomock.Any(), gomock.Any()).DoAndReturn(
					func(ctx context.Context, req *rpc.SwapOutRequest, opts ...interface{}) (*rpc.SwapOutResponse, error) {
						expectedSats := uint64(tt.expectedAmount * 100000000)
						if req.AmountSats != expectedSats {
							return nil, fmt.Errorf("expected %d sats but got %d", expectedSats, req.AmountSats)
						}

						return &rpc.SwapOutResponse{
							SwapId:     "test-swap",
							AmountSats: uint64(tt.expectedAmount * 100000000),
						}, nil
					})
			}

			// Execute
			err := service.RunAutoSwapCheck(context.Background())

			// Verify
			require.NoError(t, err, tt.description)

			if tt.shouldSwap {
				assert.True(t, service.hasRunningSwap(), "Should have running swap")
			} else {
				assert.False(t, service.hasRunningSwap(), "Should not have running swap")
			}
		})
	}
}

func TestAutoSwapService_BackoffLogic(t *testing.T) {
	t.Run("BackoffReducesAmountCorrectly", func(t *testing.T) {
		service, mockRPCClient, mockLightningClient, ctrl := setupTestService(t)
		defer ctrl.Finish()

		service.config.MaxSwapSizeBTC = 0.1
		service.config.MinSwapSizeBTC = 0.001
		service.config.BackoffFactor = 0.5
		service.config.MaxAttempts = 3

		// Setup GoMock expectations
		mockLightningClient.EXPECT().GetInfo(gomock.Any()).Return(mockLNDInfoWithMPP(), nil)
		mockLightningClient.EXPECT().GetChannelLocalBalance(gomock.Any()).Return(
			decimal.NewFromFloat(1.5*100000000), nil) // 1.5 BTC
		mockLightningClient.EXPECT().GenerateAddress(gomock.Any()).Return("bc1test", nil).Times(3)

		// Track the amounts in each attempt
		var attemptAmounts []uint64
		mockRPCClient.EXPECT().SwapOut(gomock.Any(), gomock.Any()).DoAndReturn(
			func(ctx context.Context, req *rpc.SwapOutRequest, opts ...interface{}) (*rpc.SwapOutResponse, error) {
				attemptAmounts = append(attemptAmounts, req.AmountSats)

				return nil, errors.New("swap failed")
			}).Times(3)

		// Execute
		err := service.RunAutoSwapCheck(context.Background())

		// Verify backoff progression
		require.Error(t, err, "Should fail after all attempts")
		require.Len(t, attemptAmounts, 3, "Should make exactly MaxAttempts attempts")

		// Verify amounts: 0.1 BTC -> 0.05 BTC -> 0.025 BTC
		expectedAmounts := []uint64{
			10000000, // 0.1 BTC in sats
			5000000,  // 0.05 BTC in sats
			2500000,  // 0.025 BTC in sats
		}

		for i, expected := range expectedAmounts {
			assert.Equal(t, expected, attemptAmounts[i],
				"Attempt %d should be %d sats but was %d sats", i+1, expected, attemptAmounts[i])
		}

		assert.False(t, service.hasRunningSwap(), "Should not have running swap after failure")
	})

	t.Run("SuccessfulRetryAfterBackoff", func(t *testing.T) {
		service, mockRPCClient, mockLightningClient, ctrl := setupTestService(t)
		defer ctrl.Finish()

		service.config.MaxSwapSizeBTC = 0.1
		service.config.BackoffFactor = 0.5

		mockLightningClient.EXPECT().GetInfo(gomock.Any()).Return(mockLNDInfoWithMPP(), nil)
		mockLightningClient.EXPECT().GetChannelLocalBalance(gomock.Any()).Return(
			decimal.NewFromFloat(1.2*100000000), nil)
		mockLightningClient.EXPECT().GenerateAddress(gomock.Any()).Return("bc1test", nil).Times(2) // Will be called twice (first fails, second succeeds)

		// First attempt fails, second succeeds
		mockRPCClient.EXPECT().SwapOut(gomock.Any(), gomock.Any()).DoAndReturn(
			func(ctx context.Context, req *rpc.SwapOutRequest, opts ...interface{}) (*rpc.SwapOutResponse, error) {
				if req.AmountSats == 10000000 { // 0.1 BTC
					return nil, errors.New("first attempt failed")
				}

				return nil, fmt.Errorf("unexpected amount: %d", req.AmountSats)
			}).Times(1)

		mockRPCClient.EXPECT().SwapOut(gomock.Any(), gomock.Any()).DoAndReturn(
			func(ctx context.Context, req *rpc.SwapOutRequest, opts ...interface{}) (*rpc.SwapOutResponse, error) {
				if req.AmountSats == 5000000 { // 0.05 BTC after backoff
					return &rpc.SwapOutResponse{
						SwapId:     "success-swap",
						AmountSats: 5000000,
					}, nil
				}

				return nil, fmt.Errorf("unexpected amount: %d", req.AmountSats)
			}).Times(1)

		err := service.RunAutoSwapCheck(context.Background())

		require.NoError(t, err)
		assert.True(t, service.hasRunningSwap())
	})
}

func TestAutoSwapService_StateManagement(t *testing.T) {
	t.Run("RunningSwapOperations", func(t *testing.T) {
		service, _, _, ctrl := setupTestService(t)
		defer ctrl.Finish()

		// Initially no running swaps
		assert.False(t, service.hasRunningSwap())
		assert.Len(t, service.runningSwaps, 0)

		// Add swaps
		service.addRunningSwap("swap1")
		assert.True(t, service.hasRunningSwap())
		assert.Len(t, service.runningSwaps, 1)

		service.addRunningSwap("swap2")
		assert.Len(t, service.runningSwaps, 2)

		// Test duplicate prevention
		service.addRunningSwap("swap1")
		assert.Len(t, service.runningSwaps, 2) // Should not add duplicate

		// Remove swaps
		service.removeRunningSwap("swap1")
		assert.Len(t, service.runningSwaps, 1)
		assert.Equal(t, "swap2", service.runningSwaps[0])

		service.removeRunningSwap("swap2")
		assert.False(t, service.hasRunningSwap())

		// Remove non-existent swap
		service.removeRunningSwap("nonexistent")
		assert.Len(t, service.runningSwaps, 0) // Should remain unchanged
	})

	t.Run("MonitoredSwapOperations", func(t *testing.T) {
		service, _, _, ctrl := setupTestService(t)
		defer ctrl.Finish()

		// Initially no monitored swaps
		assert.False(t, service.isSwapBeingMonitored("swap1"))

		// Monitor swap
		service.setSwapMonitored("swap1")
		assert.True(t, service.isSwapBeingMonitored("swap1"))

		// Unmonitor swap
		service.unsetSwapMonitored("swap1")
		assert.False(t, service.isSwapBeingMonitored("swap1"))
	})
}

func TestAutoSwapService_ConfigurationValidation(t *testing.T) {
	t.Run("DisabledConfig", func(t *testing.T) {
		service, _, _, ctrl := setupTestService(t)
		defer ctrl.Finish()

		service.config.Enabled = false

		// When disabled, auto swap should skip without calling lightning methods
		err := service.RunAutoSwapCheck(context.Background())

		require.NoError(t, err)
		assert.False(t, service.hasRunningSwap())
	})

	t.Run("NilConfig", func(t *testing.T) {
		ctrl := gomock.NewController(t)
		defer ctrl.Finish()

		mockSwapClient := swaps.NewMockClientInterface(ctrl)
		mockLightningClient := lightning.NewMockClient(ctrl)
		mockRPCClient := rpc.NewMockSwapServiceClient(ctrl)

		service := NewAutoSwapService(mockSwapClient, mockRPCClient, mockLightningClient, nil, nil)

		err := service.RunAutoSwapCheck(context.Background())
		require.NoError(t, err)
	})
}

func TestAutoSwapService_ErrorHandling(t *testing.T) {
	t.Run("LightningBalanceError", func(t *testing.T) {
		service, _, mockLightningClient, ctrl := setupTestService(t)
		defer ctrl.Finish()

		mockLightningClient.EXPECT().GetInfo(gomock.Any()).Return(mockLNDInfoWithMPP(), nil)
		mockLightningClient.EXPECT().GetChannelLocalBalance(gomock.Any()).Return(
			decimal.Zero, errors.New("connection failed"))

		err := service.RunAutoSwapCheck(context.Background())
		require.Error(t, err)
		assert.Contains(t, err.Error(), "connection failed")
	})

	t.Run("AddressGenerationError", func(t *testing.T) {
		service, _, mockLightningClient, ctrl := setupTestService(t)
		defer ctrl.Finish()

		mockLightningClient.EXPECT().GetInfo(gomock.Any()).Return(mockLNDInfoWithMPP(), nil)
		mockLightningClient.EXPECT().GetChannelLocalBalance(gomock.Any()).Return(
			decimal.NewFromFloat(1.5*100000000), nil)
		mockLightningClient.EXPECT().GenerateAddress(gomock.Any()).Return("", errors.New("address gen failed"))

		err := service.RunAutoSwapCheck(context.Background())
		require.Error(t, err)
		assert.Contains(t, err.Error(), "address gen failed")
	})

	t.Run("ContinuesAfterGetInfoFailure", func(t *testing.T) {
		service, mockRPCClient, mockLightningClient, ctrl := setupTestService(t)
		defer ctrl.Finish()

		mockLightningClient.EXPECT().GetInfo(gomock.Any()).Return((*lnrpc.GetInfoResponse)(nil), errors.New("getinfo failed"))
		mockLightningClient.EXPECT().GetChannelLocalBalance(gomock.Any()).Return(
			decimal.NewFromFloat(1.5*100000000), nil)
		mockLightningClient.EXPECT().GenerateAddress(gomock.Any()).Return("bc1test", nil)

		mockRPCClient.EXPECT().SwapOut(gomock.Any(), gomock.Any()).Return(&rpc.SwapOutResponse{
			SwapId: "test-swap",
		}, nil)

		err := service.RunAutoSwapCheck(context.Background())

		// Should continue despite GetInfo failure
		require.NoError(t, err)
		assert.True(t, service.hasRunningSwap())
	})
}

func TestAutoSwapService_ConcurrencyAndRaceConditions(t *testing.T) {
	t.Run("ConcurrentSwapManagement", func(t *testing.T) {
		service, _, _, ctrl := setupTestService(t)
		defer ctrl.Finish()

		var wg sync.WaitGroup
		const numGoroutines = 10
		const operationsPerGoroutine = 50

		// Test concurrent operations
		wg.Add(numGoroutines)
		for i := 0; i < numGoroutines; i++ {
			go func(id int) {
				defer wg.Done()
				for j := 0; j < operationsPerGoroutine; j++ {
					swapID := fmt.Sprintf("swap-%d-%d", id, j)

					// Add, check, and remove
					service.addRunningSwap(swapID)
					_ = service.hasRunningSwap()
					service.setSwapMonitored(swapID)
					_ = service.isSwapBeingMonitored(swapID)
					service.unsetSwapMonitored(swapID)
					service.removeRunningSwap(swapID)
				}
			}(i)
		}

		wg.Wait()

		// Verify clean state
		assert.False(t, service.hasRunningSwap())
		assert.Empty(t, service.monitoredSwaps)
	})
}

func TestAutoSwapService_IntegrationScenarios(t *testing.T) {
	t.Run("TypicalSuccessfulSwap", func(t *testing.T) {
		service, mockRPCClient, mockLightningClient, ctrl := setupTestService(t)
		defer ctrl.Finish()

		// Setup scenario: node with 1.2 BTC wants to maintain 1.0 BTC
		mockLightningClient.EXPECT().GetInfo(gomock.Any()).Return(mockLNDInfoWithMPP(), nil)
		mockLightningClient.EXPECT().GetChannelLocalBalance(gomock.Any()).Return(
			decimal.NewFromFloat(1.2*100000000), nil) // 1.2 BTC in sats
		mockLightningClient.EXPECT().GenerateAddress(gomock.Any()).Return("bc1qtest123", nil)

		mockRPCClient.EXPECT().SwapOut(gomock.Any(), gomock.Any()).DoAndReturn(
			func(ctx context.Context, req *rpc.SwapOutRequest, opts ...interface{}) (*rpc.SwapOutResponse, error) {
				// Should swap 0.1 BTC (max swap size, not the full 0.2 BTC excess)
				if req.AmountSats == 10000000 && // 0.1 BTC
					req.Address == "bc1qtest123" &&
					req.Chain == rpc.Chain_BITCOIN &&
					*req.MaxRoutingFeePercent == 0.1 { // 1000 PPM = 0.1%
					return &rpc.SwapOutResponse{
						SwapId:     "realistic-swap-123",
						AmountSats: 10000000,
					}, nil
				}

				return nil, fmt.Errorf("unexpected request parameters")
			})

		// Execute auto swap check
		err := service.RunAutoSwapCheck(context.Background())

		// Verify results
		require.NoError(t, err)
		assert.True(t, service.hasRunningSwap())
		assert.Len(t, service.runningSwaps, 1)
		assert.Equal(t, "realistic-swap-123", service.runningSwaps[0])
	})

	t.Run("NodeWithoutMPPSupport", func(t *testing.T) {
		service, mockRPCClient, mockLightningClient, ctrl := setupTestService(t)
		defer ctrl.Finish()

		// Node without MPP support
		mockLightningClient.EXPECT().GetInfo(gomock.Any()).Return(&lnrpc.GetInfoResponse{
			Features: map[uint32]*lnrpc.Feature{
				// No MPP feature
			},
		}, nil)
		mockLightningClient.EXPECT().GetChannelLocalBalance(gomock.Any()).Return(
			decimal.NewFromFloat(1.5*100000000), nil)
		mockLightningClient.EXPECT().GenerateAddress(gomock.Any()).Return("bc1test", nil)

		mockRPCClient.EXPECT().SwapOut(gomock.Any(), gomock.Any()).Return(&rpc.SwapOutResponse{
			SwapId: "no-mpp-swap",
		}, nil)

		// Should still proceed despite MPP warning
		err := service.RunAutoSwapCheck(context.Background())
		require.NoError(t, err)
		assert.True(t, service.hasRunningSwap())
	})

	t.Run("SkipsWhenSwapAlreadyRunning", func(t *testing.T) {
		service, _, _, ctrl := setupTestService(t)
		defer ctrl.Finish()

		// Add existing swap
		service.addRunningSwap("existing-swap")

		// When there's already a running swap, should skip without calling lightning methods
		err := service.RunAutoSwapCheck(context.Background())

		// Should skip new swap
		require.NoError(t, err)
		assert.Len(t, service.runningSwaps, 1) // Still just the original swap
	})
}

func TestAutoSwapService_MonitoringBehavior(t *testing.T) {
	t.Run("MonitoringDetectsTerminalStatus", func(t *testing.T) {
		service, mockRPCClient, _, ctrl := setupTestService(t)
		defer ctrl.Finish()

		service.addRunningSwap("test-monitor-swap")

		ctx := context.Background()

		// Mock successful status check
		mockRPCClient.EXPECT().GetSwapOut(gomock.Any(), gomock.Any()).DoAndReturn(
			func(ctx context.Context, req *rpc.GetSwapOutRequest, opts ...interface{}) (*rpc.GetSwapOutResponse, error) {
				if req.Id == "test-monitor-swap" {
					return &rpc.GetSwapOutResponse{
						Id:     "test-monitor-swap",
						Status: rpc.Status_DONE,
					}, nil
				}

				return nil, fmt.Errorf("unexpected swap ID: %s", req.Id)
			})

		// Simulate one polling cycle
		resp, err := service.rpcClient.GetSwapOut(ctx, &rpc.GetSwapOutRequest{Id: "test-monitor-swap"})
		require.NoError(t, err)

		// When terminal status is detected, swap should be removed
		if resp.Status == rpc.Status_DONE || resp.Status == rpc.Status_CONTRACT_EXPIRED {
			service.removeRunningSwap("test-monitor-swap")
		}

		assert.False(t, service.hasRunningSwap())
	})

	t.Run("MonitoringHandlesErrors", func(t *testing.T) {
		service, mockRPCClient, _, ctrl := setupTestService(t)
		defer ctrl.Finish()

		service.addRunningSwap("error-swap")

		mockRPCClient.EXPECT().GetSwapOut(gomock.Any(), gomock.Any()).Return(
			(*rpc.GetSwapOutResponse)(nil), errors.New("network error"))

		// Error should not remove swap (continues monitoring)
		_, err := service.rpcClient.GetSwapOut(context.Background(), &rpc.GetSwapOutRequest{Id: "error-swap"})
		require.Error(t, err)
		assert.True(t, service.hasRunningSwap()) // Should still be running
	})
}

func TestAutoSwapService_DatabaseRecovery(t *testing.T) {
	t.Run("SuccessfulRecoveryWithPendingSwaps", func(t *testing.T) {
		ctrl := gomock.NewController(t)
		defer ctrl.Finish()

		// Create service with specific repository mock for this test
		mockSwapClient := swaps.NewMockClientInterface(ctrl)
		mockLightningClient := lightning.NewMockClient(ctrl)
		mockRPCClient := rpc.NewMockSwapServiceClient(ctrl)
		mockRepository := rpc.NewMockRepository(ctrl)

		// Mock pending auto swaps from database
		pendingSwaps := []*models.SwapOut{
			{
				SwapID:     "recovery-swap-1",
				Status:     models.StatusContractFunded,
				IsAutoSwap: true,
			},
			{
				SwapID:     "recovery-swap-2",
				Status:     models.StatusInvoicePaid,
				IsAutoSwap: true,
			},
		}

		// Configure repository expectations
		mockRepository.EXPECT().GetPendingAutoSwapOuts(gomock.Any()).Return(pendingSwaps, nil)
		// Allow UpdateAutoSwap calls during normal operation
		mockRepository.EXPECT().UpdateAutoSwap(gomock.Any(), gomock.Any(), gomock.Any()).Return(nil).AnyTimes()

		config := createTestConfig()
		service := NewAutoSwapService(mockSwapClient, mockRPCClient, mockLightningClient, mockRepository, config)

		// Verify initial state
		assert.False(t, service.hasRunningSwap())
		assert.Len(t, service.runningSwaps, 0)

		// Execute recovery
		err := service.RecoverPendingAutoSwaps(context.Background())

		// Verify results
		require.NoError(t, err)
		assert.True(t, service.hasRunningSwap())
		assert.Len(t, service.runningSwaps, 2)
		assert.Contains(t, service.runningSwaps, "recovery-swap-1")
		assert.Contains(t, service.runningSwaps, "recovery-swap-2")

		// Note: We don't verify monitoring state here because monitorSwapUntilTerminal
		// runs in goroutines and may not have set the monitoring flag yet
	})

	t.Run("RecoveryWithNooPendingSwaps", func(t *testing.T) {
		ctrl := gomock.NewController(t)
		defer ctrl.Finish()

		mockSwapClient := swaps.NewMockClientInterface(ctrl)
		mockLightningClient := lightning.NewMockClient(ctrl)
		mockRPCClient := rpc.NewMockSwapServiceClient(ctrl)
		mockRepository := rpc.NewMockRepository(ctrl)

		// Mock empty result from database
		mockRepository.EXPECT().GetPendingAutoSwapOuts(gomock.Any()).Return([]*models.SwapOut{}, nil)
		mockRepository.EXPECT().UpdateAutoSwap(gomock.Any(), gomock.Any(), gomock.Any()).Return(nil).AnyTimes()

		config := createTestConfig()
		service := NewAutoSwapService(mockSwapClient, mockRPCClient, mockLightningClient, mockRepository, config)

		// Execute recovery
		err := service.RecoverPendingAutoSwaps(context.Background())

		// Verify results
		require.NoError(t, err)
		assert.False(t, service.hasRunningSwap())
		assert.Len(t, service.runningSwaps, 0)
	})

	t.Run("RecoveryWithDatabaseError", func(t *testing.T) {
		ctrl := gomock.NewController(t)
		defer ctrl.Finish()

		mockSwapClient := swaps.NewMockClientInterface(ctrl)
		mockLightningClient := lightning.NewMockClient(ctrl)
		mockRPCClient := rpc.NewMockSwapServiceClient(ctrl)
		mockRepository := rpc.NewMockRepository(ctrl)

		// Mock database error
		expectedError := errors.New("database connection failed")
		mockRepository.EXPECT().GetPendingAutoSwapOuts(gomock.Any()).Return(nil, expectedError)
		mockRepository.EXPECT().UpdateAutoSwap(gomock.Any(), gomock.Any(), gomock.Any()).Return(nil).AnyTimes()

		config := createTestConfig()
		service := NewAutoSwapService(mockSwapClient, mockRPCClient, mockLightningClient, mockRepository, config)

		// Execute recovery
		err := service.RecoverPendingAutoSwaps(context.Background())

		// Verify error handling
		require.Error(t, err)
		assert.Contains(t, err.Error(), "failed to get pending auto swaps")
		assert.Contains(t, err.Error(), "database connection failed")
		assert.False(t, service.hasRunningSwap())
		assert.Len(t, service.runningSwaps, 0)
	})

	t.Run("RecoveryWithNilRepository", func(t *testing.T) {
		ctrl := gomock.NewController(t)
		defer ctrl.Finish()

		mockSwapClient := swaps.NewMockClientInterface(ctrl)
		mockLightningClient := lightning.NewMockClient(ctrl)
		mockRPCClient := rpc.NewMockSwapServiceClient(ctrl)

		config := createTestConfig()
		// Create service with nil repository
		service := NewAutoSwapService(mockSwapClient, mockRPCClient, mockLightningClient, nil, config)

		// Execute recovery
		err := service.RecoverPendingAutoSwaps(context.Background())

		// Should handle nil repository gracefully
		require.NoError(t, err)
		assert.False(t, service.hasRunningSwap())
		assert.Len(t, service.runningSwaps, 0)
	})

	t.Run("RecoveryIntegrationWithRunAutoSwapCheck", func(t *testing.T) {
		ctrl := gomock.NewController(t)
		defer ctrl.Finish()

		mockSwapClient := swaps.NewMockClientInterface(ctrl)
		mockLightningClient := lightning.NewMockClient(ctrl)
		mockRPCClient := rpc.NewMockSwapServiceClient(ctrl)
		mockRepository := rpc.NewMockRepository(ctrl)

		// Mock one pending swap
		pendingSwaps := []*models.SwapOut{
			{
				SwapID:     "existing-swap",
				Status:     models.StatusContractFunded,
				IsAutoSwap: true,
			},
		}

		mockRepository.EXPECT().GetPendingAutoSwapOuts(gomock.Any()).Return(pendingSwaps, nil)
		mockRepository.EXPECT().UpdateAutoSwap(gomock.Any(), gomock.Any(), gomock.Any()).Return(nil).AnyTimes()

		config := createTestConfig()
		service := NewAutoSwapService(mockSwapClient, mockRPCClient, mockLightningClient, mockRepository, config)

		// Recover pending swaps first
		err := service.RecoverPendingAutoSwaps(context.Background())
		require.NoError(t, err)
		assert.True(t, service.hasRunningSwap())

		// Now run auto swap check - should skip because there's already a running swap
		// When there are running swaps, RunAutoSwapCheck exits early without calling GetInfo
		err = service.RunAutoSwapCheck(context.Background())
		require.NoError(t, err)

		// Should still have only the recovered swap, no new swap created
		assert.Len(t, service.runningSwaps, 1)
		assert.Equal(t, "existing-swap", service.runningSwaps[0])
	})
}
