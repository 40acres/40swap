package swaps

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
)

// MockLightningClient is a mock implementation of LightningClient
type MockLightningClient struct {
	mock.Mock
}

func (m *MockLightningClient) GetInfo(ctx context.Context) (*LightningInfo, error) {
	args := m.Called(ctx)
	return args.Get(0).(*LightningInfo), args.Error(1)
}

func TestAutoSwapService(t *testing.T) {
	t.Run("RunAutoSwapCheck with balance above target", func(t *testing.T) {
		// Create mocks
		mockLightning := new(MockLightningClient)
		mockClient := NewMockClientInterface(nil) // Use the existing mock

		// Setup config
		config := NewAutoSwapConfig()
		config.Enabled = true
		config.TargetBalanceBTC = 1.0

		// Setup lightning mock to return balance above target
		mockLightning.On("GetInfo", mock.Anything).Return(&LightningInfo{
			LocalBalance:  1.5, // Above target of 1.0
		}, nil)

		// Create service
		service := NewAutoSwapService(mockClient, mockLightning, config)

		// Run the check
		err := service.RunAutoSwapCheck(context.Background())

		// Verify
		assert.NoError(t, err)
		mockLightning.AssertExpectations(t)
	})

	t.Run("RunAutoSwapCheck with balance below target", func(t *testing.T) {
		// Create mocks
		mockLightning := new(MockLightningClient)
		mockClient := NewMockClientInterface(nil) // Use the existing mock

		// Setup config
		config := NewAutoSwapConfig()
		config.Enabled = true
		config.TargetBalanceBTC = 1.0

		// Setup lightning mock to return balance below target
		mockLightning.On("GetInfo", mock.Anything).Return(&LightningInfo{
			LocalBalance:  0.5, // Below target of 1.0
		}, nil)

		// Create service
		service := NewAutoSwapService(mockClient, mockLightning, config)

		// Run the check
		err := service.RunAutoSwapCheck(context.Background())

		// Verify
		assert.NoError(t, err)
		mockLightning.AssertExpectations(t)
	})

	t.Run("RunAutoSwapCheck with lightning error", func(t *testing.T) {
		// Create mocks
		mockLightning := new(MockLightningClient)
		mockClient := NewMockClientInterface(nil) // Use the existing mock

		// Setup config
		config := NewAutoSwapConfig()
		config.Enabled = true

		// Setup lightning mock to return error
		mockLightning.On("GetInfo", mock.Anything).Return((*LightningInfo)(nil), assert.AnError)

		// Create service
		service := NewAutoSwapService(mockClient, mockLightning, config)

		// Run the check
		err := service.RunAutoSwapCheck(context.Background())

		// Verify
		assert.Error(t, err)
		mockLightning.AssertExpectations(t)
	})
}
 