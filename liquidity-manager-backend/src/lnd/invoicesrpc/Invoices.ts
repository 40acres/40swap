// Original file: src/lnd/invoices.proto

import type * as grpc from '@grpc/grpc-js'
import type { MethodDefinition } from '@grpc/proto-loader'
import type { AddHoldInvoiceRequest as _invoicesrpc_AddHoldInvoiceRequest, AddHoldInvoiceRequest__Output as _invoicesrpc_AddHoldInvoiceRequest__Output } from '../invoicesrpc/AddHoldInvoiceRequest';
import type { AddHoldInvoiceResp as _invoicesrpc_AddHoldInvoiceResp, AddHoldInvoiceResp__Output as _invoicesrpc_AddHoldInvoiceResp__Output } from '../invoicesrpc/AddHoldInvoiceResp';
import type { CancelInvoiceMsg as _invoicesrpc_CancelInvoiceMsg, CancelInvoiceMsg__Output as _invoicesrpc_CancelInvoiceMsg__Output } from '../invoicesrpc/CancelInvoiceMsg';
import type { CancelInvoiceResp as _invoicesrpc_CancelInvoiceResp, CancelInvoiceResp__Output as _invoicesrpc_CancelInvoiceResp__Output } from '../invoicesrpc/CancelInvoiceResp';
import type { Invoice as _lnrpc_Invoice, Invoice__Output as _lnrpc_Invoice__Output } from '../lnrpc/Invoice';
import type { LookupInvoiceMsg as _invoicesrpc_LookupInvoiceMsg, LookupInvoiceMsg__Output as _invoicesrpc_LookupInvoiceMsg__Output } from '../invoicesrpc/LookupInvoiceMsg';
import type { SettleInvoiceMsg as _invoicesrpc_SettleInvoiceMsg, SettleInvoiceMsg__Output as _invoicesrpc_SettleInvoiceMsg__Output } from '../invoicesrpc/SettleInvoiceMsg';
import type { SettleInvoiceResp as _invoicesrpc_SettleInvoiceResp, SettleInvoiceResp__Output as _invoicesrpc_SettleInvoiceResp__Output } from '../invoicesrpc/SettleInvoiceResp';
import type { SubscribeSingleInvoiceRequest as _invoicesrpc_SubscribeSingleInvoiceRequest, SubscribeSingleInvoiceRequest__Output as _invoicesrpc_SubscribeSingleInvoiceRequest__Output } from '../invoicesrpc/SubscribeSingleInvoiceRequest';

export interface InvoicesClient extends grpc.Client {
  AddHoldInvoice(argument: _invoicesrpc_AddHoldInvoiceRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_invoicesrpc_AddHoldInvoiceResp__Output>): grpc.ClientUnaryCall;
  AddHoldInvoice(argument: _invoicesrpc_AddHoldInvoiceRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_invoicesrpc_AddHoldInvoiceResp__Output>): grpc.ClientUnaryCall;
  AddHoldInvoice(argument: _invoicesrpc_AddHoldInvoiceRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_invoicesrpc_AddHoldInvoiceResp__Output>): grpc.ClientUnaryCall;
  AddHoldInvoice(argument: _invoicesrpc_AddHoldInvoiceRequest, callback: grpc.requestCallback<_invoicesrpc_AddHoldInvoiceResp__Output>): grpc.ClientUnaryCall;
  addHoldInvoice(argument: _invoicesrpc_AddHoldInvoiceRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_invoicesrpc_AddHoldInvoiceResp__Output>): grpc.ClientUnaryCall;
  addHoldInvoice(argument: _invoicesrpc_AddHoldInvoiceRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_invoicesrpc_AddHoldInvoiceResp__Output>): grpc.ClientUnaryCall;
  addHoldInvoice(argument: _invoicesrpc_AddHoldInvoiceRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_invoicesrpc_AddHoldInvoiceResp__Output>): grpc.ClientUnaryCall;
  addHoldInvoice(argument: _invoicesrpc_AddHoldInvoiceRequest, callback: grpc.requestCallback<_invoicesrpc_AddHoldInvoiceResp__Output>): grpc.ClientUnaryCall;
  
