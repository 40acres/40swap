package swaps

import (
	"context"
	"crypto/rand"
	"fmt"
	"time"

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
}

// LightningClient interface for LND operations
type LightningClient interface {
	GetInfo(ctx context.Context) (*LightningInfo, error)
	PayInvoice(ctx context.Context, paymentRequest string, feeLimitRatio float64) error
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

// PayInvoice implements LightningClient interface
func (a *LightningClientAdapter) PayInvoice(ctx context.Context, paymentRequest string, feeLimitRatio float64) error {
	return a.client.PayInvoice(ctx, paymentRequest, feeLimitRatio)
}

// NewAutoSwapService creates a new AutoSwapService
func NewAutoSwapService(client ClientInterface, lightningClient LightningClient, config *AutoSwapConfig) *AutoSwapService {
	return &AutoSwapService{
		client:          client,
		lightningClient: lightningClient,
		config:          config,
	}
}

// createSwapOut creates a new swap out with the given amount
func (s *AutoSwapService) createSwapOut(ctx context.Context, amountBTC float64) (*SwapOutResponse, error) {
	log.Infof("[AutoSwap] Creating swap out for %.8f BTC", amountBTC)

	// Generate a random preimage
	preimageBytes := make([]byte, 32)
	_, err := rand.Read(preimageBytes)
	if err != nil {
		return nil, fmt.Errorf("failed to generate preimage: %w", err)
	}

	preimage, err := lntypes.MakePreimage(preimageBytes)
	if err != nil {
		return nil, fmt.Errorf("failed to create preimage: %w", err)
	}

	// Create a private key for the claim
	claimPrivateKey, err := generatePrivateKey()
	if err != nil {
		return nil, fmt.Errorf("failed to generate claim private key: %w", err)
	}

	// Convert amount to money.Money
	amount, err := money.NewFromBtc(decimal.NewFromFloat(amountBTC))
	if err != nil {
		return nil, fmt.Errorf("failed to create money amount: %w", err)
	}

	// Create the swap out request
	swapRequest := CreateSwapOutRequest{
		Chain:        models.Bitcoin,
		PreImageHash: preimage.Hash().String(),
		ClaimPubKey:  claimPrivateKey,
		Amount:       amount,
	}

	// Create the swap out
	swapResponse, err := s.client.CreateSwapOut(ctx, swapRequest)
	if err != nil {
		return nil, fmt.Errorf("failed to create swap out: %w", err)
	}

	log.Infof("[AutoSwap] Successfully created swap out: %s", swapResponse.SwapId)
	return swapResponse, nil
}

// generatePrivateKey generates a new private key for claim purposes
func generatePrivateKey() (string, error) {
	// This is a simplified implementation
	// In a real implementation, you might want to use a proper key derivation
	// or integrate with a wallet system
	keyBytes := make([]byte, 32)
	_, err := rand.Read(keyBytes)
	if err != nil {
		return "", err
	}

	// Return as hex string
	return fmt.Sprintf("%x", keyBytes), nil
}

// RunAutoSwapCheck performs the auto swap check logic
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

		// Create the swap out
		swapResponse, err := s.createSwapOut(ctx, swapAmount)
		if err != nil {
			log.Errorf("[AutoSwap] Failed to create swap out: %v", err)
			return err
		}

		log.Infof("[AutoSwap] Successfully created swap out %s with invoice: %s",
			swapResponse.SwapId, swapResponse.Invoice)

		// Pagar la invoice automáticamente
		feeLimitRatio := float64(s.config.RoutingFeeLimitPPM) / 1_000_000 // PPM a ratio
		log.Infof("[AutoSwap] Paying invoice for swap out %s with fee limit ratio %.6f", swapResponse.SwapId, feeLimitRatio)
		err = s.lightningClient.PayInvoice(ctx, swapResponse.Invoice, feeLimitRatio)
		if err != nil {
			log.Errorf("[AutoSwap] Failed to pay invoice for swap out %s: %v", swapResponse.SwapId, err)
			return err
		}
		log.Infof("[AutoSwap] Invoice paid for swap out %s", swapResponse.SwapId)

		// Monitorear el estado del swap y hacer claim automático
		maxAttempts := s.config.MaxAttempts
		interval := s.config.GetCheckInterval()
		backoff := s.config.BackoffFactor
		for attempt := 1; attempt <= maxAttempts; attempt++ {
			log.Infof("[AutoSwap] Checking swap out status (attempt %d/%d)...", attempt, maxAttempts)
			swap, err := s.client.GetSwapOut(ctx, swapResponse.SwapId)
			if err != nil {
				log.Errorf("[AutoSwap] Failed to get swap out status: %v", err)
				return err
			}
			log.Infof("[AutoSwap] Swap out %s status: %s", swap.SwapId, swap.Status)
			if swap.Status == models.StatusContractFunded {
				log.Infof("[AutoSwap] Swap out %s is ready to be claimed!", swap.SwapId)
				// Obtener PSBT de claim
				claimAddress := "" // TODO: set destination address if needed
				psbtResp, err := s.client.GetClaimPSBT(ctx, swap.SwapId, claimAddress)
				if err != nil {
					log.Errorf("[AutoSwap] Failed to get claim PSBT: %v", err)
					return err
				}
				// Firmar y enviar el claim (aquí solo lo enviamos, la firma real depende de la clave privada)
				err = s.client.PostClaim(ctx, swap.SwapId, psbtResp.PSBT)
				if err != nil {
					log.Errorf("[AutoSwap] Failed to post claim: %v", err)
					return err
				}
				log.Infof("[AutoSwap] Claim transaction sent for swap out %s", swap.SwapId)
				break
			}
			// Si no está listo, esperar con backoff
			sleepDuration := time.Duration(float64(interval) * (1 + backoff*float64(attempt-1)))
			log.Infof("[AutoSwap] Swap out %s not ready, waiting %s before next check...", swap.SwapId, sleepDuration)
			time.Sleep(sleepDuration)
		}
	} else {
		log.Info("[AutoSwap] Local balance is within target, no action needed")
	}

	return nil
}
