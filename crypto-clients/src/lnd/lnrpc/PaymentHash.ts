// Original file: src/lnd/lightning.proto


export interface PaymentHash {
  'rHashStr'?: (string);
  'rHash'?: (Buffer | Uint8Array | string);
}

export interface PaymentHash__Output {
  'rHashStr': (string);
  'rHash': (Buffer);
}
