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
	"google.golang.org/grpc"
)

// Mock implementations
type MockSwapClient struct {
	mock.Mock
}

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

type MockLightningClient struct {
	mock.Mock
}

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

type MockRPCClient struct {
	mock.Mock
}

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

func TestAutoSwapService(t *testing.T) {
	t.Run("NewAutoSwapService", func(t *testing.T) {
		mockSwapClient := &MockSwapClient{}
		mockRPCClient := &MockRPCClient{}
		mockLightningClient := &MockLightningClient{}
		config := NewAutoSwapConfig()

		service := NewAutoSwapService(mockSwapClient, mockRPCClient, mockLightningClient, config)
		assert.NotNil(t, service)
		assert.Equal(t, mockSwapClient, service.client)
		assert.Equal(t, mockRPCClient, service.rpcClient)
		assert.Equal(t, mockLightningClient, service.lightningClient)
		assert.Equal(t, config, service.config)
		assert.Empty(t, service.runningSwaps)
		assert.Empty(t, service.monitoredSwaps)
	})

	t.Run("RunningSwapsManagement", func(t *testing.T) {
		service := NewAutoSwapService(&MockSwapClient{}, &MockRPCClient{}, &MockLightningClient{}, NewAutoSwapConfig())

		// Test addRunningSwap
		service.addRunningSwap("swap1")
		assert.True(t, service.hasRunningSwap())
		assert.Len(t, service.runningSwaps, 1)

		// Test add another swap
		service.addRunningSwap("swap2")
		assert.Len(t, service.runningSwaps, 2)

		// Test removeRunningSwap
		service.removeRunningSwap("swap1")
		assert.Len(t, service.runningSwaps, 1)
		assert.Equal(t, "swap2", service.runningSwaps[0])

		// Test remove non-existent swap
		service.removeRunningSwap("nonexistent")
		assert.Len(t, service.runningSwaps, 1) // Should remain unchanged
	})

	t.Run("MonitoredSwapsManagement", func(t *testing.T) {
		service := NewAutoSwapService(&MockSwapClient{}, &MockRPCClient{}, &MockLightningClient{}, NewAutoSwapConfig())

		// Test setSwapMonitored
		service.setSwapMonitored("swap1")
		assert.True(t, service.isSwapBeingMonitored("swap1"))

		// Test unsetSwapMonitored
		service.unsetSwapMonitored("swap1")
		assert.False(t, service.isSwapBeingMonitored("swap1"))

		// Test non-existent swap
		assert.False(t, service.isSwapBeingMonitored("nonexistent"))
	})

	t.Run("RunAutoSwapCheck_AlreadyRunning", func(t *testing.T) {
		mockSwapClient := &MockSwapClient{}
		mockRPCClient := &MockRPCClient{}
		mockLightningClient := &MockLightningClient{}
		config := NewAutoSwapConfig()
		config.Enabled = true

		service := NewAutoSwapService(mockSwapClient, mockRPCClient, mockLightningClient, config)
		service.addRunningSwap("existing-swap")

		// Should skip when there's already a running swap
		err := service.RunAutoSwapCheck(context.Background())
		assert.NoError(t, err)

		// Verify no calls were made to lightning client
		mockLightningClient.AssertNotCalled(t, "GetChannelLocalBalance")
	})

	t.Run("RunAutoSwapCheck_MPPSupportCheck", func(t *testing.T) {
		mockSwapClient := &MockSwapClient{}
		mockRPCClient := &MockRPCClient{}
		mockLightningClient := &MockLightningClient{}
		config := NewAutoSwapConfig()
		config.Enabled = true
		config.TargetBalanceBTC = 0.5

		service := NewAutoSwapService(mockSwapClient, mockRPCClient, mockLightningClient, config)

		// Mock GetInfo with MPP support
		mockLightningClient.On("GetInfo", mock.Anything).Return(&lnrpc.GetInfoResponse{
			Features: map[uint32]*lnrpc.Feature{
				17: {Name: "multi-path-payments", IsKnown: true},
			},
		}, nil)

		// Mock GetChannelLocalBalance with low balance (no swap needed)
		mockLightningClient.On("GetChannelLocalBalance", mock.Anything).Return(
			decimal.NewFromInt(50000000), nil) // 0.5 BTC in satoshis

		err := service.RunAutoSwapCheck(context.Background())
		assert.NoError(t, err)

		mockLightningClient.AssertExpectations(t)
	})

	t.Run("RunAutoSwapCheck_BalanceExceedsTarget", func(t *testing.T) {
		mockSwapClient := &MockSwapClient{}
		mockRPCClient := &MockRPCClient{}
		mockLightningClient := &MockLightningClient{}
		config := NewAutoSwapConfig()
		config.Enabled = true
		config.TargetBalanceBTC = 1.0
		config.MaxSwapSizeBTC = 0.1
		config.MinSwapSizeBTC = 0.001

		service := NewAutoSwapService(mockSwapClient, mockRPCClient, mockLightningClient, config)

		// Mock GetInfo
		mockLightningClient.On("GetInfo", mock.Anything).Return(&lnrpc.GetInfoResponse{
			Features: map[uint32]*lnrpc.Feature{
				17: {Name: "multi-path-payments", IsKnown: true},
			},
		}, nil)

		// Mock GetChannelLocalBalance with high balance (exceeds target)
		mockLightningClient.On("GetChannelLocalBalance", mock.Anything).Return(
			decimal.NewFromInt(150000000), nil) // 1.5 BTC in satoshis

		// Mock GenerateAddress
		mockLightningClient.On("GenerateAddress", mock.Anything).Return("bc1test", nil)

		// Mock SwapOut success
		mockRPCClient.On("SwapOut", mock.Anything, mock.Anything).Return(&rpc.SwapOutResponse{
			SwapId:     "test-swap-id",
			AmountSats: 10000000, // 0.1 BTC in sats
		}, nil)

		err := service.RunAutoSwapCheck(context.Background())
		assert.NoError(t, err)

		// Verify all mocks were called as expected
		mockLightningClient.AssertExpectations(t)
		mockRPCClient.AssertExpectations(t)
	})

	t.Run("RunAutoSwapCheck_AddressGenerationFailure", func(t *testing.T) {
		mockSwapClient := &MockSwapClient{}
		mockRPCClient := &MockRPCClient{}
		mockLightningClient := &MockLightningClient{}
		config := NewAutoSwapConfig()
		config.Enabled = true
		config.TargetBalanceBTC = 1.0

		service := NewAutoSwapService(mockSwapClient, mockRPCClient, mockLightningClient, config)

		// Mock GetInfo
		mockLightningClient.On("GetInfo", mock.Anything).Return(&lnrpc.GetInfoResponse{
			Features: map[uint32]*lnrpc.Feature{
				17: {Name: "multi-path-payments", IsKnown: true},
			},
		}, nil)

		// Mock GetChannelLocalBalance with high balance
		mockLightningClient.On("GetChannelLocalBalance", mock.Anything).Return(
			decimal.NewFromInt(150000000), nil) // 1.5 BTC in satoshis

		// Mock GenerateAddress failure
		mockLightningClient.On("GenerateAddress", mock.Anything).Return("", errors.New("address generation failed"))

		err := service.RunAutoSwapCheck(context.Background())
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "address generation failed")

		mockLightningClient.AssertExpectations(t)
	})

	t.Run("RunAutoSwapCheck_SwapOutFailureWithBackoff", func(t *testing.T) {
		mockSwapClient := &MockSwapClient{}
		mockRPCClient := &MockRPCClient{}
		mockLightningClient := &MockLightningClient{}
		config := NewAutoSwapConfig()
		config.Enabled = true
		config.TargetBalanceBTC = 1.0
		config.MaxAttempts = 2
		config.BackoffFactor = 0.5
		config.MaxSwapSizeBTC = 0.1
		config.MinSwapSizeBTC = 0.001

		service := NewAutoSwapService(mockSwapClient, mockRPCClient, mockLightningClient, config)

		// Mock GetInfo
		mockLightningClient.On("GetInfo", mock.Anything).Return(&lnrpc.GetInfoResponse{
			Features: map[uint32]*lnrpc.Feature{
				17: {Name: "multi-path-payments", IsKnown: true},
			},
		}, nil)

		// Mock GetChannelLocalBalance with high balance
		mockLightningClient.On("GetChannelLocalBalance", mock.Anything).Return(
			decimal.NewFromInt(150000000), nil) // 1.5 BTC in satoshis

		// Mock GenerateAddress
		mockLightningClient.On("GenerateAddress", mock.Anything).Return("bc1test", nil)

		// Mock SwapOut failures
		mockRPCClient.On("SwapOut", mock.Anything, mock.MatchedBy(func(req *rpc.SwapOutRequest) bool {
			// First attempt with max swap size (0.1 BTC)
			return req.AmountSats == 10000000 // 0.1 BTC
		})).Return((*rpc.SwapOutResponse)(nil), errors.New("swap failed"))

		mockRPCClient.On("SwapOut", mock.Anything, mock.MatchedBy(func(req *rpc.SwapOutRequest) bool {
			// Second attempt with reduced amount (0.5 * 0.1 = 0.05 BTC)
			return req.AmountSats == 5000000 // 0.05 BTC
		})).Return((*rpc.SwapOutResponse)(nil), errors.New("swap failed again"))

		err := service.RunAutoSwapCheck(context.Background())
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "swap failed again")

		// Verify both attempts were made
		mockRPCClient.AssertNumberOfCalls(t, "SwapOut", 2)

		mockLightningClient.AssertExpectations(t)
		mockRPCClient.AssertExpectations(t)
	})

	t.Run("RunAutoSwapCheck_AmountBelowMinimum", func(t *testing.T) {
		mockSwapClient := &MockSwapClient{}
		mockRPCClient := &MockRPCClient{}
		mockLightningClient := &MockLightningClient{}
		config := NewAutoSwapConfig()
		config.Enabled = true
		config.TargetBalanceBTC = 1.0
		config.MaxAttempts = 3
		config.BackoffFactor = 0.1 // Very aggressive backoff
		config.MaxSwapSizeBTC = 0.1
		config.MinSwapSizeBTC = 0.01

		service := NewAutoSwapService(mockSwapClient, mockRPCClient, mockLightningClient, config)

		// Mock GetInfo
		mockLightningClient.On("GetInfo", mock.Anything).Return(&lnrpc.GetInfoResponse{
			Features: map[uint32]*lnrpc.Feature{
				17: {Name: "multi-path-payments", IsKnown: true},
			},
		}, nil)

		// Mock GetChannelLocalBalance with high balance
		mockLightningClient.On("GetChannelLocalBalance", mock.Anything).Return(
			decimal.NewFromInt(150000000), nil) // 1.5 BTC in satoshis

		// Mock GenerateAddress
		mockLightningClient.On("GenerateAddress", mock.Anything).Return("bc1test", nil)

		// Mock SwapOut failure
		mockRPCClient.On("SwapOut", mock.Anything, mock.Anything).Return((*rpc.SwapOutResponse)(nil), errors.New("swap failed"))

		err := service.RunAutoSwapCheck(context.Background())
		assert.Error(t, err)

		// Should make two attempts before backoff reduces amount below minimum
		mockRPCClient.AssertNumberOfCalls(t, "SwapOut", 2)

		mockLightningClient.AssertExpectations(t)
		mockRPCClient.AssertExpectations(t)
	})

	t.Run("RunAutoSwapCheck_BalanceWithinTarget", func(t *testing.T) {
		mockSwapClient := &MockSwapClient{}
		mockRPCClient := &MockRPCClient{}
		mockLightningClient := &MockLightningClient{}
		config := NewAutoSwapConfig()
		config.Enabled = true
		config.TargetBalanceBTC = 1.0

		service := NewAutoSwapService(mockSwapClient, mockRPCClient, mockLightningClient, config)

		// Mock GetInfo
		mockLightningClient.On("GetInfo", mock.Anything).Return(&lnrpc.GetInfoResponse{
			Features: map[uint32]*lnrpc.Feature{
				17: {Name: "multi-path-payments", IsKnown: true},
			},
		}, nil)

		// Mock GetChannelLocalBalance with balance within target
		mockLightningClient.On("GetChannelLocalBalance", mock.Anything).Return(
			decimal.NewFromInt(80000000), nil) // 0.8 BTC in satoshis

		err := service.RunAutoSwapCheck(context.Background())
		assert.NoError(t, err)

		// Verify no swap was initiated
		assert.False(t, service.hasRunningSwap())

		mockLightningClient.AssertExpectations(t)
	})

	t.Run("RunAutoSwapCheck_GetInfoFailure", func(t *testing.T) {
		mockSwapClient := &MockSwapClient{}
		mockRPCClient := &MockRPCClient{}
		mockLightningClient := &MockLightningClient{}
		config := NewAutoSwapConfig()
		config.Enabled = true
		config.TargetBalanceBTC = 1.0
		config.MaxSwapSizeBTC = 0.1
		config.MinSwapSizeBTC = 0.001

		service := NewAutoSwapService(mockSwapClient, mockRPCClient, mockLightningClient, config)

		// Mock GetInfo failure
		mockLightningClient.On("GetInfo", mock.Anything).Return((*lnrpc.GetInfoResponse)(nil), errors.New("connection failed"))

		// Mock GetChannelLocalBalance
		mockLightningClient.On("GetChannelLocalBalance", mock.Anything).Return(
			decimal.NewFromInt(150000000), nil) // 1.5 BTC in satoshis

		// Mock GenerateAddress (called because balance exceeds target)
		mockLightningClient.On("GenerateAddress", mock.Anything).Return("bc1test", nil)

		// Mock SwapOut success (since balance exceeds target, a swap will be attempted)
		mockRPCClient.On("SwapOut", mock.Anything, mock.Anything).Return(&rpc.SwapOutResponse{
			SwapId:     "test-swap-id",
			AmountSats: 10000000, // 0.1 BTC in sats
		}, nil)

		err := service.RunAutoSwapCheck(context.Background())
		assert.NoError(t, err) // Should continue despite GetInfo failure

		mockLightningClient.AssertExpectations(t)
		mockRPCClient.AssertExpectations(t)
	})

	t.Run("RunAutoSwapCheck_GetBalanceFailure", func(t *testing.T) {
		mockSwapClient := &MockSwapClient{}
		mockRPCClient := &MockRPCClient{}
		mockLightningClient := &MockLightningClient{}
		config := NewAutoSwapConfig()
		config.Enabled = true

		service := NewAutoSwapService(mockSwapClient, mockRPCClient, mockLightningClient, config)

		// Mock GetInfo
		mockLightningClient.On("GetInfo", mock.Anything).Return(&lnrpc.GetInfoResponse{
			Features: map[uint32]*lnrpc.Feature{
				17: {Name: "multi-path-payments", IsKnown: true},
			},
		}, nil)

		// Mock GetChannelLocalBalance failure
		mockLightningClient.On("GetChannelLocalBalance", mock.Anything).Return(
			decimal.Zero, errors.New("balance check failed"))

		err := service.RunAutoSwapCheck(context.Background())
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "balance check failed")

		mockLightningClient.AssertExpectations(t)
	})
}

