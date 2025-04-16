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

    async getCommissionAmount(): Promise<number> {
        const mempoolInfo = await this.liquidService.getMempoolInfo();
        return mempoolInfo.minrelaytxfee * 1e8;
    }

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
            // TODO: Add blinding key
            // blindingKey !== undefined ? blindingKey : undefined,
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

    getContractVoutInfo(
        spendingTx: liquid.Transaction, contractAddress: string, network: liquid.networks.Network
    ): {
        contractOutputIndex: number;
        outputValue: number;
        witnessUtxo: liquid.TxOutput;
    } {
        let outputValue = 0;
        let contractOutputIndex = -1;
        let witnessUtxo: liquid.TxOutput | null = null;
        
        for (let i = 0; i < spendingTx.outs.length; i++) {
            try {
                const outputScript = spendingTx.outs[i].script;
                const outputAddress = liquid.address.fromOutputScript(outputScript, network);
                if (outputAddress === contractAddress) {
                    contractOutputIndex = i;
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
    async getPset(swap: SwapOut, spendingTx: liquid.Transaction, destinationAddress: string,): Promise<liquid.Pset> {
        // Find the contract vout info
        const { contractOutputIndex, outputValue, witnessUtxo } = this.getContractVoutInfo(
            spendingTx, swap.contractAddress!, this.network
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
        
        // Calculate output amount and fee
        const feeAmount = await this.getCommissionAmount();
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
        const { contractOutputIndex, outputValue, witnessUtxo } = this.getContractVoutInfo(
            spendingTx, swap.contractAddress!, this.network
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
        await this.addRequiredOutputs(swap, updater, outputValue);
        
        // Sign pset inputs
        const signer = new liquid.Signer(pset);
        const signingKeyPair = ECPair.fromPrivateKey(swap.unlockPrivKey);
        const signature = this.signIndex(pset, signer, signingKeyPair, psetInputIndex, liquid.Transaction.SIGHASH_ALL);

        // Finalize pset
        const finalizer = new liquid.Finalizer(pset);
        const stack = [signature, Buffer.from(''), pset.inputs[psetInputIndex].witnessScript!];
        this.finalizeIndexWithStack(finalizer, psetInputIndex, stack);
        return pset;
    }

    addRefundInput(
        pset: liquid.Pset, 
        updater: liquid.Updater, 
        psetInputIndex: number,
        spendingTx: liquid.Transaction, 
        contractOutputIndex: number, 
        witnessUtxo: liquid.TxOutput, 
        swap: SwapOut
    ): void {
        this.addInput(pset, spendingTx.getId(), contractOutputIndex, this.refundSequence);
        updater.addInSighashType(psetInputIndex, liquid.Transaction.SIGHASH_ALL);
        updater.addInWitnessUtxo(psetInputIndex, witnessUtxo);
        updater.addInWitnessScript(psetInputIndex, swap.lockScript!);
    }

    async addRequiredOutputs(swap: SwapOut, updater: liquid.Updater, outputValue: number): Promise<void> {
        // Calculate output amount and fee
        const feeAmount = await this.getCommissionAmount();
        const outputAmount = outputValue - feeAmount;
        
        // Add output
        const outputScript = liquid.address.toOutputScript(swap.sweepAddress!, this.network);
        this.addOutput(updater, outputAmount, outputScript);
        
        // Add fee output - required for Liquid
        this.addOutput(updater, feeAmount);
    }
}
