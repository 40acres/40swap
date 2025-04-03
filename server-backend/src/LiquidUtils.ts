import { liquid as liquidMainnet, regtest as liquidRegtest, testnet as liquidTestnet, Network as liquidNetwork } from 'liquidjs-lib/src/networks.js';
import { bitcoin as bitcoinMainnet, regtest as bitcoinRegtest, testnet as bitcoinTestnet, Network as bitcoinNetwork } from 'bitcoinjs-lib/src/networks.js';


export function getLiquidNetwork(network: bitcoinNetwork): liquidNetwork {
    switch (network) {
    case bitcoinMainnet:
        return liquidMainnet;
    case bitcoinRegtest:
        return liquidRegtest;
    case bitcoinTestnet:
        return liquidTestnet;
    default:
        throw new Error(`Unsupported network: ${network}`);
    }
}
