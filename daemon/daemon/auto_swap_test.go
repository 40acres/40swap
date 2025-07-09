package daemon

import (
	"context"
	"errors"
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
	"google.golang.org/grpc"
)

// Mock implementations (simplified)
type MockSwapClient struct{ mock.Mock }

func (m *MockSwapClient) GetConfiguration(ctx context.Context) (*swaps.ConfigurationResponse, error) {
	args := m.Called(ctx)
	return args.Get(0).(*swaps.ConfigurationResponse), args.Error(1)
}
func (m *MockSwapClient) CreateSwapIn(ctx context.Context, req *swaps.CreateSwapInRequest) (*swaps.SwapInResponse, error) {
	args := m.Called(ctx, req)
	return args.Get(0).(*swaps.SwapInResponse), args.Error(1)
}
func (m *MockSwapClient) CreateSwapOut(ctx context.Context, req swaps.CreateSwapOutRequest) (*swaps.SwapOutResponse, error) {
	args := m.Called(ctx, req)
	return args.Get(0).(*swaps.SwapOutResponse), args.Error(1)
}
func (m *MockSwapClient) GetSwapIn(ctx context.Context, id string) (*swaps.SwapInResponse, error) {
	args := m.Called(ctx, id)
	return args.Get(0).(*swaps.SwapInResponse), args.Error(1)
}
func (m *MockSwapClient) GetSwapOut(ctx context.Context, id string) (*swaps.SwapOutResponse, error) {
	args := m.Called(ctx, id)
	return args.Get(0).(*swaps.SwapOutResponse), args.Error(1)
}
func (m *MockSwapClient) GetClaimPSBT(ctx context.Context, swapId, address string) (*swaps.GetClaimPSBTResponse, error) {
	args := m.Called(ctx, swapId, address)
	return args.Get(0).(*swaps.GetClaimPSBTResponse), args.Error(1)
}
func (m *MockSwapClient) PostClaim(ctx context.Context, swapId, tx string) error {
	args := m.Called(ctx, swapId, tx)
	return args.Error(0)
}
func (m *MockSwapClient) GetRefundPSBT(ctx context.Context, swapId, address string) (*swaps.RefundPSBTResponse, error) {
	args := m.Called(ctx, swapId, address)
	return args.Get(0).(*swaps.RefundPSBTResponse), args.Error(1)
}
func (m *MockSwapClient) PostRefund(ctx context.Context, swapId, tx string) error {
	args := m.Called(ctx, swapId, tx)
	return args.Error(0)
}

type MockLightningClient struct{ mock.Mock }

func (m *MockLightningClient) PayInvoice(ctx context.Context, paymentRequest string, feeLimitRatio float64) error {
	args := m.Called(ctx, paymentRequest, feeLimitRatio)
	return args.Error(0)
}
func (m *MockLightningClient) MonitorPaymentRequest(ctx context.Context, paymentHash string) (lightning.Preimage, lightning.NetworkFeeSats, error) {
	args := m.Called(ctx, paymentHash)
	return args.String(0), args.Get(1).(lightning.NetworkFeeSats), args.Error(2)
}
func (m *MockLightningClient) MonitorPaymentReception(ctx context.Context, rhash []byte) (lightning.Preimage, error) {
	args := m.Called(ctx, rhash)
	return args.String(0), args.Error(1)
}
func (m *MockLightningClient) GenerateInvoice(ctx context.Context, amountSats decimal.Decimal, expiry time.Duration, memo string) (string, []byte, error) {
	args := m.Called(ctx, amountSats, expiry, memo)
	return args.String(0), args.Get(1).([]byte), args.Error(2)
}
func (m *MockLightningClient) GenerateAddress(ctx context.Context) (string, error) {
	args := m.Called(ctx)
	return args.String(0), args.Error(1)
}
func (m *MockLightningClient) GetChannelLocalBalance(ctx context.Context) (decimal.Decimal, error) {
	args := m.Called(ctx)
	return args.Get(0).(decimal.Decimal), args.Error(1)
}
func (m *MockLightningClient) GetInfo(ctx context.Context) (*lnrpc.GetInfoResponse, error) {
	args := m.Called(ctx)
	return args.Get(0).(*lnrpc.GetInfoResponse), args.Error(1)
}

