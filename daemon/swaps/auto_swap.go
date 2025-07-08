package swaps

import (
	"context"
	"fmt"

	"github.com/40acres/40swap/daemon/database/models"
	"github.com/40acres/40swap/daemon/lightning"
	"github.com/40acres/40swap/daemon/money"
	"github.com/lightningnetwork/lnd/lntypes"
	"github.com/shopspring/decimal"
	log "github.com/sirupsen/logrus"
)

// AutoSwapService handles the auto swap functionality
type AutoSwapService struct {
	client          ClientInterface
	lightningClient LightningClient
	config          *AutoSwapConfig
	// Add dependencies for reusing existing logic
	swapOutCreator SwapOutCreator
	swapOutMonitor SwapOutMonitor
}

// SwapOutCreator interface for creating swap outs (reusing RPC logic)
type SwapOutCreator interface {
	CreateSwapOut(ctx context.Context, claimPubKey string, amountSats money.Money) (*SwapOutResponse, *lntypes.Preimage, error)
}

// SwapOutMonitor interface for monitoring swap outs (reusing daemon logic)
type SwapOutMonitor interface {
	MonitorSwapOut(ctx context.Context, swap *models.SwapOut) error
	ClaimSwapOut(ctx context.Context, swap *models.SwapOut) (string, error)
}

// LightningClient interface for LND operations
type LightningClient interface {
	GetInfo(ctx context.Context) (*LightningInfo, error)
}

// LightningInfo represents LND node information
type LightningInfo struct {
	LocalBalance float64 // in BTC
}

// LightningClientAdapter adapts lightning.Client to LightningClient interface
type LightningClientAdapter struct {
	client lightning.Client
}

// NewLightningClientAdapter creates a new adapter
func NewLightningClientAdapter(client lightning.Client) LightningClient {
	return &LightningClientAdapter{client: client}
}

// GetInfo implements LightningClient interface
func (a *LightningClientAdapter) GetInfo(ctx context.Context) (*LightningInfo, error) {
	log.Info("[AutoSwap] Getting LND info from real LND node")

	localBalance, err := a.client.GetChannelBalance(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get channel balance: %w", err)
	}

	// Convert from satoshis to BTC (1 BTC = 100,000,000 sats)
	localBalanceBTC := localBalance.Div(decimal.NewFromInt(100000000)).InexactFloat64()

	return &LightningInfo{
		LocalBalance: localBalanceBTC,
	}, nil
}

// NewAutoSwapService creates a new AutoSwapService with dependencies for reusing existing logic
func NewAutoSwapService(
	client ClientInterface,
	lightningClient LightningClient,
	config *AutoSwapConfig,
	swapOutCreator SwapOutCreator,
	swapOutMonitor SwapOutMonitor,
) *AutoSwapService {
	return &AutoSwapService{
		client:          client,
		lightningClient: lightningClient,
		config:          config,
		swapOutCreator:  swapOutCreator,
		swapOutMonitor:  swapOutMonitor,
	}
}

// RunAutoSwapCheck performs the auto swap check logic using existing components
func (s *AutoSwapService) RunAutoSwapCheck(ctx context.Context) error {
	log.Info("[AutoSwap] Starting auto swap check...")

	// Get LND info
	info, err := s.lightningClient.GetInfo(ctx)
	if err != nil {
		log.Errorf("[AutoSwap] Failed to get LND info: %v", err)
		return err
	}

	log.Infof("[AutoSwap] Current local balance: %.8f BTC, target: %.8f BTC",
		info.LocalBalance, s.config.TargetBalanceBTC)

	// Check if local balance exceeds target
	if info.LocalBalance > s.config.TargetBalanceBTC {
		excess := info.LocalBalance - s.config.TargetBalanceBTC
		log.Infof("[AutoSwap] Local balance exceeds target by %.8f BTC", excess)

		// Determine swap amount based on configuration
		swapAmount := excess
		if swapAmount > s.config.MaxSwapSizeBTC {
			swapAmount = s.config.MaxSwapSizeBTC
		}
		if swapAmount < s.config.MinSwapSizeBTC {
			log.Infof("[AutoSwap] Excess amount %.8f BTC is below minimum swap size %.8f BTC, skipping",
				excess, s.config.MinSwapSizeBTC)
			return nil
		}

		log.Infof("[AutoSwap] Creating swap out for %.8f BTC", swapAmount)

		// TODO: Create the swap out using existing RPC logic

		// log.Infof("[AutoSwap] Auto swap out %s completed successfully", swapResponse.SwapId)
	} else {
		log.Info("[AutoSwap] Local balance is within target, no action needed")
	}

	return nil
}
