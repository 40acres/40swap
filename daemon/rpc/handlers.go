package rpc

import (
	"context"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/40acres/40swap/daemon/database/models"
	"github.com/40acres/40swap/daemon/lightning"
	"github.com/40acres/40swap/daemon/money"
	"github.com/40acres/40swap/daemon/swaps"
	"github.com/btcsuite/btcd/btcec/v2"
	"github.com/btcsuite/btcd/btcutil"
	"github.com/lightningnetwork/lnd/zpay32"
	"github.com/shopspring/decimal"
	log "github.com/sirupsen/logrus"
	"google.golang.org/protobuf/types/known/timestamppb"
)

func (server *Server) SwapIn(ctx context.Context, req *SwapInRequest) (*SwapInResponse, error) {
	log.Infof("Received SwapIn request: %v", req)
	network := ToLightningNetworkType(server.network)

	if req.Invoice == nil {
		if req.AmountSats == nil {
			return nil, fmt.Errorf("either invoice or amountSats must be provided")
		}
		amt := decimal.NewFromUint64(uint64(*req.AmountSats))

		// 3 days
		expiry := 3 * 24 * 60 * 60 * time.Second
		if req.Expiry != nil {
			expiry = time.Duration(*req.Expiry) * time.Second
		}

		invoice, _, err := server.lightningClient.GenerateInvoice(ctx, amt, expiry, "")
		if err != nil {
			return nil, fmt.Errorf("could not generate invoice: %w", err)
		}

		req.Invoice = &invoice
	}

	invoice, err := zpay32.Decode(*req.Invoice, lightning.ToChainCfgNetwork(network))
	if err != nil {
		return nil, fmt.Errorf("could not decode invoice: %w", err)
	}

	config, err := server.swapClient.GetConfiguration(ctx)
	if err != nil {
		return nil, fmt.Errorf("could not get configuration: %w", err)
	}
	invoiceAmount := decimal.NewFromFloat(invoice.MilliSat.ToBTC())
	if invoiceAmount.LessThan(config.MinimumAmount) || invoiceAmount.GreaterThan(config.MaximumAmount) {
		return nil, fmt.Errorf("amount %s is not in the range [%s, %s]", invoiceAmount, config.MinimumAmount, config.MaximumAmount)
	}

	serviceFee := invoiceAmount.Mul(decimal.NewFromInt(1e8)).Mul(config.FeePercentage)

	refundPrivateKey, err := btcec.NewPrivateKey()
	if err != nil {
		return nil, fmt.Errorf("could not generate EC key pair: %w", err)
	}

	chain := ToModelsChainType(req.Chain)

	swap, err := server.swapClient.CreateSwapIn(ctx, &swaps.CreateSwapInRequest{
		Chain:           chain,
		RefundPublicKey: hex.EncodeToString(refundPrivateKey.PubKey().SerializeCompressed()),
		Invoice:         *req.Invoice,
	})
	if err != nil {
		return nil, fmt.Errorf("could not create swap: %w", err)
	}

	err = server.Repository.SaveSwapIn(&models.SwapIn{
		SwapID: swap.SwapId,
		//nolint:gosec
		AmountSats:         int64(*invoice.MilliSat / 1000),
		Status:             models.SwapStatus(swap.Status),
		SourceChain:        chain,
		ClaimAddress:       swap.ContractAddress,
		TimeoutBlockHeight: int64(swap.TimeoutBlockHeight),
		RefundPrivatekey:   hex.EncodeToString(refundPrivateKey.Serialize()),
		RedeemScript:       swap.RedeemScript,
		PaymentRequest:     *req.Invoice,
		ServiceFeeSats:     serviceFee.IntPart(),
	})
	if err != nil {
		return nil, fmt.Errorf("could not save swap: %w", err)
	}

	log.Info("Swap created: ", swap.SwapId)

	return &SwapInResponse{
		SwapId:       swap.SwapId,
		ClaimAddress: swap.ContractAddress,
	}, nil
}