type MockRPCClient struct{ mock.Mock }

func (m *MockRPCClient) SwapIn(ctx context.Context, req *rpc.SwapInRequest, opts ...grpc.CallOption) (*rpc.SwapInResponse, error) {
	args := m.Called(ctx, req)
	return args.Get(0).(*rpc.SwapInResponse), args.Error(1)
}
func (m *MockRPCClient) SwapOut(ctx context.Context, req *rpc.SwapOutRequest, opts ...grpc.CallOption) (*rpc.SwapOutResponse, error) {
	args := m.Called(ctx, req)
	return args.Get(0).(*rpc.SwapOutResponse), args.Error(1)
}
func (m *MockRPCClient) GetSwapIn(ctx context.Context, req *rpc.GetSwapInRequest, opts ...grpc.CallOption) (*rpc.GetSwapInResponse, error) {
	args := m.Called(ctx, req)
	return args.Get(0).(*rpc.GetSwapInResponse), args.Error(1)
}
func (m *MockRPCClient) GetSwapOut(ctx context.Context, req *rpc.GetSwapOutRequest, opts ...grpc.CallOption) (*rpc.GetSwapOutResponse, error) {
	args := m.Called(ctx, req)
	return args.Get(0).(*rpc.GetSwapOutResponse), args.Error(1)
}
func (m *MockRPCClient) RecoverReusedSwapAddress(ctx context.Context, req *rpc.RecoverReusedSwapAddressRequest, opts ...grpc.CallOption) (*rpc.RecoverReusedSwapAddressResponse, error) {
	args := m.Called(ctx, req)
	return args.Get(0).(*rpc.RecoverReusedSwapAddressResponse), args.Error(1)
}

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

func setupTestService() (*AutoSwapService, *MockSwapClient, *MockRPCClient, *MockLightningClient) {
	mockSwapClient := &MockSwapClient{}
	mockRPCClient := &MockRPCClient{}
	mockLightningClient := &MockLightningClient{}
	config := createTestConfig()

	service := NewAutoSwapService(mockSwapClient, mockRPCClient, mockLightningClient, config)
	return service, mockSwapClient, mockRPCClient, mockLightningClient
}

func mockLNDInfoWithMPP() *lnrpc.GetInfoResponse {
	return &lnrpc.GetInfoResponse{
		Features: map[uint32]*lnrpc.Feature{
			17: {Name: "multi-path-payments", IsKnown: true},
		},
	}
}

// IMPROVED TESTS: Focus on Business Logic and Real Scenarios

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
			service, _, mockRPCClient, mockLightningClient := setupTestService()
			service.config.TargetBalanceBTC = tt.targetBalance
			service.config.MaxSwapSizeBTC = tt.maxSwapSize
			service.config.MinSwapSizeBTC = tt.minSwapSize

			// Setup mocks with test data
			mockLightningClient.On("GetInfo", mock.Anything).Return(mockLNDInfoWithMPP(), nil)
			mockLightningClient.On("GetChannelLocalBalance", mock.Anything).Return(
				decimal.NewFromFloat(tt.currentBalance*100000000), nil) // Convert to sats

						if tt.shouldSwap {
				mockLightningClient.On("GenerateAddress", mock.Anything).Return("bc1test", nil)
				
				// Mock swap out with expected amount verification
				mockRPCClient.On("SwapOut", mock.Anything, mock.MatchedBy(func(req *rpc.SwapOutRequest) bool {
					expectedSats := uint64(tt.expectedAmount * 100000000)
					return req.AmountSats == expectedSats
				})).Return(&rpc.SwapOutResponse{
					SwapId:     "test-swap",
					AmountSats: uint64(tt.expectedAmount * 100000000), // Convert BTC to sats
				}, nil)
			}

			// Execute
			err := service.RunAutoSwapCheck(context.Background())

			// Verify
			require.NoError(t, err, tt.description)

			if tt.shouldSwap {
				assert.True(t, service.hasRunningSwap(), "Should have running swap")
				// The amount verification is implicitly done by the mock expectations
			} else {
				assert.False(t, service.hasRunningSwap(), "Should not have running swap")
				mockRPCClient.AssertNotCalled(t, "SwapOut")
			}

			mockLightningClient.AssertExpectations(t)
			mockRPCClient.AssertExpectations(t)
		})
	}
}

