import BIP32Factory from 'bip32';
import * as liquid from 'liquidjs-lib';
import { nbxplorerHotWallet, NbxplorerService } from './NbxplorerService';
import * as ecc from 'tiny-secp256k1';
import { Network } from 'bitcoinjs-lib';
import { varuint } from 'liquidjs-lib/src/bufferutils.js';
import { ECPairFactory, ECPairInterface } from 'ecpair';
import { FourtySwapConfiguration } from './configuration';
import { LiquidService, RPCUtxo } from './LiquidService.js';
import assert from 'node:assert';
import { SwapOut } from './entities/SwapOut';

const bip32 = BIP32Factory(ecc);
const ECPair = ECPairFactory(ecc);


export type ScriptElement = Buffer | number | string;


export const getHexString = (input: Buffer): string => {
    return input.toString('hex');
};


export const getHexBuffer = (input: string): Buffer => {
    return Buffer.from(input, 'hex');
};


export const scriptBuffersToScript = (elements: ScriptElement[]): Buffer => {
    const buffers: Buffer[] = [];
  
    elements.forEach((element) => {
        if (Buffer.isBuffer(element)) {
            buffers.push(
                Buffer.concat([
                    Buffer.from(varuint.encode(element.length).buffer),
                    element,
                ]),
            );
        } else {
            buffers.push(getHexBuffer(element.toString(16)));
        }
    });
  
    return Buffer.concat(buffers);
};


export function liquidReverseSwapScript(
    preimageHash: Buffer,
    claimPublicKey: Buffer,
    refundPublicKey: Buffer,
    timeoutBlockHeight: number,
): Buffer {
    /* eslint-disable indent */
    const htlcScript = liquid.script.compile([
        liquid.script.OPS.OP_SIZE,
        liquid.script.number.encode(32),
        liquid.script.OPS.OP_EQUAL,
        liquid.script.OPS.OP_IF,
            liquid.script.OPS.OP_HASH160,
            liquid.crypto.ripemd160(preimageHash),
            liquid.script.OPS.OP_EQUALVERIFY,
            claimPublicKey,
        liquid.script.OPS.OP_ELSE,
            liquid.script.OPS.OP_DROP,
            liquid.script.number.encode(timeoutBlockHeight),
            liquid.script.OPS.OP_CHECKLOCKTIMEVERIFY,
            liquid.script.OPS.OP_DROP,
            refundPublicKey,
        liquid.script.OPS.OP_ENDIF,
        liquid.script.OPS.OP_CHECKSIG,
    ]);
    return htlcScript;
}


export function getKeysFromHotWallet(wallet: nbxplorerHotWallet, network: Network): { 
    pubKey: Uint8Array,
    privKey: Uint8Array 
} {
    const account = bip32.fromBase58(wallet.accountHDKey, network);
    return {
        pubKey: account.publicKey,
        privKey: account.privateKey!,
    };
}


export function getLiquidNumber(amount: number): number {
    return liquid.ElementsValue.fromNumber(amount).number;
}


export function getContractVoutInfo(
    spendingTx: liquid.Transaction, contractAddress: string, network: liquid.networks.Network
): {
    contractOutputIndex: number;
    outputValue: number;
    witnessUtxo: liquid.TxOutput;
} {
    let contractOutputIndex = -1;
    let outputValue = 0;
    let witnessUtxo: liquid.TxOutput | null = null;
    
    for (let i = 0; i < spendingTx.outs.length; i++) {
        try {
            const outputScript = spendingTx.outs[i].script;
            const outputAddress = liquid.address.fromOutputScript(outputScript, network);
            if (outputAddress === contractAddress) {
                contractOutputIndex = i;
                // Convert buffer value to number if needed
                outputValue = Buffer.isBuffer(spendingTx.outs[i].value) 
                    ? Number(Buffer.from(spendingTx.outs[i].value).reverse().readBigUInt64LE(0))
                    : Number(spendingTx.outs[i].value);
                witnessUtxo = spendingTx.outs[i];
                break;
            }
        } catch (e) {
            throw new Error(`Error parsing output script: ${e}`);
        }
    }
    
    assert(contractOutputIndex !== -1, 'Contract output not found in spending transaction');
    assert(witnessUtxo != null, 'Witness utxo not found in spending transaction');

    return {
        contractOutputIndex,
        outputValue,
        witnessUtxo,
    };
}