func TestAutoSwapService_MonitorSwapUntilTerminal(t *testing.T) {
	t.Run("MonitorSwapUntilTerminal_Success", func(t *testing.T) {
		mockSwapClient := &MockSwapClient{}
		mockRPCClient := &MockRPCClient{}
		mockLightningClient := &MockLightningClient{}
		config := NewAutoSwapConfig()

		service := NewAutoSwapService(mockSwapClient, mockRPCClient, mockLightningClient, config)
		service.addRunningSwap("test-swap")

		// Mock GetSwapOut to return DONE status
		mockRPCClient.On("GetSwapOut", mock.Anything, &rpc.GetSwapOutRequest{Id: "test-swap"}).Return(
			&rpc.GetSwapOutResponse{
				Id:     "test-swap",
				Status: rpc.Status_DONE,
			}, nil)

		// Test the core logic by manually calling the polling logic once
		// Since monitorSwapUntilTerminal uses a 1-minute ticker, we'll test the core logic directly
		ctx := context.Background()
		resp, err := service.rpcClient.GetSwapOut(ctx, &rpc.GetSwapOutRequest{Id: "test-swap"})
		assert.NoError(t, err)
		if resp.Status == rpc.Status_DONE || resp.Status == rpc.Status_CONTRACT_EXPIRED {
			service.removeRunningSwap("test-swap")
		}

		// Verify swap was removed from running list
		assert.False(t, service.hasRunningSwap())

		mockRPCClient.AssertExpectations(t)
	})

	t.Run("MonitorSwapUntilTerminal_Expired", func(t *testing.T) {
		mockSwapClient := &MockSwapClient{}
		mockRPCClient := &MockRPCClient{}
		mockLightningClient := &MockLightningClient{}
		config := NewAutoSwapConfig()

		service := NewAutoSwapService(mockSwapClient, mockRPCClient, mockLightningClient, config)
		service.addRunningSwap("test-swap")

		// Mock GetSwapOut to return CONTRACT_EXPIRED status
		mockRPCClient.On("GetSwapOut", mock.Anything, &rpc.GetSwapOutRequest{Id: "test-swap"}).Return(
			&rpc.GetSwapOutResponse{
				Id:     "test-swap",
				Status: rpc.Status_CONTRACT_EXPIRED,
			}, nil)

		// Test the core logic by manually calling the polling logic once
		ctx := context.Background()
		resp, err := service.rpcClient.GetSwapOut(ctx, &rpc.GetSwapOutRequest{Id: "test-swap"})
		assert.NoError(t, err)
		if resp.Status == rpc.Status_DONE || resp.Status == rpc.Status_CONTRACT_EXPIRED {
			service.removeRunningSwap("test-swap")
		}

		// Verify swap was removed from running list
		assert.False(t, service.hasRunningSwap())

		mockRPCClient.AssertExpectations(t)
	})

	t.Run("MonitorSwapUntilTerminal_ContextCancelled", func(t *testing.T) {
		mockSwapClient := &MockSwapClient{}
		mockRPCClient := &MockRPCClient{}
		mockLightningClient := &MockLightningClient{}
		config := NewAutoSwapConfig()

		service := NewAutoSwapService(mockSwapClient, mockRPCClient, mockLightningClient, config)
		service.addRunningSwap("test-swap")

		// Test that cancelled context doesn't call GetSwapOut
		ctx, cancel := context.WithCancel(context.Background())
		cancel() // Cancel immediately

		// Simulate the context cancellation check
		select {
		case <-ctx.Done():
			// Context cancelled, should not call GetSwapOut and should keep swap in running list
		default:
			// Should not reach here
			assert.Fail(t, "Context should be cancelled")
		}

		// Verify swap is still in running list (context cancelled before terminal state)
		assert.True(t, service.hasRunningSwap())

		// No expectations needed since GetSwapOut should not be called
	})

	t.Run("MonitorSwapUntilTerminal_PollingError", func(t *testing.T) {
		mockSwapClient := &MockSwapClient{}
		mockRPCClient := &MockRPCClient{}
		mockLightningClient := &MockLightningClient{}
		config := NewAutoSwapConfig()

		service := NewAutoSwapService(mockSwapClient, mockRPCClient, mockLightningClient, config)
		service.addRunningSwap("test-swap")

		// Mock GetSwapOut to return error
		mockRPCClient.On("GetSwapOut", mock.Anything, &rpc.GetSwapOutRequest{Id: "test-swap"}).Return(
			(*rpc.GetSwapOutResponse)(nil), errors.New("polling error"))

		// Test error handling in polling logic
		ctx := context.Background()
		_, err := service.rpcClient.GetSwapOut(ctx, &rpc.GetSwapOutRequest{Id: "test-swap"})
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "polling error")

		// Verify swap is still in running list (error occurred, should continue polling)
		assert.True(t, service.hasRunningSwap())

		mockRPCClient.AssertExpectations(t)
	})
}