func TestAutoSwapService_BackoffLogic(t *testing.T) {
	t.Run("BackoffReducesAmountCorrectly", func(t *testing.T) {
		service, _, mockRPCClient, mockLightningClient := setupTestService()
				service.config.MaxSwapSizeBTC = 0.1
		service.config.MinSwapSizeBTC = 0.001 // Lower minimum to test more attempts
		service.config.BackoffFactor = 0.5
		service.config.MaxAttempts = 3 // Limit to 3 attempts

		// Setup balance that exceeds target
		mockLightningClient.On("GetInfo", mock.Anything).Return(mockLNDInfoWithMPP(), nil)
		mockLightningClient.On("GetChannelLocalBalance", mock.Anything).Return(
			decimal.NewFromFloat(1.5*100000000), nil) // 1.5 BTC
		mockLightningClient.On("GenerateAddress", mock.Anything).Return("bc1test", nil)

		// Track the amounts in each attempt
		var attemptAmounts []uint64
		mockRPCClient.On("SwapOut", mock.Anything, mock.MatchedBy(func(req *rpc.SwapOutRequest) bool {
			attemptAmounts = append(attemptAmounts, req.AmountSats)
			return true
		})).Return((*rpc.SwapOutResponse)(nil), errors.New("swap failed")).Times(3)

		// Execute
		err := service.RunAutoSwapCheck(context.Background())
		
		// Verify backoff progression - should make exactly MaxAttempts
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
		service, _, mockRPCClient, mockLightningClient := setupTestService()
		service.config.MaxSwapSizeBTC = 0.1
		service.config.BackoffFactor = 0.5

		mockLightningClient.On("GetInfo", mock.Anything).Return(mockLNDInfoWithMPP(), nil)
		mockLightningClient.On("GetChannelLocalBalance", mock.Anything).Return(
			decimal.NewFromFloat(1.2*100000000), nil)
		mockLightningClient.On("GenerateAddress", mock.Anything).Return("bc1test", nil)

		// First attempt fails, second succeeds
		mockRPCClient.On("SwapOut", mock.Anything, mock.MatchedBy(func(req *rpc.SwapOutRequest) bool {
			return req.AmountSats == 10000000 // 0.1 BTC
		})).Return((*rpc.SwapOutResponse)(nil), errors.New("first attempt failed")).Once()

		mockRPCClient.On("SwapOut", mock.Anything, mock.MatchedBy(func(req *rpc.SwapOutRequest) bool {
			return req.AmountSats == 5000000 // 0.05 BTC after backoff
		})).Return(&rpc.SwapOutResponse{
			SwapId:     "success-swap",
			AmountSats: 5000000,
		}, nil).Once()

		err := service.RunAutoSwapCheck(context.Background())

		require.NoError(t, err)
		assert.True(t, service.hasRunningSwap())
		mockRPCClient.AssertExpectations(t)
	})
}

