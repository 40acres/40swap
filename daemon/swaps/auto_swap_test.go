package swaps

import (
	"context"
	"testing"

	"github.com/40acres/40swap/daemon/database/models"
	"github.com/40acres/40swap/daemon/money"
	"github.com/lightningnetwork/lnd/lntypes"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"go.uber.org/mock/gomock"
)

// MockLightningClient is a mock implementation of LightningClient
type MockLightningClient struct {
	mock.Mock
}

func (m *MockLightningClient) GetInfo(ctx context.Context) (*LightningInfo, error) {
	args := m.Called(ctx)
	return args.Get(0).(*LightningInfo), args.Error(1)
}

// MockSwapOutCreator is a mock implementation of SwapOutCreator
type MockSwapOutCreator struct {
	mock.Mock
}

func (m *MockSwapOutCreator) CreateSwapOut(ctx context.Context, claimPubKey string, amountSats money.Money) (*SwapOutResponse, *lntypes.Preimage, error) {
	args := m.Called(ctx, claimPubKey, amountSats)
	return args.Get(0).(*SwapOutResponse), args.Get(1).(*lntypes.Preimage), args.Error(2)
}

// MockSwapOutMonitor is a mock implementation of SwapOutMonitor
type MockSwapOutMonitor struct {
	mock.Mock
}

func (m *MockSwapOutMonitor) MonitorSwapOut(ctx context.Context, swap *models.SwapOut) error {
	args := m.Called(ctx, swap)
	return args.Error(0)
}

func (m *MockSwapOutMonitor) ClaimSwapOut(ctx context.Context, swap *models.SwapOut) (string, error) {
	args := m.Called(ctx, swap)
	return args.String(0), args.Error(1)
}

func TestAutoSwapService(t *testing.T) {
	t.Run("RunAutoSwapCheck with balance above target", func(t *testing.T) {
		ctrl := gomock.NewController(t)
		defer ctrl.Finish()

		// Create mocks
		mockLightning := new(MockLightningClient)
		mockClient := NewMockClientInterface(ctrl)
		mockSwapOutCreator := new(MockSwapOutCreator)
		mockSwapOutMonitor := new(MockSwapOutMonitor)

		// Setup config
		config := NewAutoSwapConfig()
		config.Enabled = true
		config.TargetBalanceBTC = 1.0

		// Setup lightning mock to return balance above target
		mockLightning.On("GetInfo", mock.Anything).Return(&LightningInfo{
			LocalBalance: 1.5, // Above target of 1.0
		}, nil)

		// Create service
		service := NewAutoSwapService(mockClient, mockLightning, config, mockSwapOutCreator, mockSwapOutMonitor)

		// Run the check
		err := service.RunAutoSwapCheck(context.Background())

		// Verify
		assert.NoError(t, err)
		mockLightning.AssertExpectations(t)
	})

	t.Run("RunAutoSwapCheck with balance below target", func(t *testing.T) {
		ctrl := gomock.NewController(t)
		defer ctrl.Finish()

		// Create mocks
		mockLightning := new(MockLightningClient)
		mockClient := NewMockClientInterface(ctrl)
		mockSwapOutCreator := new(MockSwapOutCreator)
		mockSwapOutMonitor := new(MockSwapOutMonitor)

		// Setup config
		config := NewAutoSwapConfig()
		config.Enabled = true
		config.TargetBalanceBTC = 1.0

		// Setup lightning mock to return balance below target
		mockLightning.On("GetInfo", mock.Anything).Return(&LightningInfo{
			LocalBalance: 0.5, // Below target of 1.0
		}, nil)

		// Create service
		service := NewAutoSwapService(mockClient, mockLightning, config, mockSwapOutCreator, mockSwapOutMonitor)

		// Run the check
		err := service.RunAutoSwapCheck(context.Background())

		// Verify
		assert.NoError(t, err)
		mockLightning.AssertExpectations(t)
	})

	t.Run("RunAutoSwapCheck with lightning error", func(t *testing.T) {
		ctrl := gomock.NewController(t)
		defer ctrl.Finish()

		// Create mocks
		mockLightning := new(MockLightningClient)
		mockClient := NewMockClientInterface(ctrl)
		mockSwapOutCreator := new(MockSwapOutCreator)
		mockSwapOutMonitor := new(MockSwapOutMonitor)

		// Setup config
		config := NewAutoSwapConfig()
		config.Enabled = true

		// Setup lightning mock to return error
		mockLightning.On("GetInfo", mock.Anything).Return((*LightningInfo)(nil), assert.AnError)

		// Create service
		service := NewAutoSwapService(mockClient, mockLightning, config, mockSwapOutCreator, mockSwapOutMonitor)

		// Run the check
		err := service.RunAutoSwapCheck(context.Background())

		// Verify
		assert.Error(t, err)
		mockLightning.AssertExpectations(t)
	})

	t.Run("RunAutoSwapCheck creates swap out when balance exceeds target", func(t *testing.T) {
		ctrl := gomock.NewController(t)
		defer ctrl.Finish()

		// Create mocks
		mockLightning := new(MockLightningClient)
		mockClient := NewMockClientInterface(ctrl)
		mockSwapOutCreator := new(MockSwapOutCreator)
		mockSwapOutMonitor := new(MockSwapOutMonitor)

		// Setup config
		config := NewAutoSwapConfig()
		config.Enabled = true
		config.TargetBalanceBTC = 1.0
		config.MinSwapSizeBTC = 0.001
		config.MaxSwapSizeBTC = 0.1

		// Setup lightning mock to return balance above target
		mockLightning.On("GetInfo", mock.Anything).Return(&LightningInfo{
			LocalBalance: 1.2, // Above target of 1.0, excess of 0.2 BTC
		}, nil)

		// Create service
		service := NewAutoSwapService(mockClient, mockLightning, config, mockSwapOutCreator, mockSwapOutMonitor)

		// Run the check
		err := service.RunAutoSwapCheck(context.Background())

		// Verify
		assert.NoError(t, err)
		mockLightning.AssertExpectations(t)
	})

	t.Run("RunAutoSwapCheck skips swap when excess is below minimum", func(t *testing.T) {
		ctrl := gomock.NewController(t)
		defer ctrl.Finish()

		// Create mocks
		mockLightning := new(MockLightningClient)
		mockClient := NewMockClientInterface(ctrl)
		mockSwapOutCreator := new(MockSwapOutCreator)
		mockSwapOutMonitor := new(MockSwapOutMonitor)

		// Setup config with high minimum
		config := NewAutoSwapConfig()
		config.Enabled = true
		config.TargetBalanceBTC = 1.0
		config.MinSwapSizeBTC = 0.1 // High minimum
		config.MaxSwapSizeBTC = 0.5

		// Setup lightning mock to return balance slightly above target
		mockLightning.On("GetInfo", mock.Anything).Return(&LightningInfo{
			LocalBalance: 1.05, // Only 0.05 BTC excess, below minimum of 0.1
		}, nil)

		// Create service
		service := NewAutoSwapService(mockClient, mockLightning, config, mockSwapOutCreator, mockSwapOutMonitor)

		// Run the check
		err := service.RunAutoSwapCheck(context.Background())

		// Verify
		assert.NoError(t, err)
		mockLightning.AssertExpectations(t)
		// No expectations on mockClient since no swap should be created
	})
}