  CancelInvoice(argument: _invoicesrpc_CancelInvoiceMsg, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_invoicesrpc_CancelInvoiceResp__Output>): grpc.ClientUnaryCall;
  CancelInvoice(argument: _invoicesrpc_CancelInvoiceMsg, metadata: grpc.Metadata, callback: grpc.requestCallback<_invoicesrpc_CancelInvoiceResp__Output>): grpc.ClientUnaryCall;
  CancelInvoice(argument: _invoicesrpc_CancelInvoiceMsg, options: grpc.CallOptions, callback: grpc.requestCallback<_invoicesrpc_CancelInvoiceResp__Output>): grpc.ClientUnaryCall;
  CancelInvoice(argument: _invoicesrpc_CancelInvoiceMsg, callback: grpc.requestCallback<_invoicesrpc_CancelInvoiceResp__Output>): grpc.ClientUnaryCall;
  cancelInvoice(argument: _invoicesrpc_CancelInvoiceMsg, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_invoicesrpc_CancelInvoiceResp__Output>): grpc.ClientUnaryCall;
  cancelInvoice(argument: _invoicesrpc_CancelInvoiceMsg, metadata: grpc.Metadata, callback: grpc.requestCallback<_invoicesrpc_CancelInvoiceResp__Output>): grpc.ClientUnaryCall;
  cancelInvoice(argument: _invoicesrpc_CancelInvoiceMsg, options: grpc.CallOptions, callback: grpc.requestCallback<_invoicesrpc_CancelInvoiceResp__Output>): grpc.ClientUnaryCall;
  cancelInvoice(argument: _invoicesrpc_CancelInvoiceMsg, callback: grpc.requestCallback<_invoicesrpc_CancelInvoiceResp__Output>): grpc.ClientUnaryCall;
  
  LookupInvoiceV2(argument: _invoicesrpc_LookupInvoiceMsg, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_lnrpc_Invoice__Output>): grpc.ClientUnaryCall;
  LookupInvoiceV2(argument: _invoicesrpc_LookupInvoiceMsg, metadata: grpc.Metadata, callback: grpc.requestCallback<_lnrpc_Invoice__Output>): grpc.ClientUnaryCall;
  LookupInvoiceV2(argument: _invoicesrpc_LookupInvoiceMsg, options: grpc.CallOptions, callback: grpc.requestCallback<_lnrpc_Invoice__Output>): grpc.ClientUnaryCall;
  LookupInvoiceV2(argument: _invoicesrpc_LookupInvoiceMsg, callback: grpc.requestCallback<_lnrpc_Invoice__Output>): grpc.ClientUnaryCall;
  lookupInvoiceV2(argument: _invoicesrpc_LookupInvoiceMsg, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_lnrpc_Invoice__Output>): grpc.ClientUnaryCall;
  lookupInvoiceV2(argument: _invoicesrpc_LookupInvoiceMsg, metadata: grpc.Metadata, callback: grpc.requestCallback<_lnrpc_Invoice__Output>): grpc.ClientUnaryCall;
  lookupInvoiceV2(argument: _invoicesrpc_LookupInvoiceMsg, options: grpc.CallOptions, callback: grpc.requestCallback<_lnrpc_Invoice__Output>): grpc.ClientUnaryCall;
  lookupInvoiceV2(argument: _invoicesrpc_LookupInvoiceMsg, callback: grpc.requestCallback<_lnrpc_Invoice__Output>): grpc.ClientUnaryCall;
  
