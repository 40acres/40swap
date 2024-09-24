// Original file: src/lnd/invoices.proto

import type { RouteHint as _lnrpc_RouteHint, RouteHint__Output as _lnrpc_RouteHint__Output } from '../lnrpc/RouteHint';
import type { Long } from '@grpc/proto-loader';

export interface AddHoldInvoiceRequest {
  'memo'?: (string);
  'hash'?: (Buffer | Uint8Array | string);
  'value'?: (number | string | Long);
  'descriptionHash'?: (Buffer | Uint8Array | string);
  'expiry'?: (number | string | Long);
  'fallbackAddr'?: (string);
  'cltvExpiry'?: (number | string | Long);
  'routeHints'?: (_lnrpc_RouteHint)[];
  'private'?: (boolean);
  'valueMsat'?: (number | string | Long);
}

export interface AddHoldInvoiceRequest__Output {
  'memo': (string);
  'hash': (Buffer);
  'value': (string);
  'descriptionHash': (Buffer);
  'expiry': (string);
  'fallbackAddr': (string);
  'cltvExpiry': (string);
  'routeHints': (_lnrpc_RouteHint__Output)[];
  'private': (boolean);
  'valueMsat': (string);
}
