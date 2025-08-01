package daemon

import (
	"context"
	"fmt"
	"slices"
	"sync"
	"time"

	"github.com/40acres/40swap/daemon/lightning"
	"github.com/40acres/40swap/daemon/money"
	"github.com/40acres/40swap/daemon/rpc"
	swaps "github.com/40acres/40swap/daemon/swaps"
	log "github.com/sirupsen/logrus"
)

// AutoSwapService handles the auto swap functionality
type AutoSwapService struct {
	client          swaps.ClientInterface
	lightningClient lightning.Client
	rpcClient       rpc.SwapServiceClient
	repository      Repository
	config          *AutoSwapConfig

	runningSwaps   []string // List of currently running auto swap IDs
	runningSwapsMu sync.Mutex

	monitoredSwaps   map[string]struct{} // Set of swapIDs being monitored
	monitoredSwapsMu sync.Mutex
}

// NewAutoSwapService creates a new AutoSwapService with dependencies for reusing existing logic
func NewAutoSwapService(
	client swaps.ClientInterface,
	rpcClient rpc.SwapServiceClient,
	lightningClient lightning.Client,
	repository Repository,
	config *AutoSwapConfig,
) *AutoSwapService {
	service := &AutoSwapService{
		client:          client,
		rpcClient:       rpcClient,
		lightningClient: lightningClient,
		repository:      repository,
		config:          config,
		monitoredSwaps:  make(map[string]struct{}),
		runningSwaps:    make([]string, 0),
	}

	return service
}

// GetCheckInterval returns the auto swap check interval
func (s *AutoSwapService) GetCheckInterval() time.Duration {
	return s.config.GetCheckInterval()
}

// RecoverPendingAutoSwaps recovers auto swaps that were running before daemon restart
func (s *AutoSwapService) RecoverPendingAutoSwaps(ctx context.Context) error {
	pendingAutoSwaps, err := s.repository.GetPendingAutoSwapOuts(ctx)
	if err != nil {
		return fmt.Errorf("failed to get pending auto swaps: %w", err)
	}

	for _, swap := range pendingAutoSwaps {
		log.Infof("[AutoSwap] Recovering auto swap: %s", swap.SwapID)
		s.addRunningSwap(swap.SwapID)

		// Start monitoring this swap in the background
		go s.monitorSwapUntilTerminal(ctx, swap.SwapID)
	}

	if len(pendingAutoSwaps) > 0 {
		log.Infof("[AutoSwap] Recovered %d pending auto swaps", len(pendingAutoSwaps))
	}

	return nil
}

// Add a swap to the running list
func (s *AutoSwapService) addRunningSwap(swapID string) {
	s.runningSwapsMu.Lock()
	defer s.runningSwapsMu.Unlock()
	// Check if the swap is already in the list to avoid duplicates
	if slices.Contains(s.runningSwaps, swapID) {
		return // Already exists, don't add duplicate
	}
	s.runningSwaps = append(s.runningSwaps, swapID)
}

// Remove a swap from the running list
func (s *AutoSwapService) removeRunningSwap(swapID string) {
	s.runningSwapsMu.Lock()
	defer s.runningSwapsMu.Unlock()
	for i, id := range s.runningSwaps {
		if id == swapID {
			s.runningSwaps = append(s.runningSwaps[:i], s.runningSwaps[i+1:]...)

			break
		}
	}
}

// Check if there is any running swap
func (s *AutoSwapService) hasRunningSwap() bool {
	s.runningSwapsMu.Lock()
	defer s.runningSwapsMu.Unlock()

	return len(s.runningSwaps) > 0
}

// Check if a swap is being monitored
func (s *AutoSwapService) isSwapBeingMonitored(swapID string) bool {
	s.monitoredSwapsMu.Lock()
	defer s.monitoredSwapsMu.Unlock()
	_, ok := s.monitoredSwaps[swapID]

	return ok
}

// Mark a swap as being monitored
func (s *AutoSwapService) setSwapMonitored(swapID string) {
	s.monitoredSwapsMu.Lock()
	defer s.monitoredSwapsMu.Unlock()
	s.monitoredSwaps[swapID] = struct{}{}
}

// Unmark a swap as being monitored
func (s *AutoSwapService) unsetSwapMonitored(swapID string) {
	s.monitoredSwapsMu.Lock()
	defer s.monitoredSwapsMu.Unlock()
	delete(s.monitoredSwaps, swapID)
}

