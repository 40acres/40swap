// Original file: src/lnd/lightning.proto

import type { InvoiceHTLCState as _lnrpc_InvoiceHTLCState, InvoiceHTLCState__Output as _lnrpc_InvoiceHTLCState__Output } from '../lnrpc/InvoiceHTLCState';
import type { Long } from '@grpc/proto-loader';

export interface AMPInvoiceState {
  'state'?: (_lnrpc_InvoiceHTLCState);
  'settleIndex'?: (number | string | Long);
  'settleTime'?: (number | string | Long);
  'amtPaidMsat'?: (number | string | Long);
}

export interface AMPInvoiceState__Output {
  'state': (_lnrpc_InvoiceHTLCState__Output);
  'settleIndex': (string);
  'settleTime': (string);
  'amtPaidMsat': (string);
}
