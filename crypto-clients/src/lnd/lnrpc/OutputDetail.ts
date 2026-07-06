// Original file: src/lnd/lightning.proto

import type { OutputScriptType as _lnrpc_OutputScriptType, OutputScriptType__Output as _lnrpc_OutputScriptType__Output } from '../lnrpc/OutputScriptType';
import type { Long } from '@grpc/proto-loader';

export interface OutputDetail {
  'outputType'?: (_lnrpc_OutputScriptType);
  'address'?: (string);
  'pkScript'?: (string);
  'outputIndex'?: (number | string | Long);
  'amount'?: (number | string | Long);
  'isOurAddress'?: (boolean);
}

export interface OutputDetail__Output {
  'outputType': (_lnrpc_OutputScriptType__Output);
  'address': (string);
  'pkScript': (string);
  'outputIndex': (string);
  'amount': (string);
  'isOurAddress': (boolean);
}
