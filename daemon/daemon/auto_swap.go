package daemon

import (
	"context"
	"fmt"

	"github.com/40acres/40swap/daemon/lightning"
	"github.com/40acres/40swap/daemon/rpc"
	swaps "github.com/40acres/40swap/daemon/swaps"
	"github.com/shopspring/decimal"
	log "github.com/sirupsen/logrus"
)

// AutoSwapService handles the auto swap functionality
type AutoSwapService struct {
	client          swaps.ClientInterface
	lightningClient lightning.Client
	rpcClient       rpc.SwapServiceClient
	config          *AutoSwapConfig
}


// LightningInfo represents LND node information
type LightningInfo struct {
	LocalBalance float64 // in BTC
}

// NewAutoSwapService creates a new AutoSwapService with dependencies for reusing existing logic
func NewAutoSwapService(
	client swaps.ClientInterface,
	rpcClient rpc.SwapServiceClient,
	lightningClient lightning.Client,
	config *AutoSwapConfig,
) *AutoSwapService {
	return &AutoSwapService{
		client:          client,
		rpcClient:       rpcClient,
		lightningClient: lightningClient,
		config:          config,
	}
}

// RunAutoSwapCheck performs the auto swap check logic using existing components
func (s *AutoSwapService) RunAutoSwapCheck(ctx context.Context) error {
	log.Info("[AutoSwap] Starting auto swap check...")

	// Get LND info
	info, err := s.lightningClient.GetChannelBalance(ctx)
	if err != nil {
		return fmt.Errorf("failed to get channel balance: %w", err)
	}

	// Convert from satoshis to BTC (1 BTC = 100,000,000 sats)
	localBalanceBTC := info.Div(decimal.NewFromInt(100000000)).InexactFloat64()

	log.Infof("[AutoSwap] Current local balance: %.8f BTC, target: %.8f BTC",
		localBalanceBTC, s.config.TargetBalanceBTC)

	// Check if local balance exceeds target
	if localBalanceBTC > s.config.TargetBalanceBTC {
		excess := localBalanceBTC - s.config.TargetBalanceBTC
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

		addr, err := s.lightningClient.GenerateAddress(ctx)
		if err != nil {
			log.Errorf("[AutoSwap] Failed to generate address: %v", err)
			return err
		}
	
		maxRoutingFeePercent := float32(0.0005)
		swapOutRequest := rpc.SwapOutRequest{
			Chain:                rpc.Chain_BITCOIN,
			AmountSats:           uint64(swapAmount * 100000000), // Convert BTC to sats
			Address:              addr,
			MaxRoutingFeePercent: &maxRoutingFeePercent,
		}

		swap, err := s.rpcClient.SwapOut(ctx, &swapOutRequest)
		if err != nil {
			return err
		}

		log.Infof("[AutoSwap] Auto swap out completed successfully: %v", swap)
	} else {
		log.Info("[AutoSwap] Local balance is within target, no action needed")
	}

	return nil
}
