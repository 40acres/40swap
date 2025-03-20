import BIP32Factory from 'bip32';
import * as liquid from 'liquidjs-lib';
import { nbxplorerHotWallet, NbxplorerService, NBXplorerUtxo } from './NbxplorerService';
import * as ecc from 'tiny-secp256k1';
import { Network } from 'bitcoinjs-lib';
import { varuint } from 'liquidjs-lib/src/bufferutils.js';
import { ECPairFactory, ECPairInterface } from 'ecpair';
import { FourtySwapConfiguration } from './configuration';
import { LiquidService } from './LiquidService.js';
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


export abstract class LiquidPSETBuilder {
    public signatures: Buffer[] = [];
    protected liquidService: LiquidService;
    protected signingKeys: ECPairInterface[] = [];
    protected network: liquid.networks.Network;

    constructor(
        protected nbxplorer: NbxplorerService,
        protected elementsConfig: FourtySwapConfiguration['elements'],
        network: liquid.networks.Network,
    ) {
        this.network = network;
        this.liquidService = new LiquidService(nbxplorer, elementsConfig);
    }

    // TODO: get dynamic commision
    getCommissionAmount(): number {
        return 1000;
    }

    abstract getTx(...args: unknown[]): Promise<liquid.Transaction>;

    async getUtxoTx(utxo: NBXplorerUtxo, xpub: string): Promise<liquid.Transaction> {
        const walletTx = await this.nbxplorer.getWalletTransaction(xpub, utxo.transactionHash, 'lbtc');
        return liquid.Transaction.fromBuffer(Buffer.from(walletTx.transaction, 'hex'));
    }

    async addUtxosInputs(
        utxos: NBXplorerUtxo[], pset: liquid.Pset, updater: liquid.Updater, timeoutBlockHeight?: number
    ): Promise<void> {
        await Promise.all(utxos.map(async (utxo, i) => {
            const liquidTx = await this.getUtxoTx(utxo, this.liquidService.xpub);
            const sequence = timeoutBlockHeight ? 0xffffffff : 0x00000000;
            this.addNonWitnessUtxoInput(updater, pset, liquidTx, i, utxo.index, sequence);
        })).catch((error) => {
            throw new Error(`Error adding inputs: ${error}`);
        });
    }