// Monitor a swap until it reaches a terminal state, then remove it from the running list
func (s *AutoSwapService) monitorSwapUntilTerminal(ctx context.Context, swapID string) {
	s.setSwapMonitored(swapID)
	defer s.unsetSwapMonitored(swapID)
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			resp, err := s.rpcClient.GetSwapOut(ctx, &rpc.GetSwapOutRequest{Id: swapID})
			if err != nil {
				log.Errorf("[AutoSwap] Error polling swap %s: %v", swapID, err)

				continue
			}
			if resp.Status == rpc.Status_DONE || resp.Status == rpc.Status_CONTRACT_EXPIRED {
				s.removeRunningSwap(swapID)
				log.Infof("[AutoSwap] Swap %s removed from running list after reaching terminal state (%v)", swapID, resp.Status)

				return
			}
		case <-ctx.Done():
			log.Infof("[AutoSwap] Context cancelled for swap %s monitor", swapID)

			return
		}
	}
}

// RunAutoSwapCheck performs the auto swap check logic using existing components
func (s *AutoSwapService) RunAutoSwapCheck(ctx context.Context) error {
	// Check if auto swap is enabled
	if s.config == nil || !s.config.Enabled {
		log.Info("[AutoSwap] Auto swap is disabled, skipping check")

		return nil
	}
	log.Info("[AutoSwap] Checking for auto swaps ...")

	// Skip if there is already a running auto swap
	if s.hasRunningSwap() {
		log.Info("[AutoSwap] There is already a running auto swap. Skipping.")
		s.runningSwapsMu.Lock()
		swapsToMonitor := append([]string{}, s.runningSwaps...)
		s.runningSwapsMu.Unlock()
		for _, swapID := range swapsToMonitor {
			if !s.isSwapBeingMonitored(swapID) {
				go s.monitorSwapUntilTerminal(ctx, swapID)
			}
		}

		return nil
	}

	// Check for MPP support before proceeding
	info, err := s.lightningClient.GetInfo(ctx)
	if err != nil {
		log.Warnf("[AutoSwap] Could not fetch LND node info to check MPP support: %v", err)
	}
	mppSupported := false
	if info.Features != nil {
		for _, feature := range info.Features {
			if feature.Name == "multi-path-payments" && feature.IsKnown {
				mppSupported = true

				break
			}
		}
	}
	if !mppSupported {
		log.Warn("[AutoSwap] LND node does not advertise MPP (Multi-Path Payments) support. Swaps may fail or be suboptimal.")
	}

	// Get LND info
	balance, err := s.lightningClient.GetChannelLocalBalance(ctx)
	if err != nil {
		return fmt.Errorf("[AutoSwap] failed to get channel balance: %w", err)
	}

	// Convert from satoshis to BTC using money.Money (safe: balance is always positive)
	localBalanceSats := money.Money(balance.BigInt().Uint64())
	localBalanceBTC := localBalanceSats.ToBtc().InexactFloat64()

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

		var attempt int
		maxAttempts := s.config.MaxAttempts
		backoffFactor := s.config.BackoffFactor
		var lastErr error
		for attempt = 1; attempt <= maxAttempts; attempt++ {
			log.Infof("[AutoSwap] Attempt %d/%d: Trying swap out for %.8f BTC", attempt, maxAttempts, swapAmount)

			addr, err := s.lightningClient.GenerateAddress(ctx)
			if err != nil {
				return fmt.Errorf("[AutoSwap] Failed to generate address: %w", err)
			}

			// Convert routing fee limit from PPM to percent
			maxRoutingFeePercent := float32(s.config.RoutingFeeLimitPPM) / 10000.0
			swapOutRequest := rpc.SwapOutRequest{
				Chain:                rpc.Chain_BITCOIN,
				AmountSats:           uint64(swapAmount * 100000000), // Convert BTC to sats
				Address:              addr,
				MaxRoutingFeePercent: &maxRoutingFeePercent,
			}

			swap, err := s.rpcClient.SwapOut(ctx, &swapOutRequest)
			if err != nil {
				log.Errorf("[AutoSwap] Swap out attempt %d failed: %v", attempt, err)
				lastErr = err
				swapAmount = swapAmount * backoffFactor
				if swapAmount < s.config.MinSwapSizeBTC {
					log.Warnf("[AutoSwap] Swap amount %.8f BTC dropped below minimum %.8f BTC after backoff. Stopping retries.", swapAmount, s.config.MinSwapSizeBTC)

					break
				}

				continue
			}

			s.addRunningSwap(swap.SwapId)

			// Mark this swap as an auto swap in the database
			if err := s.repository.UpdateAutoSwap(ctx, swap.SwapId, true); err != nil {
				log.Warnf("[AutoSwap] Failed to mark swap %s as auto swap: %v", swap.SwapId, err)
			}

			log.Infof("[AutoSwap] Auto swap out completed successfully for swap: %v, now processing swap:", swap.SwapId)
			go s.monitorSwapUntilTerminal(ctx, swap.SwapId)

			return nil // Success, exit
		}
		log.Errorf("[AutoSwap] All swap out attempts failed after %d tries. Last error: %v", attempt-1, lastErr)

		return lastErr
	} else {
		log.Info("[AutoSwap] Local balance is within target, no action needed")
	}

	return nil
}