export function getRelativePathFromDescriptor(descriptor: string): string {
    // eg input: wpkh([53b1e541/84'/1'/0'/0/12]02620eb1f212038380c0b169401d2b1ba6b440ca34b006758b921727d26fb3085c)#xac9tzr5
    // eg output: 0/12
    const match = descriptor.match(/\/\d+'\/\d+'\/\d'\/(\d+\/\d+)\]/);
    if (!match) {
        throw new Error('Invalid descriptor format');
    }
    return match[1];
}


export class PSETUtils {
    constructor(
        protected network: liquid.networks.Network,
    ) {}


    addInput(pset: liquid.Pset, txId: string, inputIndex: number,  sequence: number): void {
        const input = new liquid.CreatorInput(txId, inputIndex, sequence);
        pset.addInput(input.toPartialInput());
    }

    addOutput(
        updater: liquid.Updater, amount: number, script?: Buffer | undefined, blindingKey?: Buffer | undefined
    ): void {
        const changeOutput = new liquid.CreatorOutput(
            this.network.assetHash,
            amount,
            script ?? undefined,
            // blindingKey !== undefined ? blindingKey : undefined,
            // blindingKey !== undefined ? 0 : undefined
        );
        updater.addOutputs([changeOutput]);
    }

    signIndex(
        pset: liquid.Pset, 
        signer: liquid.Signer, 
        signingKeyPair: ECPairInterface, 
        index: number, 
        sigHashType: number = liquid.Transaction.SIGHASH_ALL
    ): Buffer {
        const signature = liquid.script.signature.encode(
            signingKeyPair.sign(pset.getInputPreimage(index, sigHashType)),
            sigHashType
        );
        signer.addSignature(
            index,
            {
                partialSig: {
                    pubkey: signingKeyPair.publicKey,
                    signature,
                },
            },
            liquid.Pset.ECDSASigValidator(ecc),
        );
        return signature;
    }

    finalizeIndexWithStack(finalizer: liquid.Finalizer, index: number, stack: Buffer[]): void {
        finalizer.finalizeInput(index, () => {
            const finalScriptWitness = liquid.witnessStackToScriptWitness(stack);
            return {finalScriptWitness};
        });
    }
}


export abstract class LiquidPSETBuilder extends PSETUtils {
    public signatures: Buffer[] = [];
    protected liquidService: LiquidService;
    protected signingKeys: ECPairInterface[] = [];

    constructor(
        protected nbxplorer: NbxplorerService,
        protected elementsConfig: FourtySwapConfiguration['elements'],
        network: liquid.networks.Network,
    ) {
        super(network);
        this.liquidService = new LiquidService(nbxplorer, elementsConfig);
    }

    abstract getPset(...args: unknown[]): Promise<liquid.Pset>;

    // TODO: get dynamic commision
    getCommissionAmount(): number {
        return 1000;
    }

    async getUtxoTx(utxo: RPCUtxo, xpub: string): Promise<liquid.Transaction> {
        // Not working on transactions from utxos not scanned by nbxplorer
        // const walletTx = await this.nbxplorer.getWalletTransaction(xpub, utxo.txid, 'lbtc'); 
        const hexTx = await this.liquidService.callRPC('getrawtransaction', [utxo.txid]);
        return liquid.Transaction.fromBuffer(Buffer.from(hexTx, 'hex'));
    }

    async addUtxosInputs(
        utxos: RPCUtxo[], pset: liquid.Pset, updater: liquid.Updater, timeoutBlockHeight?: number
    ): Promise<void> {
        await Promise.all(utxos.map(async (utxo, i) => {
            const liquidTx = await this.getUtxoTx(utxo, this.liquidService.xpub);
            const sequence = timeoutBlockHeight ? 0xffffffff : 0x00000000;
            this.addNonWitnessUtxoInput(updater, pset, liquidTx, i, utxo.vout, sequence);
        })).catch((error) => {
            throw new Error(`Error adding inputs: ${error}`);
        });
    }

    addNonWitnessUtxoInput(
        updater: liquid.Updater,
        pset: liquid.Pset, 
        tx: liquid.Transaction, 
        psetInputIndex: number, 
        inputIndex: number, 
        sequence: number,
        sigHashType: number = liquid.Transaction.SIGHASH_ALL
    ): void {
        this.addInput(pset, tx.getId(), inputIndex, sequence);
        updater.addInSighashType(psetInputIndex, sigHashType);
        updater.addInNonWitnessUtxo(psetInputIndex, tx);
    }

    addWitnessUtxoInput(
        updater: liquid.Updater,
        pset: liquid.Pset, 
        tx: liquid.Transaction, 
        psetInputIndex: number, 
        inputIndex: number, 
        sequence: number,
        witnessUtxo: liquid.TxOutput,
        lockScript: Buffer,
        sigHashType: number = liquid.Transaction.SIGHASH_ALL
    ): void {
        this.addInput(pset, tx.getId(), inputIndex, sequence);
        updater.addInSighashType(psetInputIndex, sigHashType);
        updater.addInWitnessUtxo(psetInputIndex, witnessUtxo);
        updater.addInWitnessScript(psetInputIndex, lockScript);
    }
}

export class LiquidLockPSETBuilder extends LiquidPSETBuilder {

    async finalizePset(pset: liquid.Pset): Promise<string> {
        const result = await this.liquidService.callRPC('finalizepsbt', [pset.toBase64()]);
        if (!result.complete) {
            throw new Error('PSET is not complete');
        }
        return result.hex;
    }
    
    async addRequiredOutputs(
        amount: number,
        totalInputValue: number,
        commision: number,
        updater: liquid.Updater,
        contractAddress: string,
        blindingKey?: Buffer | undefined,
    ): Promise<void> {
        // Add claim output to pset
        const claimOutputScript = liquid.address.toOutputScript(contractAddress, this.network);
        this.addOutput(updater, getLiquidNumber(amount), claimOutputScript, blindingKey);

        // Add change output to pset
        const changeAddress = await this.liquidService.callRPC('getnewaddress');
        const changeOutputScript = liquid.address.toOutputScript(changeAddress, this.network);
        const changeAmount = getLiquidNumber(totalInputValue - amount - commision);
        this.addOutput(updater, changeAmount, changeOutputScript, blindingKey);

        // Add fee output to pset
        const feeAmount = getLiquidNumber(commision);
        this.addOutput(updater, feeAmount);
    }

    async signPset(pset: liquid.Pset): Promise<liquid.Pset> {
        const psetBase64 = pset.toBase64();
        try {
            const result = await this.liquidService.callRPC('walletprocesspsbt', [psetBase64, true, 'ALL']);
            if (!result.complete) {
                throw new Error('PSET is not complete');
            }
            const processedPset = liquid.Pset.fromBase64(result.psbt);
            if (!processedPset.isComplete()) {
                throw new Error('PSET is not complete');
            }
            return processedPset;
        } catch (error) {
            console.error('Error signing PSET via RPC:', error);
            throw new Error(`Failed to sign PSET: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async getPset(
        amount: number, 
        contractAddress: string, 
        blindingKey: Buffer, 
        timeoutBlockHeight?: number
    ): Promise<liquid.Pset> {
        const commision = this.getCommissionAmount();
        const totalAmount = amount + commision;
        const { utxos, totalInputValue } = await this.liquidService.getConfirmedUtxosAndInputValueForAmount(totalAmount);

        // Create a new pset
        const pset = liquid.Creator.newPset({locktime: timeoutBlockHeight ?? 0});
        const updater = new liquid.Updater(pset);

        // Add inputs to pset
        await Promise.all(utxos.map(async (utxo, i) => {
            const liquidTx = await this.getUtxoTx(utxo, this.liquidService.xpub);
            const sequence = 0xffffffff;
            this.addInput(pset, liquidTx.getId(), utxo.vout, sequence);
            updater.addInSighashType(i, liquid.Transaction.SIGHASH_ALL);
            const witnessUtxo = liquidTx.outs[utxo.vout];
            updater.addInWitnessUtxo(i, witnessUtxo);
            const node = bip32.fromBase58(this.liquidService.xpub, this.network);
            const relativePath = getRelativePathFromDescriptor(utxo.desc);
            try {
                const childNode = node.derivePath(relativePath);
                updater.addInBIP32Derivation(i, {
                    masterFingerprint: Buffer.from(node.fingerprint),
                    pubkey: Buffer.from(childNode.publicKey),
                    path: relativePath,
                });
            } catch (error) {
                throw new Error(`Failed to derive path ${relativePath}: ${error}`);
            }
        })).catch((error) => {
            throw new Error(`Error adding inputs: ${error}`);
        });

        // Add required outputs (claim, change, fee) to pset
        await this.addRequiredOutputs(amount, totalInputValue, commision, updater, contractAddress, blindingKey);

        // Blind pset
        // await this.blindPset(utxos, pset, blindingKey);

        return pset;
    }

    async getTx(pset: liquid.Pset): Promise<liquid.Transaction> {
        const signedPset = await this.signPset(pset);
        const finalizedPset = await this.finalizePset(signedPset);
        const transaction = liquid.Transaction.fromHex(finalizedPset);
        return transaction;
    }
}

export class LiquidClaimPSETBuilder extends LiquidPSETBuilder {
    async getPset(swap: SwapOut, spendingTx: liquid.Transaction, destinationAddress: string,): Promise<liquid.Pset> {
        // Find the contract vout info
        const { contractOutputIndex, outputValue, witnessUtxo } = getContractVoutInfo(
            spendingTx, swap.contractAddress!, this.network
        );
        
        // Create a new pset
        const pset = liquid.Creator.newPset();
        const updater = new liquid.Updater(pset);
        
        // Add input - use contractOutputIndex for the vout
        const psetInputIndex = 0;
        const sequence = 0;
        const sighashType = liquid.Transaction.SIGHASH_ALL;
        this.addWitnessUtxoInput(
            updater,
            pset,
            spendingTx,
            psetInputIndex,
            contractOutputIndex,
            sequence,
            witnessUtxo,
            swap.lockScript!,
            sighashType,
        );
        
        // Calculate output amount and fee
        const feeAmount = this.getCommissionAmount();
        const outputAmount = outputValue - feeAmount;
        
        // Add output
        const outputScript = liquid.address.toOutputScript(destinationAddress, this.network);
        this.addOutput(updater, outputAmount, outputScript);
        
        // Add fee output - required for Liquid
        this.addOutput(updater, feeAmount);

        return pset;
    }
}

export class LiquidRefundPSETBuilder extends LiquidPSETBuilder {
    async getPset(swap: SwapOut, spendingTx: liquid.Transaction): Promise<liquid.Pset> {
        // Find the contract vout info
        const { contractOutputIndex, outputValue, witnessUtxo } = getContractVoutInfo(
            spendingTx, swap.contractAddress!, this.network
        );
        
        // Create a new pset
        const pset = liquid.Creator.newPset({
            locktime: swap.timeoutBlockHeight,
        });
        const updater = new liquid.Updater(pset);
        
        // Add input - use contractOutputIndex for the vout
        const psetInputIndex = 0;
        const sequence = 0xfffffffe;
        const sighashType = liquid.Transaction.SIGHASH_ALL;
        this.addWitnessUtxoInput(
            updater,
            pset,
            spendingTx,
            psetInputIndex,
            contractOutputIndex,
            sequence,
            witnessUtxo,
            swap.lockScript!,
            sighashType,
        );
        
        // Calculate output amount and fee
        const feeAmount = this.getCommissionAmount();
        const outputAmount = outputValue - feeAmount;
        
        // Add output
        const outputScript = liquid.address.toOutputScript(swap.sweepAddress!, this.network);
        this.addOutput(updater, outputAmount, outputScript);
        
        // Add fee output - required for Liquid
        this.addOutput(updater, feeAmount);

        // Sign pset inputs
        const signer = new liquid.Signer(pset);
        const signingKeyPair = ECPair.fromPrivateKey(swap.unlockPrivKey);
        const signature = this.signIndex(pset, signer, signingKeyPair, psetInputIndex, sighashType);

        // Finalize pset
        const finalizer = new liquid.Finalizer(pset);
        const stack = [signature, Buffer.from(''), pset.inputs[psetInputIndex].witnessScript!];
        this.finalizeIndexWithStack(finalizer, psetInputIndex, stack);
        return pset;
    }
}
