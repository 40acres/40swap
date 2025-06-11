// Original file: src/lnd/lightning.proto

import type { FeeLimit as _lnrpc_FeeLimit, FeeLimit__Output as _lnrpc_FeeLimit__Output } from '../lnrpc/FeeLimit';
import type { EdgeLocator as _lnrpc_EdgeLocator, EdgeLocator__Output as _lnrpc_EdgeLocator__Output } from '../lnrpc/EdgeLocator';
import type { NodePair as _lnrpc_NodePair, NodePair__Output as _lnrpc_NodePair__Output } from '../lnrpc/NodePair';
import type { RouteHint as _lnrpc_RouteHint, RouteHint__Output as _lnrpc_RouteHint__Output } from '../lnrpc/RouteHint';
import type { FeatureBit as _lnrpc_FeatureBit, FeatureBit__Output as _lnrpc_FeatureBit__Output } from '../lnrpc/FeatureBit';
import type {
    BlindedPaymentPath as _lnrpc_BlindedPaymentPath,
    BlindedPaymentPath__Output as _lnrpc_BlindedPaymentPath__Output,
} from '../lnrpc/BlindedPaymentPath';
import type { Long } from '@grpc/proto-loader';

export interface QueryRoutesRequest {
    pubKey?: string;
    amt?: number | string | Long;
    finalCltvDelta?: number;
    feeLimit?: _lnrpc_FeeLimit | null;
    ignoredNodes?: (Buffer | Uint8Array | string)[];
    ignoredEdges?: _lnrpc_EdgeLocator[];
    sourcePubKey?: string;
    useMissionControl?: boolean;
    ignoredPairs?: _lnrpc_NodePair[];
    cltvLimit?: number;
    amtMsat?: number | string | Long;
    destCustomRecords?: { [key: number]: Buffer | Uint8Array | string };
    outgoingChanId?: number | string | Long;
    lastHopPubkey?: Buffer | Uint8Array | string;
    routeHints?: _lnrpc_RouteHint[];
    destFeatures?: _lnrpc_FeatureBit[];
    timePref?: number | string;
    blindedPaymentPaths?: _lnrpc_BlindedPaymentPath[];
}

export interface QueryRoutesRequest__Output {
    pubKey: string;
    amt: string;
    finalCltvDelta: number;
    feeLimit: _lnrpc_FeeLimit__Output | null;
    ignoredNodes: Buffer[];
    ignoredEdges: _lnrpc_EdgeLocator__Output[];
    sourcePubKey: string;
    useMissionControl: boolean;
    ignoredPairs: _lnrpc_NodePair__Output[];
    cltvLimit: number;
    amtMsat: string;
    destCustomRecords: { [key: number]: Buffer };
    outgoingChanId: string;
    lastHopPubkey: Buffer;
    routeHints: _lnrpc_RouteHint__Output[];
    destFeatures: _lnrpc_FeatureBit__Output[];
    timePref: number;
    blindedPaymentPaths: _lnrpc_BlindedPaymentPath__Output[];
}