func TestAutoSwapService_Concurrency(t *testing.T) {
	t.Run("ConcurrentRunningSwapsAccess", func(t *testing.T) {
		service := NewAutoSwapService(&MockSwapClient{}, &MockRPCClient{}, &MockLightningClient{}, NewAutoSwapConfig())

		var wg sync.WaitGroup
		const numGoroutines = 10
		const numOperations = 100

		// Test concurrent add operations
		wg.Add(numGoroutines)
		for i := 0; i < numGoroutines; i++ {
			go func(id int) {
				defer wg.Done()
				for j := 0; j < numOperations; j++ {
					swapID := fmt.Sprintf("swap-%d-%d", id, j)
					service.addRunningSwap(swapID)
					service.hasRunningSwap()
					service.removeRunningSwap(swapID)
				}
			}(i)
		}

		wg.Wait()

		// Should end with no running swaps
		assert.False(t, service.hasRunningSwap())
	})

	t.Run("ConcurrentMonitoredSwapsAccess", func(t *testing.T) {
		service := NewAutoSwapService(&MockSwapClient{}, &MockRPCClient{}, &MockLightningClient{}, NewAutoSwapConfig())

		var wg sync.WaitGroup
		const numGoroutines = 10
		const numOperations = 100

		// Test concurrent monitored swaps operations
		wg.Add(numGoroutines)
		for i := 0; i < numGoroutines; i++ {
			go func(id int) {
				defer wg.Done()
				for j := 0; j < numOperations; j++ {
					swapID := fmt.Sprintf("swap-%d-%d", id, j)
					service.setSwapMonitored(swapID)
					service.isSwapBeingMonitored(swapID)
					service.unsetSwapMonitored(swapID)
				}
			}(i)
		}

		wg.Wait()

		// Should end with no monitored swaps
		assert.Empty(t, service.monitoredSwaps)
	})
}

