// Original file: src/lnd/lightning.proto


export interface FundingPsbtVerify {
  'fundedPsbt'?: (Buffer | Uint8Array | string);
  'pendingChanId'?: (Buffer | Uint8Array | string);
  'skipFinalize'?: (boolean);
}

export interface FundingPsbtVerify__Output {
  'fundedPsbt': (Buffer);
  'pendingChanId': (Buffer);
  'skipFinalize': (boolean);
}
