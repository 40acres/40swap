// Original file: src/lnd/lightning.proto


export interface ListUnspentRequest {
  'minConfs'?: (number);
  'maxConfs'?: (number);
  'account'?: (string);
}

export interface ListUnspentRequest__Output {
  'minConfs': (number);
  'maxConfs': (number);
  'account': (string);
}
