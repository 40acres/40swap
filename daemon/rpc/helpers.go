package rpc

import "github.com/40acres/40swap/daemon/lightning"

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
