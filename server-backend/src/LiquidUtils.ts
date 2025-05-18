import { LiquidService, RPCUtxo } from './LiquidService.js';
import { FourtySwapConfiguration } from './configuration';
import { ECPairFactory, ECPairInterface } from 'ecpair';
import { NbxplorerService } from './NbxplorerService';
import { SwapOut } from './entities/SwapOut';
import * as liquid from 'liquidjs-lib';
import * as ecc from 'tiny-secp256k1';
import assert from 'node:assert';
import BIP32Factory from 'bip32';
import Decimal from 'decimal.js';
import { SwapIn } from './entities/SwapIn.js';
import { blindPset as sharedBlindPset } from '@40swap/shared';
import secp256k1Module from '@vulpemventures/secp256k1-zkp';



const bip32 = BIP32Factory(ecc);
const ECPair = ECPairFactory(ecc);

export function getLiquidNumber(amount: number): number {
    return liquid.ElementsValue.fromNumber(amount).number;
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

export async function getLiquidCltvExpiry(nbxplorer: NbxplorerService, cltvExpiry: number): Promise<number> {
    const ratio = 10; // Each bitcoin block is worth 10 liquid blocks (10min - 1min)
    const currentLiquidHeight = (await nbxplorer.getNetworkStatus('lbtc')).chainHeight;
    const currentBitcoinHeight = (await nbxplorer.getNetworkStatus()).chainHeight;
    assert(cltvExpiry > currentBitcoinHeight, `invoiceExpiry=${cltvExpiry} is not greater than currentBitcoinHeight=${currentBitcoinHeight}`);
    return currentLiquidHeight + ((cltvExpiry-currentBitcoinHeight)*ratio);
}

export async function getLiquidBlockHeight(btcBlockHeight: number, nbxplorer: NbxplorerService): Promise<number> {
    // Each Bitcoin block is worth 10 Liquid blocks (10min - 1min)
    const ratio = 10;
    const currentLiquidHeight = (await nbxplorer.getNetworkStatus('lbtc')).chainHeight;
    const currentBitcoinHeight = (await nbxplorer.getNetworkStatus()).chainHeight;
    // Calculate the offset from the current Bitcoin height, then apply the ratio
    return currentLiquidHeight + ((btcBlockHeight - currentBitcoinHeight) * ratio);
}

export async function getBitcoinBlockHeightFromLiquidValue(liquidBlockHeight: number, nbxplorer: NbxplorerService): Promise<number> {
    // Each Bitcoin block is worth 10 Liquid blocks (10min - 1min)
    const ratio = 10;
    const currentLiquidHeight = (await nbxplorer.getNetworkStatus('lbtc')).chainHeight;
    const currentBitcoinHeight = (await nbxplorer.getNetworkStatus()).chainHeight;
    return currentBitcoinHeight + ((liquidBlockHeight - currentLiquidHeight) / ratio);
}

export abstract class LiquidPSETBuilder {
    public signatures: Buffer[] = [];
    protected liquidService: LiquidService;
    protected signingKeys: ECPairInterface[] = [];
    protected network: liquid.networks.Network;

    public readonly lockSequence = 0xffffffff;
    public readonly refundSequence = 0xfffffffe;
    public readonly claimSequence = 0;

    constructor(
        protected nbxplorer: NbxplorerService,
        protected elementsConfig: FourtySwapConfiguration['elements'],
        network: liquid.networks.Network,
    ) {
        this.network = network;
        this.liquidService = new LiquidService(nbxplorer, elementsConfig);
    }

    abstract getPset(...args: unknown[]): Promise<liquid.Pset>;

    async getCommissionAmount(pset: liquid.Pset | undefined = undefined): Promise<number> {
        const txVBytes = pset ? pset.unsignedTx().virtualSize() : 1;
        const mempoolInfo = await this.liquidService.getMempoolInfo();
        return Math.ceil(txVBytes * mempoolInfo.minrelaytxfee * 1e8);
    }

    addInput(pset: liquid.Pset, txId: string, inputIndex: number,  sequence: number): void {
        const input = new liquid.CreatorInput(txId, inputIndex, sequence);
        pset.addInput(input.toPartialInput());
    }

    addOutput(
        updater: liquid.Updater, 
        amount: number, 
        script?: Buffer | undefined, 
        blindingKey?: Buffer | undefined,
        blinderIndex?: number | undefined
    ): void {
        const output = new liquid.CreatorOutput(
            this.network.assetHash,
            amount,
            script ?? undefined,
            blindingKey,
            blinderIndex
        );
        updater.addOutputs([output]);
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

    async getContractVoutInfo(
        spendingTx: liquid.Transaction, contractAddress: string, network: liquid.networks.Network, blindingPrivKey: Buffer
    ): Promise<{
        contractOutputIndex: number;
        outputValue: number;
        witnessUtxo: liquid.TxOutput;
    }> {
        let outputValue = 0;
        let contractOutputIndex = -1;
        let witnessUtxo: liquid.TxOutput | null = null;
        
        for (let i = 0; i < spendingTx.outs.length; i++) {
            try {
                const secp = await (secp256k1Module as unknown as { default: () => Promise<liquid.Secp256k1Interface> }).default();
                const confidential = new liquid.confidential.Confidential(secp);
                const outputScript = spendingTx.outs[i].script;
                const outputAddress = liquid.address.fromOutputScript(outputScript, network);
                if (outputAddress === liquid.address.fromConfidential(contractAddress).unconfidentialAddress) {
                    contractOutputIndex = i;
                    outputValue = Number(confidential.unblindOutputWithKey(spendingTx.outs[i], blindingPrivKey).value);
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

    async blindPset(pset: liquid.Pset, utxosKeys: {
        blindingPrivateKey: Buffer;
    }[]): Promise<void> {
        return sharedBlindPset(pset, utxosKeys);
    }
}

export class LiquidLockPSETBuilder extends LiquidPSETBuilder {

    async getPset(
        amount: number, 
        contractAddress: string, 
        blindingKey: Buffer, 
        timeoutBlockHeight: number
    ): Promise<liquid.Pset> {
        const commision = await this.getCommissionAmount();
        const totalAmount = amount + commision;
        const amountInFloat = new Decimal(totalAmount).div(1e8);
        const { utxos, totalInputValue } = await this.liquidService.getConfirmedUtxosAndInputValueForAmount(amountInFloat);

        // Create a new pset
        const pset = liquid.Creator.newPset({locktime: timeoutBlockHeight});
        const updater = new liquid.Updater(pset);

        // Add inputs to pset
        await this.addInputs(utxos, pset, updater);

        // Add required outputs (claim, change, fee) to pset
        await this.addRequiredOutputs(amount, totalInputValue, commision, updater, contractAddress, blindingKey);

        // TODO: Blind pset
        // await this.blindPset(utxos, pset, blindingKey);

        return pset;
    }

    async addInputs(utxos: RPCUtxo[], pset: liquid.Pset, updater: liquid.Updater): Promise<void> {
        await Promise.all(utxos.map(async (utxo, i) => {
            const liquidTx = await this.liquidService.getUtxoTx(utxo, this.liquidService.xpub);
            const witnessUtxo = liquidTx.outs[utxo.vout];
            this.addInput(pset, liquidTx.getId(), utxo.vout, this.lockSequence);
            updater.addInSighashType(i, liquid.Transaction.SIGHASH_ALL);
            updater.addInWitnessUtxo(i, witnessUtxo);
            const relativePath = getRelativePathFromDescriptor(utxo.desc);
            try {
                const node = bip32.fromBase58(this.liquidService.xpub, this.network);
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
        const changeAddress = await this.liquidService.getNewAddress();
        const changeOutputScript = liquid.address.toOutputScript(changeAddress, this.network);
        const changeAmount = getLiquidNumber(totalInputValue - amount - commision);
        this.addOutput(updater, changeAmount, changeOutputScript, blindingKey);

        // Add fee output to pset
        const feeAmount = getLiquidNumber(commision);
        this.addOutput(updater, feeAmount);
    }

    async getTx(pset: liquid.Pset): Promise<liquid.Transaction> {
        const signedPset = await this.liquidService.signPset(pset.toBase64());
        const finalizedPsetHex = await this.liquidService.getFinalizedPsetHex(signedPset.toBase64());
        const transaction = liquid.Transaction.fromHex(finalizedPsetHex);
        return transaction;
    }
}

export class LiquidClaimPSETBuilder extends LiquidPSETBuilder {
    async getPset(swap: SwapOut | SwapIn, spendingTx: liquid.Transaction, destinationAddress: string,): Promise<liquid.Pset> {
        // Find the contract vout info
        const { contractOutputIndex, outputValue, witnessUtxo } = await this.getContractVoutInfo(
            spendingTx, swap.contractAddress!, this.network, swap.unlockPrivKey!
        );
        
        // Create a new pset
        const pset = liquid.Creator.newPset();
        const updater = new liquid.Updater(pset);
        
        // Add input - use contractOutputIndex for the vout
        const psetInputIndex = 0;
        this.addInput(pset, spendingTx.getId(), contractOutputIndex, this.claimSequence);
        updater.addInSighashType(psetInputIndex, liquid.Transaction.SIGHASH_ALL);
        updater.addInWitnessUtxo(psetInputIndex, witnessUtxo);
        updater.addInWitnessScript(psetInputIndex, swap.lockScript!);
        
        // Add emulated outputs to be able to know the virtual size
        const dummyFee = 0;
        const outputBlinderIndex = 0;
        const outputScript = liquid.address.toOutputScript(destinationAddress, this.network);
        const blindingPublicKey = ECPair.fromPrivateKey(swap.unlockPrivKey).publicKey;
        this.addOutput(updater, outputValue, outputScript, blindingPublicKey, outputBlinderIndex);        
        this.addOutput(updater, dummyFee);

        // Update the pset to remove the emulated outputs and add the real outputs
        updater.pset.outputs = [];
        const feeAmount = await this.getCommissionAmount(pset);
        const outputAmount = outputValue - feeAmount;
        this.addOutput(updater, outputAmount, outputScript, blindingPublicKey, outputBlinderIndex);        
        this.addOutput(updater, feeAmount);

        // Blinding pset
        const utxosKeys = [{blindingPrivateKey: swap.unlockPrivKey!}];
        await this.blindPset(pset, utxosKeys);

        return pset;
    }
}

export class LiquidRefundPSETBuilder extends LiquidPSETBuilder {

    async getPset(swap: SwapOut | SwapIn, spendingTx: liquid.Transaction, outputAddress: string | null = null): Promise<liquid.Pset> {
        // Find the contract vout info
        const { contractOutputIndex, outputValue, witnessUtxo } = await this.getContractVoutInfo(
            spendingTx, swap.contractAddress!, this.network, swap.unlockPrivKey!
        );
        
        // Create a new pset
        const pset = liquid.Creator.newPset({
            locktime: swap.timeoutBlockHeight,
        });
        const updater = new liquid.Updater(pset);
        const psetInputIndex = 0;
        
        // Add input
        this.addRefundInput(pset, updater, psetInputIndex, spendingTx, contractOutputIndex, witnessUtxo, swap);

        // Add required outputs
        await this.addRequiredOutputs(swap, updater, outputValue, outputAddress);

        // Blinding pset
        const utxosKeys = [{blindingPrivateKey: swap.unlockPrivKey!}];
        await this.blindPset(pset, utxosKeys);
        
        return pset;
    }

    addRefundInput(
        pset: liquid.Pset, 
        updater: liquid.Updater, 
        psetInputIndex: number,
        spendingTx: liquid.Transaction, 
        contractOutputIndex: number, 
        witnessUtxo: liquid.TxOutput, 
        swap: SwapOut | SwapIn
    ): void {
        this.addInput(pset, spendingTx.getId(), contractOutputIndex, this.refundSequence);
        updater.addInSighashType(psetInputIndex, liquid.Transaction.SIGHASH_ALL);
        updater.addInWitnessUtxo(psetInputIndex, witnessUtxo);
        updater.addInWitnessScript(psetInputIndex, swap.lockScript!);
    }

    async addRequiredOutputs(swap: SwapOut | SwapIn, updater: liquid.Updater, outputValue: number, outputAddress: string | null = null): Promise<void> {
        // Add dummy outputs to emulate the virtual size
        const dummyFee = 0;
        const destinationAddress = outputAddress ?? swap.sweepAddress!;
        const outputScript = liquid.address.toOutputScript(destinationAddress, this.network);
        const blindingPublicKey = ECPair.fromPrivateKey(swap.unlockPrivKey).publicKey;
        this.addOutput(updater, outputValue, outputScript);
        this.addOutput(updater, dummyFee);

        // Update the pset to remove the emulated outputs and add the real outputs
        const feeAmount = await this.getCommissionAmount(updater.pset);
        const outputAmount = outputValue - feeAmount;
        updater.pset.outputs = [];
        updater.pset.globals.outputCount = 0;
        this.addOutput(updater, outputAmount, outputScript, blindingPublicKey, 0);
        this.addOutput(updater, feeAmount);
    }

    signPset(pset: liquid.Pset, unlockPrivKey: Buffer, psetInputIndex: number): Buffer {
        const signer = new liquid.Signer(pset);
        const signingKeyPair = ECPair.fromPrivateKey(unlockPrivKey);
        const signature = this.signIndex(pset, signer, signingKeyPair, psetInputIndex, liquid.Transaction.SIGHASH_ALL);
        return signature;
    }

    finalizePset(pset: liquid.Pset, psetInputIndex: number, signature: Buffer): void {
        const finalizer = new liquid.Finalizer(pset);
        const stack = [signature, Buffer.from(''), pset.inputs[psetInputIndex].witnessScript!];
        this.finalizeIndexWithStack(finalizer, psetInputIndex, stack);
    }
}