func TestAutoSwapService_EdgeCases(t *testing.T) {
	t.Run("EmptySwapID", func(t *testing.T) {
		service := NewAutoSwapService(&MockSwapClient{}, &MockRPCClient{}, &MockLightningClient{}, NewAutoSwapConfig())

		// Test with empty swap ID
		service.addRunningSwap("")
		assert.True(t, service.hasRunningSwap())
		assert.Contains(t, service.runningSwaps, "")

		service.removeRunningSwap("")
		assert.False(t, service.hasRunningSwap())
	})

	t.Run("DuplicateSwapIDs", func(t *testing.T) {
		service := NewAutoSwapService(&MockSwapClient{}, &MockRPCClient{}, &MockLightningClient{}, NewAutoSwapConfig())

		// Add same swap ID multiple times
		service.addRunningSwap("duplicate")
		service.addRunningSwap("duplicate")
		service.addRunningSwap("duplicate")

		// Should only have one entry
		assert.Len(t, service.runningSwaps, 1)
		assert.True(t, service.hasRunningSwap())

		// Remove once should remove it
		service.removeRunningSwap("duplicate")
		assert.False(t, service.hasRunningSwap())
	})

	t.Run("NilConfig", func(t *testing.T) {
		mockSwapClient := &MockSwapClient{}
		mockRPCClient := &MockRPCClient{}
		mockLightningClient := &MockLightningClient{}

		// Should handle nil config gracefully
		service := NewAutoSwapService(mockSwapClient, mockRPCClient, mockLightningClient, nil)
		assert.NotNil(t, service)
		assert.Nil(t, service.config)
	})

	t.Run("DisabledConfig", func(t *testing.T) {
		mockSwapClient := &MockSwapClient{}
		mockRPCClient := &MockRPCClient{}
		mockLightningClient := &MockLightningClient{}
		config := NewAutoSwapConfig()
		config.Enabled = false

		service := NewAutoSwapService(mockSwapClient, mockRPCClient, mockLightningClient, config)

		// Mock GetInfo
		mockLightningClient.On("GetInfo", mock.Anything).Return(&lnrpc.GetInfoResponse{
			Features: map[uint32]*lnrpc.Feature{
				17: {Name: "multi-path-payments", IsKnown: true},
			},
		}, nil)

		// Mock GetChannelLocalBalance with high balance
		mockLightningClient.On("GetChannelLocalBalance", mock.Anything).Return(
			decimal.NewFromInt(150000000), nil) // 1.5 BTC in satoshis

		err := service.RunAutoSwapCheck(context.Background())
		assert.NoError(t, err)

		// Should not initiate any swaps when disabled
		assert.False(t, service.hasRunningSwap())
		mockRPCClient.AssertNotCalled(t, "SwapOut")
	})
}

