package rpc

import (
	"context"
	"encoding/hex"
	"errors"
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
		// Bug in zpay32 when using regtest invoice with mainnet network
		if err.Error() == "strconv.ParseUint: parsing \"rt2\": invalid syntax" {
			return nil, fmt.Errorf("invalid invoice: %w", errors.New("invoice not for current active network 'mainnet'"))
		}

		return nil, fmt.Errorf("invalid invoice: %w", err)
	}

	if invoice.MilliSat == nil {
		return nil, fmt.Errorf("zero amount invoices are not supported")
	}
	if req.AmountSats != nil && *req.AmountSats != uint64(*invoice.MilliSat/1000) {
		return nil, fmt.Errorf("request amount %d does not match invoice amount %d", *req.AmountSats, *invoice.MilliSat/1000)
	}

	// If the user didn't provide a refund address, generate one to the connected lightning node
	if req.RefundTo == "" {
		address, err := server.lightningClient.GenerateAddress(ctx)
		if err != nil {
			return nil, fmt.Errorf("could not generate address: %w", err)
		}

		req.RefundTo = address
	}

	address, err := btcutil.DecodeAddress(req.RefundTo, lightning.ToChainCfgNetwork(network))
	if err != nil {
		return nil, fmt.Errorf("invalid refund address: %w", err)
	}
	if !address.IsForNet(lightning.ToChainCfgNetwork(network)) {
		return nil, fmt.Errorf("invalid refund address: address is not for the current active network '%s'", network)
	}

	config, err := server.swapClient.GetConfiguration(ctx)
	if err != nil {
		return nil, fmt.Errorf("could not get configuration: %w", err)
	}

	var invoiceAmount decimal.Decimal
	if req.AmountSats == nil {
		invoiceAmount = decimal.NewFromFloat(invoice.MilliSat.ToBTC())
	} else {
		invoiceAmount = decimal.NewFromUint64(uint64(*req.AmountSats)).Div(decimal.NewFromInt(1e8))
	}

	if invoiceAmount.LessThan(config.MinimumAmount) || invoiceAmount.GreaterThan(config.MaximumAmount) {
		return nil, fmt.Errorf("amount %s is not in the range [%s, %s]", invoiceAmount, config.MinimumAmount, config.MaximumAmount)
	}

	feeRatio := config.FeePercentage.Div(decimal.NewFromInt(100))
	serviceFeeSats := invoiceAmount.Mul(decimal.NewFromInt(1e8)).Mul(feeRatio)

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
	outputAmountSats := swap.OutputAmount.Mul(decimal.NewFromInt(1e8))
	inputAmountSats := swap.InputAmount.Mul(decimal.NewFromInt(1e8))

	err = server.Repository.SaveSwapIn(&models.SwapIn{
		SwapID: swap.SwapId,
		//nolint:gosec
		AmountSats: int64(*invoice.MilliSat / 1000),
		Status:     models.SwapStatus(swap.Status),
		// All outcomes are failed by default until the swap is completed or refunded
		SourceChain:        chain,
		ClaimAddress:       swap.ContractAddress,
		TimeoutBlockHeight: int64(swap.TimeoutBlockHeight),
		RefundPrivatekey:   hex.EncodeToString(refundPrivateKey.Serialize()),
		RedeemScript:       swap.RedeemScript,
		PaymentRequest:     *req.Invoice,
		ServiceFeeSats:     serviceFeeSats.IntPart(),
		OnChainFeeSats:     inputAmountSats.Sub(outputAmountSats).Sub(serviceFeeSats).IntPart(),
	})
	if err != nil {
		return nil, fmt.Errorf("could not save swap: %w", err)
	}

	log.Info("Swap created: ", swap.SwapId)

	return &SwapInResponse{
		SwapId:       swap.SwapId,
		AmountSats:   uint64(swap.InputAmount.Mul(decimal.NewFromInt(1e8)).IntPart()), // nolint:gosec,
		ClaimAddress: swap.ContractAddress,
	}, nil
}