func (server *Server) SwapOut(ctx context.Context, req *SwapOutRequest) (*SwapOutResponse, error) {
	log.Info("Swapping out")

	// Validate request
	if req.AmountSats > 21_000_000*100_000_000 {
		return nil, fmt.Errorf("amount must be less than 21,000,000 BTC")
	}

	config, err := server.swapClient.GetConfiguration(ctx)
	if err != nil {
		return nil, fmt.Errorf("could not get configuration: %w", err)
	}
	invoiceAmount := decimal.NewFromUint64(req.AmountSats).Div(decimal.NewFromInt(1e8))
	if invoiceAmount.LessThan(config.MinimumAmount) || invoiceAmount.GreaterThan(config.MaximumAmount) {
		return nil, fmt.Errorf("amount %s is not in the range [%s, %s]", invoiceAmount, config.MinimumAmount, config.MaximumAmount)
	}

	serviceFee := decimal.NewFromUint64(req.AmountSats).Mul(config.FeePercentage)

	_, err = btcutil.DecodeAddress(req.Address, ToChainCfgNetwork(server.network))
	if err != nil {
		return nil, fmt.Errorf("invalid address: %w", err)
	}

	// Private key for the claim
	claimKey, err := btcec.NewPrivateKey()
	if err != nil {
		return nil, err
	}
	pubkey := hex.EncodeToString(claimKey.PubKey().SerializeCompressed())

	// Create swap out
	swap, err := server.CreateSwapOut(ctx, pubkey, money.Money(req.AmountSats))
	if err != nil {
		log.Error("Error creating swap: ", err)

		return nil, fmt.Errorf("error creating the swap: %w", err)
	}

	// Save swap to the database
	amount, err := money.NewFromBtc(swap.InputAmount)
	if err != nil {
		return nil, err
	}

	swapModel := models.SwapOut{
		// SwapId:             swap.SwapId, // Wait we merge the models
		Status:             swap.Status,
		DestinationAddress: req.Address,
		DestinationChain:   models.Bitcoin,
		ClaimPubkey:        hex.EncodeToString(claimKey.Serialize()), // TODO: Add claim pubkey to the model
		PaymentRequest:     swap.Invoice,
		AmountSats:         int64(amount), // nolint:gosec
		ServiceFeeSats:     serviceFee.IntPart(),
		MaxRoutingFeeRatio: 0.005, // 0.5% is a good max value for Lightning Network - TODO: pass this as a parameter
	}

	err = server.Repository.SaveSwapOut(&swapModel)
	if err != nil {
		return nil, err
	}

	// Send L2 payment
	err = server.lightningClient.PayInvoice(ctx, swap.Invoice, swapModel.MaxRoutingFeeRatio)
	if err != nil {
		log.Error("Error paying the invoice: ", err)

		return nil, fmt.Errorf("error paying the invoice: %w", err)
	}

	return &SwapOutResponse{}, nil
}

// mapStatus maps the swap status from the database to the RPC status
func mapStatus(status models.SwapStatus) (Status, error) {
	switch status {
	case models.StatusCreated:
		return Status_CREATED, nil
	case models.StatusInvoicePaymentIntentReceived:
		return Status_INVOICE_PAYMENT_INTENT_RECEIVED, nil
	case models.StatusFundedUnconfirmed:
		return Status_CONTRACT_FUNDED_UNCONFIRMED, nil
	case models.StatusFunded:
		return Status_CONTRACT_FUNDED, nil
	case models.StatusInvoicePaid:
		return Status_INVOICE_PAID, nil
	case models.StatusContractClaimedUnconfirmed:
		return Status_CONTRACT_CLAIMED_UNCONFIRMED, nil
	case models.StatusDone:
		return Status_DONE, nil
	case models.StatusContractRefundedUnconfirmed:
		return Status_CONTRACT_REFUNDED_UNCONFIRMED, nil
	case models.StatusContractExpired:
		return Status_CONTRACT_EXPIRED, nil
	default:
		return 0, fmt.Errorf("invalid swap status")
	}
}

func (s *Server) GetSwapIn(ctx context.Context, req *GetSwapInRequest) (*GetSwapInResponse, error) {
	if req.Id == "" {
		return nil, fmt.Errorf("swap id is required")
	}

	// Call API
	swap, err := s.swapClient.GetSwapIn(ctx, req.Id)
	if err != nil {
		return nil, fmt.Errorf("could not get swap in: %w", err)
	}

	rpcStatus, err := mapStatus(swap.Status)
	if err != nil {
		return nil, err
	}

	res := &GetSwapInResponse{
		Id:                 swap.SwapId,
		Status:             rpcStatus,
		ContractAddress:    swap.ContractAddress,
		CreatedAt:          timestamppb.New(swap.CreatedAt),
		InputAmount:        swap.InputAmount.InexactFloat64(),
		LockTx:             swap.LockTx,
		Outcome:            &swap.Outcome,
		OutputAmount:       swap.OutputAmount.InexactFloat64(),
		RedeemScript:       swap.RedeemScript,
		TimeoutBlockHeight: swap.TimeoutBlockHeight,
	}

	return res, nil
}

func (s *Server) GetSwapOut(ctx context.Context, req *GetSwapOutRequest) (*GetSwapOutResponse, error) {
	if req.Id == "" {
		return nil, fmt.Errorf("swap id is required")
	}

	// Call API
	swap, err := s.swapClient.GetSwapOut(ctx, req.Id)
	if err != nil {
		return nil, fmt.Errorf("could not get swap out: %w", err)
	}

	rpcStatus, err := mapStatus(swap.Status)
	if err != nil {
		return nil, err
	}

	res := &GetSwapOutResponse{
		Id:                 swap.SwapId,
		Status:             rpcStatus,
		CreatedAt:          timestamppb.New(swap.CreatedAt),
		TimeoutBlockHeight: swap.TimeoutBlockHeight,
		Invoice:            swap.Invoice,
		InputAmount:        swap.InputAmount.InexactFloat64(),
		OutputAmount:       swap.OutputAmount.InexactFloat64(),
	}

	return res, nil
}