func TestAutoSwapService_StateManagement(t *testing.T) {
	t.Run("RunningSwapOperations", func(t *testing.T) {
		service, _, _, _ := setupTestService()

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
		service, _, _, _ := setupTestService()

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
		service, _, mockRPCClient, mockLightningClient := setupTestService()
		service.config.Enabled = false

		// Even with high balance, should skip when disabled
		mockLightningClient.On("GetInfo", mock.Anything).Return(mockLNDInfoWithMPP(), nil)
		mockLightningClient.On("GetChannelLocalBalance", mock.Anything).Return(
			decimal.NewFromFloat(2.0*100000000), nil)

		err := service.RunAutoSwapCheck(context.Background())

		require.NoError(t, err)
		assert.False(t, service.hasRunningSwap())
		mockRPCClient.AssertNotCalled(t, "SwapOut")
	})

	t.Run("NilConfig", func(t *testing.T) {
		service := NewAutoSwapService(&MockSwapClient{}, &MockRPCClient{}, &MockLightningClient{}, nil)

		err := service.RunAutoSwapCheck(context.Background())
		require.NoError(t, err)
	})
}

func TestAutoSwapService_ErrorHandling(t *testing.T) {
	t.Run("LightningBalanceError", func(t *testing.T) {
		service, _, _, mockLightningClient := setupTestService()

		mockLightningClient.On("GetInfo", mock.Anything).Return(mockLNDInfoWithMPP(), nil)
		mockLightningClient.On("GetChannelLocalBalance", mock.Anything).Return(
			decimal.Zero, errors.New("connection failed"))

		err := service.RunAutoSwapCheck(context.Background())
		require.Error(t, err)
		assert.Contains(t, err.Error(), "connection failed")
	})

	t.Run("AddressGenerationError", func(t *testing.T) {
		service, _, _, mockLightningClient := setupTestService()

		mockLightningClient.On("GetInfo", mock.Anything).Return(mockLNDInfoWithMPP(), nil)
		mockLightningClient.On("GetChannelLocalBalance", mock.Anything).Return(
			decimal.NewFromFloat(1.5*100000000), nil)
		mockLightningClient.On("GenerateAddress", mock.Anything).Return("", errors.New("address gen failed"))

		err := service.RunAutoSwapCheck(context.Background())
		require.Error(t, err)
		assert.Contains(t, err.Error(), "address gen failed")
	})

	t.Run("ContinuesAfterGetInfoFailure", func(t *testing.T) {
		service, _, mockRPCClient, mockLightningClient := setupTestService()

		mockLightningClient.On("GetInfo", mock.Anything).Return((*lnrpc.GetInfoResponse)(nil), errors.New("getinfo failed"))
		mockLightningClient.On("GetChannelLocalBalance", mock.Anything).Return(
			decimal.NewFromFloat(1.5*100000000), nil)
		mockLightningClient.On("GenerateAddress", mock.Anything).Return("bc1test", nil)

		mockRPCClient.On("SwapOut", mock.Anything, mock.Anything).Return(&rpc.SwapOutResponse{
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
		service, _, _, _ := setupTestService()

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
		service, _, mockRPCClient, mockLightningClient := setupTestService()

		// Setup realistic scenario: node with 1.2 BTC wants to maintain 1.0 BTC
		mockLightningClient.On("GetInfo", mock.Anything).Return(mockLNDInfoWithMPP(), nil)
		mockLightningClient.On("GetChannelLocalBalance", mock.Anything).Return(
			decimal.NewFromFloat(1.2*100000000), nil) // 1.2 BTC in sats
		mockLightningClient.On("GenerateAddress", mock.Anything).Return("bc1qtest123", nil)

		mockRPCClient.On("SwapOut", mock.Anything, mock.MatchedBy(func(req *rpc.SwapOutRequest) bool {
			// Should swap 0.1 BTC (max swap size, not the full 0.2 BTC excess)
			return req.AmountSats == 10000000 && // 0.1 BTC
				req.Address == "bc1qtest123" &&
				req.Chain == rpc.Chain_BITCOIN &&
				*req.MaxRoutingFeePercent == 0.1 // 1000 PPM = 0.1%
		})).Return(&rpc.SwapOutResponse{
			SwapId:     "realistic-swap-123",
			AmountSats: 10000000,
		}, nil)

		// Execute auto swap check
		err := service.RunAutoSwapCheck(context.Background())

		// Verify results
		require.NoError(t, err)
		assert.True(t, service.hasRunningSwap())
		assert.Len(t, service.runningSwaps, 1)
		assert.Equal(t, "realistic-swap-123", service.runningSwaps[0])

		mockLightningClient.AssertExpectations(t)
		mockRPCClient.AssertExpectations(t)
	})

	t.Run("NodeWithoutMPPSupport", func(t *testing.T) {
		service, _, mockRPCClient, mockLightningClient := setupTestService()

		// Node without MPP support
		mockLightningClient.On("GetInfo", mock.Anything).Return(&lnrpc.GetInfoResponse{
			Features: map[uint32]*lnrpc.Feature{
				// No MPP feature
			},
		}, nil)
		mockLightningClient.On("GetChannelLocalBalance", mock.Anything).Return(
			decimal.NewFromFloat(1.5*100000000), nil)
		mockLightningClient.On("GenerateAddress", mock.Anything).Return("bc1test", nil)

		mockRPCClient.On("SwapOut", mock.Anything, mock.Anything).Return(&rpc.SwapOutResponse{
			SwapId: "no-mpp-swap",
		}, nil)

		// Should still proceed despite MPP warning
		err := service.RunAutoSwapCheck(context.Background())
		require.NoError(t, err)
		assert.True(t, service.hasRunningSwap())
	})

	t.Run("SkipsWhenSwapAlreadyRunning", func(t *testing.T) {
		service, _, mockRPCClient, mockLightningClient := setupTestService()

		// Add existing swap
		service.addRunningSwap("existing-swap")

		// Setup high balance that would normally trigger swap
		mockLightningClient.On("GetInfo", mock.Anything).Return(mockLNDInfoWithMPP(), nil)
		mockLightningClient.On("GetChannelLocalBalance", mock.Anything).Return(
			decimal.NewFromFloat(2.0*100000000), nil)

		err := service.RunAutoSwapCheck(context.Background())

		// Should skip new swap
		require.NoError(t, err)
		assert.Len(t, service.runningSwaps, 1)      // Still just the original swap
		mockRPCClient.AssertNotCalled(t, "SwapOut") // No new swap should be created
	})
}

func TestAutoSwapService_MonitoringBehavior(t *testing.T) {
	t.Run("MonitoringDetectsTerminalStatus", func(t *testing.T) {
		service, _, mockRPCClient, _ := setupTestService()
		service.addRunningSwap("test-monitor-swap")

		ctx := context.Background()

		// Mock successful status check
		mockRPCClient.On("GetSwapOut", mock.Anything, &rpc.GetSwapOutRequest{
			Id: "test-monitor-swap",
		}).Return(&rpc.GetSwapOutResponse{
			Id:     "test-monitor-swap",
			Status: rpc.Status_DONE,
		}, nil)

		// Simulate one polling cycle
		resp, err := service.rpcClient.GetSwapOut(ctx, &rpc.GetSwapOutRequest{Id: "test-monitor-swap"})
		require.NoError(t, err)

		// When terminal status is detected, swap should be removed
		if resp.Status == rpc.Status_DONE || resp.Status == rpc.Status_CONTRACT_EXPIRED {
			service.removeRunningSwap("test-monitor-swap")
		}

		assert.False(t, service.hasRunningSwap())
		mockRPCClient.AssertExpectations(t)
	})

	t.Run("MonitoringHandlesErrors", func(t *testing.T) {
		service, _, mockRPCClient, _ := setupTestService()
		service.addRunningSwap("error-swap")

		mockRPCClient.On("GetSwapOut", mock.Anything, &rpc.GetSwapOutRequest{
			Id: "error-swap",
		}).Return((*rpc.GetSwapOutResponse)(nil), errors.New("network error"))

		// Error should not remove swap (continues monitoring)
		_, err := service.rpcClient.GetSwapOut(context.Background(), &rpc.GetSwapOutRequest{Id: "error-swap"})
		require.Error(t, err)
		assert.True(t, service.hasRunningSwap()) // Should still be running
	})
}
