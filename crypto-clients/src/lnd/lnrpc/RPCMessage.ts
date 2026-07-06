// Original file: src/lnd/lightning.proto


export interface RPCMessage {
  'methodFullUri'?: (string);
  'streamRpc'?: (boolean);
  'typeName'?: (string);
  'serialized'?: (Buffer | Uint8Array | string);
  'isError'?: (boolean);
}

export interface RPCMessage__Output {
  'methodFullUri': (string);
  'streamRpc': (boolean);
  'typeName': (string);
  'serialized': (Buffer);
  'isError': (boolean);
}
