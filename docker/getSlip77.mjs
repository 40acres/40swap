/* eslint-disable no-undef */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { SLIP77Factory } from 'slip77';
import * as crypto from 'crypto';
import * as ecc from 'tiny-secp256k1';


// Generate random slip77 key
const slip77 = SLIP77Factory(ecc);
const randomBytes = crypto.randomBytes(32);
const slip77Node = slip77.fromMasterBlindingKey(randomBytes.toString('hex'));
console.log('✅ Generated random slip77 key for confidential addresses');
console.log('🔐 Master blinding key (SLIP77):', slip77Node.masterKey.toString('hex'));
