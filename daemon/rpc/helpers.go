package rpc

import (
	"github.com/40acres/40swap/daemon/database/models"
	"github.com/40acres/40swap/daemon/lightning"

	"github.com/btcsuite/btcd/chaincfg"
)

func ToChainCfgNetwork(network Network) *chaincfg.Params {
	switch network {
	case Network_MAINNET:
		return &chaincfg.MainNetParams
	case Network_REGTEST:
		return &chaincfg.RegressionNetParams
	case Network_TESTNET:
		return &chaincfg.TestNet3Params
	default:
		return nil
	}
}

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
