// Original file: src/lnd/lightning.proto

import type { MiddlewareRegistration as _lnrpc_MiddlewareRegistration, MiddlewareRegistration__Output as _lnrpc_MiddlewareRegistration__Output } from '../lnrpc/MiddlewareRegistration';
import type { InterceptFeedback as _lnrpc_InterceptFeedback, InterceptFeedback__Output as _lnrpc_InterceptFeedback__Output } from '../lnrpc/InterceptFeedback';
import type { Long } from '@grpc/proto-loader';

export interface RPCMiddlewareResponse {
  'refMsgId'?: (number | string | Long);
  'register'?: (_lnrpc_MiddlewareRegistration | null);
  'feedback'?: (_lnrpc_InterceptFeedback | null);
  'middlewareMessage'?: "register"|"feedback";
}

export interface RPCMiddlewareResponse__Output {
  'refMsgId': (string);
  'register'?: (_lnrpc_MiddlewareRegistration__Output | null);
  'feedback'?: (_lnrpc_InterceptFeedback__Output | null);
  'middlewareMessage': "register"|"feedback";
}
