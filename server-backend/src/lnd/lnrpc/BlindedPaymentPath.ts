// Original file: src/lnd/lightning.proto

import type { BlindedPath as _lnrpc_BlindedPath, BlindedPath__Output as _lnrpc_BlindedPath__Output } from '../lnrpc/BlindedPath';
import type { FeatureBit as _lnrpc_FeatureBit, FeatureBit__Output as _lnrpc_FeatureBit__Output } from '../lnrpc/FeatureBit';
import type { Long } from '@grpc/proto-loader';

export interface BlindedPaymentPath {
    blindedPath?: _lnrpc_BlindedPath | null;
    baseFeeMsat?: number | string | Long;
    proportionalFeeRate?: number;
    totalCltvDelta?: number;
    htlcMinMsat?: number | string | Long;
    htlcMaxMsat?: number | string | Long;
    features?: _lnrpc_FeatureBit[];
}

export interface BlindedPaymentPath__Output {
    blindedPath: _lnrpc_BlindedPath__Output | null;
    baseFeeMsat: string;
    proportionalFeeRate: number;
    totalCltvDelta: number;
    htlcMinMsat: string;
    htlcMaxMsat: string;
    features: _lnrpc_FeatureBit__Output[];
}
