package rpc

import (
	"github.com/40acres/40swap/daemon/database/models"
	"github.com/40acres/40swap/daemon/lightning"
)

func ToLightningNetworkType(network Network) lightning.Network {
	switch network {
	case Network_MAINNET:
		return lightning.Mainnet
	case Network_REGTEST:
		return lightning.Regtest
	case Network_TESTNET:
		return lightning.Testnet
	default:
		return lightning.Mainnet
	}
}

func ToModelsChainType(chain Chain) models.Chain {
	switch chain {
	case Chain_BITCOIN:
		return models.Bitcoin
	case Chain_LIQUID:
		return models.Liquid
	default:
		return models.Bitcoin
	}
}

func ToRPCChainType(chain models.Chain) Chain {
	switch chain {
	case models.Bitcoin:
		return Chain_BITCOIN
	case models.Liquid:
		return Chain_LIQUID
	default:
		return Chain_BITCOIN
	}
}

func ToModelsSwapStatusType(status string) models.SwapStatus {
	switch status {
	case "IN_PROGRESS":
		return models.StatusInProgress
	case "DONE":
		return models.StatusCompleted
	case "CONTRACT_REFUNDED_UNCONFIRMED":
		return models.StatusFailed
	default:
		return models.StatusPending
	}
}