func (server *Server) SwapOut(ctx context.Context, req *SwapOutRequest) (*SwapOutResponse, error) {
	log.Infof("Received SwapOut request: %v", req)
	network := ToLightningNetworkType(server.network)

	// Validate request
	if req.AmountSats > 21_000_000*100_000_000 {
		return nil, fmt.Errorf("amount must be less than 21,000,000 BTC")
	}

	// If the user didn't provide any address, generate one from the LND wallet
	if req.Address == "" {
		addr, err := server.lightningClient.GenerateAddress(ctx)
		if err != nil {
			return nil, fmt.Errorf("could not generate address: %w", err)
		}

		req.Address = addr
	}

	config, err := server.swapClient.GetConfiguration(ctx)
	if err != nil {
		return nil, fmt.Errorf("could not get configuration: %w", err)
	}
	invoiceAmount := decimal.NewFromUint64(req.AmountSats).Div(decimal.NewFromInt(1e8))
	if invoiceAmount.LessThan(config.MinimumAmount) || invoiceAmount.GreaterThan(config.MaximumAmount) {
		return nil, fmt.Errorf("amount %s is not in the range [%s, %s]", invoiceAmount, config.MinimumAmount, config.MaximumAmount)
	}

	feeRate := config.FeePercentage.Div(decimal.NewFromInt(100))
	serviceFeeSats := invoiceAmount.Mul(decimal.NewFromInt(1e8)).Mul(feeRate)

	address, err := btcutil.DecodeAddress(req.Address, lightning.ToChainCfgNetwork(network))
	if err != nil {
		return nil, fmt.Errorf("invalid address: %w", err)
	}
	if !address.IsForNet(lightning.ToChainCfgNetwork(network)) {
		return nil, fmt.Errorf("invalid refund address: address is not for the current active network '%s'", network)
	}

	// Private key for the claim
	claimKey, err := btcec.NewPrivateKey()
	if err != nil {
		return nil, err
	}
	pubkey := hex.EncodeToString(claimKey.PubKey().SerializeCompressed())

	// Create swap out
	swap, preimage, err := server.CreateSwapOut(ctx, pubkey, money.Money(req.AmountSats))
	if err != nil {
		log.Error("Error creating swap: ", err)

		return nil, fmt.Errorf("error creating the swap: %w", err)
	}

	// Save swap to the database
	amount, err := money.NewFromBtc(swap.InputAmount)
	if err != nil {
		return nil, err
	}

	maxRoutingFeeRatio := 0.005 // 0.5% is a good max value for Lightning Network
	if req.MaxRoutingFeePercent != nil {
		maxRoutingFeeRatio = decimal.NewFromFloat32(*req.MaxRoutingFeePercent).
			Div(decimal.NewFromInt(100)).
			InexactFloat64()
	}

	swapModel := models.SwapOut{
		SwapID:             swap.SwapId,
		Status:             swap.Status,
		DestinationAddress: req.Address,
		DestinationChain:   models.Bitcoin,
		ClaimPrivateKey:    hex.EncodeToString(claimKey.Serialize()),
		PaymentRequest:     swap.Invoice,
		AmountSats:         int64(amount), // nolint:gosec
		ServiceFeeSats:     serviceFeeSats.IntPart(),
		MaxRoutingFeeRatio: maxRoutingFeeRatio,
		PreImage:           preimage,
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

	log.Info("Swap created: ", swap.SwapId)

	return &SwapOutResponse{}, nil
}

// mapStatus maps the swap status from the database to the RPC status
func mapStatus(status models.SwapStatus) (Status, error) {
	switch status {
	case models.StatusCreated:
		return Status_CREATED, nil
	case models.StatusInvoicePaymentIntentReceived:
		return Status_INVOICE_PAYMENT_INTENT_RECEIVED, nil
	case models.StatusContractFundedUnconfirmed:
		return Status_CONTRACT_FUNDED_UNCONFIRMED, nil
	case models.StatusContractFunded:
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
