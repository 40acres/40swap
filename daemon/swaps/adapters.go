package swaps

import (
	"context"

	"github.com/40acres/40swap/daemon/database/models"
	"github.com/40acres/40swap/daemon/money"
	"github.com/lightningnetwork/lnd/lntypes"
)

// DaemonSwapOutMonitorAdapter adapts the daemon's SwapMonitor methods
type DaemonSwapOutMonitorAdapter struct {
	monitor interface {
		MonitorSwapOut(ctx context.Context, swap *models.SwapOut) error
		ClaimSwapOut(ctx context.Context, swap *models.SwapOut) (string, error)
	}
}

// NewDaemonSwapOutMonitorAdapter creates a new adapter for daemon swap out monitoring
func NewDaemonSwapOutMonitorAdapter(monitor interface {
	MonitorSwapOut(ctx context.Context, swap *models.SwapOut) error
	ClaimSwapOut(ctx context.Context, swap *models.SwapOut) (string, error)
}) *DaemonSwapOutMonitorAdapter {
	return &DaemonSwapOutMonitorAdapter{monitor: monitor}
}

// RPCSwapOutCreatorAdapter adapts the RPC server's SwapOut method for auto swap
type RPCSwapOutCreatorAdapter struct {
	server interface {
		CreateSwapOut(ctx context.Context, claimPubKey string, amountSats money.Money) (*SwapOutResponse, *lntypes.Preimage, error)
	}
}

// NewRPCSwapOutCreatorAdapter creates a new adapter for RPC swap out creation
func NewRPCSwapOutCreatorAdapter(server interface {
	CreateSwapOut(ctx context.Context, claimPubKey string, amountSats money.Money) (*SwapOutResponse, *lntypes.Preimage, error)
}) *RPCSwapOutCreatorAdapter {
	return &RPCSwapOutCreatorAdapter{server: server}
}

// MonitorSwapOut implements SwapOutMonitor interface
func (a *DaemonSwapOutMonitorAdapter) MonitorSwapOut(ctx context.Context, swap *models.SwapOut) error {
	return a.monitor.MonitorSwapOut(ctx, swap)
}

// ClaimSwapOut implements SwapOutMonitor interface
func (a *DaemonSwapOutMonitorAdapter) ClaimSwapOut(ctx context.Context, swap *models.SwapOut) (string, error) {
	return a.monitor.ClaimSwapOut(ctx, swap)
}

// CreateSwapOut implements SwapOutCreator interface
func (a *RPCSwapOutCreatorAdapter) CreateSwapOut(ctx context.Context, claimPubKey string, amountSats money.Money) (*SwapOutResponse, *lntypes.Preimage, error) {
	return a.server.CreateSwapOut(ctx, claimPubKey, amountSats)
}