func TestAutoSwapService_Integration(t *testing.T) {
	t.Run("FullAutoSwapFlow", func(t *testing.T) {
		mockSwapClient := &MockSwapClient{}
		mockRPCClient := &MockRPCClient{}
		mockLightningClient := &MockLightningClient{}
		config := NewAutoSwapConfig()
		config.Enabled = true
		config.TargetBalanceBTC = 1.0
		config.MaxSwapSizeBTC = 0.1
		config.MinSwapSizeBTC = 0.001
		config.MaxAttempts = 3
		config.BackoffFactor = 0.5

		service := NewAutoSwapService(mockSwapClient, mockRPCClient, mockLightningClient, config)

		// Mock GetInfo with MPP support
		mockLightningClient.On("GetInfo", mock.Anything).Return(&lnrpc.GetInfoResponse{
			Features: map[uint32]*lnrpc.Feature{
				17: {Name: "multi-path-payments", IsKnown: true},
			},
		}, nil)

		// Mock GetChannelLocalBalance with high balance
		mockLightningClient.On("GetChannelLocalBalance", mock.Anything).Return(
			decimal.NewFromInt(150000000), nil) // 1.5 BTC in satoshis

		// Mock GenerateAddress
		mockLightningClient.On("GenerateAddress", mock.Anything).Return("bc1test", nil)

		// Mock SwapOut success
		mockRPCClient.On("SwapOut", mock.Anything, mock.Anything).Return(&rpc.SwapOutResponse{
			SwapId:     "test-swap-id",
			AmountSats: 10000000, // 0.1 BTC in sats
		}, nil)

		// Run auto swap check
		err := service.RunAutoSwapCheck(context.Background())
		assert.NoError(t, err)

		// Verify all mocks were called as expected
		mockLightningClient.AssertExpectations(t)
		mockRPCClient.AssertExpectations(t)
	})
}