    addInput(pset: liquid.Pset, txId: string, inputIndex: number,  sequence: number): void {
        const input = new liquid.CreatorInput(txId, inputIndex, sequence);
        pset.addInput(input.toPartialInput());
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
        const changeAddress = await this.nbxplorer.getUnusedAddress(this.liquidService.xpub, 'lbtc', { change: true });
        const changeOutputScript = liquid.address.toOutputScript(changeAddress.address, this.network);
        const changeAmount = getLiquidNumber(totalInputValue - amount - commision);
        this.addOutput(updater, changeAmount, changeOutputScript, blindingKey);

        // Add fee output to pset
        const feeAmount = getLiquidNumber(commision);
        this.addOutput(updater, feeAmount);
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

    /**
     * Signs inputs using a remote wallet via RPC
     * @param utxos The UTXOs to sign
     * @param pset The PSET to sign
     * @param signer The signer instance
     */
    async signInputs(utxos: NBXplorerUtxo[], pset: liquid.Pset, signer: liquid.Signer): Promise<liquid.Pset> {
        if (utxos.length === 0) return pset;
        
        // Convert PSET to base64 for RPC
        const psetBase64 = pset.toBase64();
        
        try {
            // Call the wallet's RPC to process the PSET
            // You'll need to implement this RPC client method
            const result = await this.liquidService.callCustomRPC('walletprocesspsbt', [
                psetBase64,
                true,  // "sign" parameter
                'ALL',  // sighash type - ensure it matches what's in the PSBT
            ]);
            
            // Parse the processed PSET from the RPC response
            const processedPset = liquid.Pset.fromBase64(result.psbt);
            
            // Extract signatures from processed PSET and apply them to our working PSET
            for (let i = 0; i < utxos.length; i++) {
                // Get the processed input at index i
                const processedInput = processedPset.inputs[i];
                
                // If there's a partial signature, add it to our working PSET
                if (processedInput.partialSigs && processedInput.partialSigs.length > 0) {
                    for (const partialSig of processedInput.partialSigs) {
                        signer.addSignature(
                            i,
                            {
                                partialSig: {
                                    pubkey: partialSig.pubkey,
                                    signature: partialSig.signature,
                                },
                            },
                            liquid.Pset.ECDSASigValidator(ecc)
                        );
                        
                        // Store signature for later use in finalizing
                        this.signatures.push(partialSig.signature);
                        
                        // Since we don't have the actual key pairs, we can create a 
                        // placeholder ECPair with just the public key for finalizing
                        this.signingKeys.push(ECPair.fromPublicKey(partialSig.pubkey));
                    }
                }
            }

            return processedPset;
        } catch (error) {
            console.error('Error signing PSET via RPC:', error);
            throw new Error(`Failed to sign PSET: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    signInputsWithXPriv(xpriv: string, utxos: NBXplorerUtxo[], pset: liquid.Pset, signer: liquid.Signer): void {
        for (let i = 0; i < utxos.length; i++) {
            const utxo = utxos[i];
            const node = bip32.fromBase58(xpriv, this.network);
            const child = node.derivePath(utxo.keyPath);
            const signingKeyPair = ECPair.fromPrivateKey(Buffer.from(child.privateKey!));
            this.signInput(pset, signer, signingKeyPair, i);
        }
    }

    signInput(
        pset: liquid.Pset, 
        signer: liquid.Signer, 
        signingKeyPair: ECPairInterface, 
        index: number, 
        sigHashType: number = liquid.Transaction.SIGHASH_ALL
    ): void {
        const signature = liquid.script.signature.encode(
            signingKeyPair.sign(pset.getInputPreimage(index, sigHashType)),
            liquid.Transaction.SIGHASH_ALL,
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
        this.signatures.push(signature);
        this.signingKeys.push(signingKeyPair);
    }

    async finalizePset(pset: liquid.Pset): Promise<liquid.Pset> {
        const result = await this.liquidService.callCustomRPC('finalizepsbt', [pset.toBase64()]);
        return liquid.Pset.fromBase64(result.psbt);
    }

    finalizePsetWithUtxos(utxos: NBXplorerUtxo[], finalizer: liquid.Finalizer): void {
        for (let i = 0; i < utxos.length; i++) {
            this.finalizePsetWithStack(finalizer, i, [
                this.signatures[i],
                this.signingKeys[i].publicKey,
            ]);
        }
    }

    finalizePsetWithStack(finalizer: liquid.Finalizer, index: number, stack: Buffer[]): void {
        finalizer.finalizeInput(index, () => {
            const finalScriptWitness = liquid.witnessStackToScriptWitness(stack);
            return {finalScriptWitness};
        });
    }
}

export class LiquidLockPSETBuilder extends LiquidPSETBuilder {
    async getTx(
        amount: number, 
        contractAddress: string, 
        blindingKey: Buffer, 
        timeoutBlockHeight?: number
    ): Promise<liquid.Transaction> {
        const commision = this.getCommissionAmount();
        const totalAmount = amount + commision;
        const { utxos, totalInputValue } = await this.liquidService.getConfirmedUtxosAndInputValueForAmount(totalAmount);

        // Create a new pset
        const pset = liquid.Creator.newPset({locktime: timeoutBlockHeight ?? 0});
        const updater = new liquid.Updater(pset);

        // Add inputs to pset and sign them
        await this.addUtxosInputs(utxos, pset, updater, timeoutBlockHeight);

        // Add required outputs (claim, change, fee) to pset
        await this.addRequiredOutputs(amount, totalInputValue, commision, updater, contractAddress, blindingKey);

        // Blind pset
        // await this.blindPset(utxos, pset, blindingKey);

        // Sign pset inputs
        const signer = new liquid.Signer(pset);
        const signedPset = await this.signInputs(utxos, pset, signer);

        // Finalize pset
        const finalizedPset = await this.finalizePset(signedPset);

        // Extract transaction from pset and return it
        const transaction = liquid.Extractor.extract(finalizedPset);
        return transaction;
    }
}

export class LiquidClaimPSETBuilder extends LiquidPSETBuilder {
    async getTx(
        swap: SwapOut,
        spendingTx: liquid.Transaction, 
        privKey: string, 
        destinationAddress: string, 
        preImage: string
    ): Promise<liquid.Transaction> {
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
        this.addWitnessUtxoInput(
            updater,
            pset,
            spendingTx,
            psetInputIndex,
            contractOutputIndex,
            sequence,
            witnessUtxo,
            swap.lockScript!,
            liquid.Transaction.SIGHASH_ALL,
        );
        
        // Calculate output amount and fee
        const feeAmount = this.getCommissionAmount();
        const outputAmount = outputValue - feeAmount;
        
        // Add output
        const outputScript = liquid.address.toOutputScript(destinationAddress, this.network);
        this.addOutput(updater, outputAmount, outputScript);
        
        // Add fee output - required for Liquid
        this.addOutput(updater, feeAmount);
        
        // Sign input
        const signer = new liquid.Signer(pset);
        const keyPair = ECPair.fromWIF(privKey, this.network);
        this.signInput(pset, signer, keyPair, psetInputIndex, liquid.Transaction.SIGHASH_ALL);
        
        // Finalize input
        const finalizer = new liquid.Finalizer(pset);
        this.finalizePsetWithStack(finalizer, psetInputIndex, [
            this.signatures[0],
            Buffer.from(preImage, 'hex'),
            swap.lockScript!,
        ]);
        
        // Extract transaction
        const transaction = liquid.Extractor.extract(pset);
        return transaction;
    }
}