  SettleInvoice(argument: _invoicesrpc_SettleInvoiceMsg, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_invoicesrpc_SettleInvoiceResp__Output>): grpc.ClientUnaryCall;
  SettleInvoice(argument: _invoicesrpc_SettleInvoiceMsg, metadata: grpc.Metadata, callback: grpc.requestCallback<_invoicesrpc_SettleInvoiceResp__Output>): grpc.ClientUnaryCall;
  SettleInvoice(argument: _invoicesrpc_SettleInvoiceMsg, options: grpc.CallOptions, callback: grpc.requestCallback<_invoicesrpc_SettleInvoiceResp__Output>): grpc.ClientUnaryCall;
  SettleInvoice(argument: _invoicesrpc_SettleInvoiceMsg, callback: grpc.requestCallback<_invoicesrpc_SettleInvoiceResp__Output>): grpc.ClientUnaryCall;
  settleInvoice(argument: _invoicesrpc_SettleInvoiceMsg, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_invoicesrpc_SettleInvoiceResp__Output>): grpc.ClientUnaryCall;
  settleInvoice(argument: _invoicesrpc_SettleInvoiceMsg, metadata: grpc.Metadata, callback: grpc.requestCallback<_invoicesrpc_SettleInvoiceResp__Output>): grpc.ClientUnaryCall;
  settleInvoice(argument: _invoicesrpc_SettleInvoiceMsg, options: grpc.CallOptions, callback: grpc.requestCallback<_invoicesrpc_SettleInvoiceResp__Output>): grpc.ClientUnaryCall;
  settleInvoice(argument: _invoicesrpc_SettleInvoiceMsg, callback: grpc.requestCallback<_invoicesrpc_SettleInvoiceResp__Output>): grpc.ClientUnaryCall;
  
  SubscribeSingleInvoice(argument: _invoicesrpc_SubscribeSingleInvoiceRequest, metadata: grpc.Metadata, options?: grpc.CallOptions): grpc.ClientReadableStream<_lnrpc_Invoice__Output>;
  SubscribeSingleInvoice(argument: _invoicesrpc_SubscribeSingleInvoiceRequest, options?: grpc.CallOptions): grpc.ClientReadableStream<_lnrpc_Invoice__Output>;
  subscribeSingleInvoice(argument: _invoicesrpc_SubscribeSingleInvoiceRequest, metadata: grpc.Metadata, options?: grpc.CallOptions): grpc.ClientReadableStream<_lnrpc_Invoice__Output>;
  subscribeSingleInvoice(argument: _invoicesrpc_SubscribeSingleInvoiceRequest, options?: grpc.CallOptions): grpc.ClientReadableStream<_lnrpc_Invoice__Output>;
  
}

export interface InvoicesHandlers extends grpc.UntypedServiceImplementation {
  AddHoldInvoice: grpc.handleUnaryCall<_invoicesrpc_AddHoldInvoiceRequest__Output, _invoicesrpc_AddHoldInvoiceResp>;
  
  CancelInvoice: grpc.handleUnaryCall<_invoicesrpc_CancelInvoiceMsg__Output, _invoicesrpc_CancelInvoiceResp>;
  
  LookupInvoiceV2: grpc.handleUnaryCall<_invoicesrpc_LookupInvoiceMsg__Output, _lnrpc_Invoice>;
  
  SettleInvoice: grpc.handleUnaryCall<_invoicesrpc_SettleInvoiceMsg__Output, _invoicesrpc_SettleInvoiceResp>;
  
  SubscribeSingleInvoice: grpc.handleServerStreamingCall<_invoicesrpc_SubscribeSingleInvoiceRequest__Output, _lnrpc_Invoice>;
  
}

export interface InvoicesDefinition extends grpc.ServiceDefinition {
  AddHoldInvoice: MethodDefinition<_invoicesrpc_AddHoldInvoiceRequest, _invoicesrpc_AddHoldInvoiceResp, _invoicesrpc_AddHoldInvoiceRequest__Output, _invoicesrpc_AddHoldInvoiceResp__Output>
  CancelInvoice: MethodDefinition<_invoicesrpc_CancelInvoiceMsg, _invoicesrpc_CancelInvoiceResp, _invoicesrpc_CancelInvoiceMsg__Output, _invoicesrpc_CancelInvoiceResp__Output>
  LookupInvoiceV2: MethodDefinition<_invoicesrpc_LookupInvoiceMsg, _lnrpc_Invoice, _invoicesrpc_LookupInvoiceMsg__Output, _lnrpc_Invoice__Output>
  SettleInvoice: MethodDefinition<_invoicesrpc_SettleInvoiceMsg, _invoicesrpc_SettleInvoiceResp, _invoicesrpc_SettleInvoiceMsg__Output, _invoicesrpc_SettleInvoiceResp__Output>
  SubscribeSingleInvoice: MethodDefinition<_invoicesrpc_SubscribeSingleInvoiceRequest, _lnrpc_Invoice, _invoicesrpc_SubscribeSingleInvoiceRequest__Output, _lnrpc_Invoice__Output>
}
