// Original file: src/lnd/lightning.proto


export interface GetTransactionsRequest {
  'startHeight'?: (number);
  'endHeight'?: (number);
  'account'?: (string);
}

export interface GetTransactionsRequest__Output {
  'startHeight': (number);
  'endHeight': (number);
  'account': (string);
}
