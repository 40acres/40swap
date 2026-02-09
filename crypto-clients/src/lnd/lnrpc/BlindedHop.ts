// Original file: src/lnd/lightning.proto


export interface BlindedHop {
  'blindedNode'?: (Buffer | Uint8Array | string);
  'encryptedData'?: (Buffer | Uint8Array | string);
}

export interface BlindedHop__Output {
  'blindedNode': (Buffer);
  'encryptedData': (Buffer);
}
