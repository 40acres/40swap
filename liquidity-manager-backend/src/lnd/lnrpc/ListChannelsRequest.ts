// Original file: src/lnd/lightning.proto


export interface ListChannelsRequest {
  'activeOnly'?: (boolean);
  'inactiveOnly'?: (boolean);
  'publicOnly'?: (boolean);
  'privateOnly'?: (boolean);
  'peer'?: (Buffer | Uint8Array | string);
  'peerAliasLookup'?: (boolean);
}

export interface ListChannelsRequest__Output {
  'activeOnly': (boolean);
  'inactiveOnly': (boolean);
  'publicOnly': (boolean);
  'privateOnly': (boolean);
  'peer': (Buffer);
  'peerAliasLookup': (boolean);
}
