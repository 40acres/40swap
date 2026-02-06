// Original file: src/lnd/lightning.proto

import type { HTLC as _lnrpc_HTLC, HTLC__Output as _lnrpc_HTLC__Output } from '../lnrpc/HTLC';
import type { CommitmentType as _lnrpc_CommitmentType, CommitmentType__Output as _lnrpc_CommitmentType__Output } from '../lnrpc/CommitmentType';
import type { ChannelConstraints as _lnrpc_ChannelConstraints, ChannelConstraints__Output as _lnrpc_ChannelConstraints__Output } from '../lnrpc/ChannelConstraints';
import type { Long } from '@grpc/proto-loader';

export interface Channel {
  'active'?: (boolean);
  'remotePubkey'?: (string);
  'channelPoint'?: (string);
  'chanId'?: (number | string | Long);
  'capacity'?: (number | string | Long);
  'localBalance'?: (number | string | Long);
  'remoteBalance'?: (number | string | Long);
  'commitFee'?: (number | string | Long);
  'commitWeight'?: (number | string | Long);
  'feePerKw'?: (number | string | Long);
  'unsettledBalance'?: (number | string | Long);
  'totalSatoshisSent'?: (number | string | Long);
  'totalSatoshisReceived'?: (number | string | Long);
  'numUpdates'?: (number | string | Long);
  'pendingHtlcs'?: (_lnrpc_HTLC)[];
  'csvDelay'?: (number);
  'private'?: (boolean);
  'initiator'?: (boolean);
  'chanStatusFlags'?: (string);
  'localChanReserveSat'?: (number | string | Long);
  'remoteChanReserveSat'?: (number | string | Long);
  'staticRemoteKey'?: (boolean);
  'lifetime'?: (number | string | Long);
  'uptime'?: (number | string | Long);
  'closeAddress'?: (string);
  'commitmentType'?: (_lnrpc_CommitmentType);
  'pushAmountSat'?: (number | string | Long);
  'thawHeight'?: (number);
  'localConstraints'?: (_lnrpc_ChannelConstraints | null);
  'remoteConstraints'?: (_lnrpc_ChannelConstraints | null);
  'aliasScids'?: (number | string | Long)[];
  'zeroConf'?: (boolean);
  'zeroConfConfirmedScid'?: (number | string | Long);
  'peerAlias'?: (string);
  'peerScidAlias'?: (number | string | Long);
  'memo'?: (string);
}

export interface Channel__Output {
  'active': (boolean);
  'remotePubkey': (string);
  'channelPoint': (string);
  'chanId': (string);
  'capacity': (string);
  'localBalance': (string);
  'remoteBalance': (string);
  'commitFee': (string);
  'commitWeight': (string);
  'feePerKw': (string);
  'unsettledBalance': (string);
  'totalSatoshisSent': (string);
  'totalSatoshisReceived': (string);
  'numUpdates': (string);
  'pendingHtlcs': (_lnrpc_HTLC__Output)[];
  'csvDelay': (number);
  'private': (boolean);
  'initiator': (boolean);
  'chanStatusFlags': (string);
  'localChanReserveSat': (string);
  'remoteChanReserveSat': (string);
  'staticRemoteKey': (boolean);
  'lifetime': (string);
  'uptime': (string);
  'closeAddress': (string);
  'commitmentType': (_lnrpc_CommitmentType__Output);
  'pushAmountSat': (string);
  'thawHeight': (number);
  'localConstraints': (_lnrpc_ChannelConstraints__Output | null);
  'remoteConstraints': (_lnrpc_ChannelConstraints__Output | null);
  'aliasScids': (string)[];
  'zeroConf': (boolean);
  'zeroConfConfirmedScid': (string);
  'peerAlias': (string);
  'peerScidAlias': (string);
  'memo': (string);
}
