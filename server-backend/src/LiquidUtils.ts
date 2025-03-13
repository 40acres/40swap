import BIP32Factory from 'bip32';
import * as liquid from 'liquidjs-lib';
import { nbxplorerHotWallet, NbxplorerService, NBXplorerUtxo } from './NbxplorerService';
import * as ecc from 'tiny-secp256k1';
import { Network } from 'bitcoinjs-lib';
import { liquid as liquidNetwork } from 'liquidjs-lib/src/networks.js';
import { varuint } from 'liquidjs-lib/src/bufferutils.js';
import { ECPairFactory, ECPairInterface } from 'ecpair';
import { FourtySwapConfiguration } from './configuration';
import { LiquidService } from './LiquidService.js';

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


export class LiquidPSETBuilder {
    private liquidService: LiquidService;
    private signatures: Buffer[] = [];
    private signingKeys: ECPairInterface[] = [];

    constructor(
        private nbxplorer: NbxplorerService,
        private swapConfig: FourtySwapConfiguration['swap']
    ) {
        this.liquidService = new LiquidService(nbxplorer, swapConfig);
    }

    async buildLiquidPsbtTransaction(
        requiredAmount: number,
        contractAddress: string,
        network: typeof liquidNetwork,
        blindingKey?: Buffer | undefined,
        timeoutBlockHeight?: number,
    ): Promise<liquid.Transaction> {
        const commision = 1000; // 0.1% TODO: get from other source
        const totalAmount = requiredAmount + commision;
        const { utxos, totalInputValue } = await this.liquidService.getConfirmedUtxosAndInputValueForAmount(totalAmount);

        // Create a new pset
        const pset = this.getNewPset(timeoutBlockHeight);
        const updater = this.getNewUpdater(pset);

        // Add inputs to pset
        await this.addInputs(utxos, pset, updater, timeoutBlockHeight);

        // Add required outputs (claim, change, fee) to pset
        await this.addRequiredOutputs(requiredAmount, contractAddress, network, commision, totalInputValue, updater, blindingKey);

        // Sign pset inputs
        const signer = new liquid.Signer(pset);
        await this.signInputs(utxos, pset, signer, network);

        // Finalize pset
        const finalizer = new liquid.Finalizer(pset);
        this.finalize(utxos, finalizer);

        // Extract transaction from pset and return it
        const transaction = liquid.Extractor.extract(pset);
        console.log('Transaction hex: ', transaction.toHex());
        return transaction;
    }

    getNewPset(timeoutBlockHeight?: number): liquid.Pset {
        return liquid.Creator.newPset({locktime: timeoutBlockHeight ?? 0});
    }

    getNewUpdater(pset: liquid.Pset): liquid.Updater {
        return new liquid.Updater(pset);
    }

    async addInputs(
        utxos: NBXplorerUtxo[], pset: liquid.Pset, updater: liquid.Updater, timeoutBlockHeight?: number
    ): Promise<void> {
        await Promise.all(utxos.map(async (utxo, i) => {
            const xpub = this.swapConfig.liquidXpub;
            const walletTx = await this.nbxplorer.getWalletTransaction(xpub, utxo.transactionHash, 'lbtc');
            const liquidTx = liquid.Transaction.fromBuffer(Buffer.from(walletTx.transaction, 'hex'));
            const sequence = timeoutBlockHeight ? 0xffffffff : 0x00000000;
            const input = new liquid.CreatorInput(liquidTx.getId(), utxo.index, sequence);
            pset.addInput(input.toPartialInput());
            updater.addInSighashType(i, liquid.Transaction.SIGHASH_ALL);
            updater.addInNonWitnessUtxo(i, liquidTx);
        })).catch((error) => {
            throw new Error(`Error adding inputs: ${error}`);
        });
    }

    async addRequiredOutputs(
        requiredAmount: number,
        contractAddress: string,
        network: typeof liquidNetwork,
        commision: number,
        totalInputValue: number,
        updater: liquid.Updater,
        blindingKey?: Buffer | undefined,
    ): Promise<void> {
        // Add claim output to pset
        const claimOutputScript = liquid.address.toOutputScript(contractAddress, network);
        this.addOutput(network, updater, getLiquidNumber(requiredAmount), claimOutputScript, blindingKey);

        // Add change output to pset
        const changeAddress = await this.nbxplorer.getUnusedAddress(this.swapConfig.liquidXpub, 'lbtc', { change: true });
        const changeOutputScript = liquid.address.toOutputScript(changeAddress.address, network);
        const changeAmount = getLiquidNumber(totalInputValue - requiredAmount - commision);
        this.addOutput(network, updater, changeAmount, changeOutputScript, blindingKey);

        // Add fee output to pset
        const feeAmount = getLiquidNumber(commision);
        this.addOutput(network, updater, feeAmount);
    }

    addOutput(
        network: typeof liquidNetwork,
        updater: liquid.Updater,
        amount: number, 
        script?: Buffer | undefined, 
        blindingKey?: Buffer | undefined
    ): void {
        const changeOutput = new liquid.CreatorOutput(
            network.assetHash,
            amount,
            script ?? undefined,
            blindingKey !== undefined ? Buffer.from(blindingKey) : undefined,
            blindingKey !== undefined ? 0 : undefined
        );
        updater.addOutputs([changeOutput]);
    }

    signInputs(
        utxos: NBXplorerUtxo[],
        pset: liquid.Pset,
        signer: liquid.Signer,
        network: typeof liquidNetwork,
    ): void {
        for (let i = 0; i < utxos.length; i++) {
            const utxo = utxos[i];

            // TODO: sign inputs without xpriv (using proxied rpc)
            const node = bip32.fromBase58(this.swapConfig.liquidXpriv, network);
            const child = node.derivePath(utxo.keyPath);
            if (!child.privateKey) {
                throw new Error('Could not obtain private key from derived node');
            }
            const signingKeyPair = ECPair.fromPrivateKey(Buffer.from(child.privateKey));
            this.signingKeys.push(signingKeyPair);
            const signature = liquid.script.signature.encode(
                signingKeyPair.sign(pset.getInputPreimage(i, liquid.Transaction.SIGHASH_ALL)),
                liquid.Transaction.SIGHASH_ALL,
            );
            this.signatures.push(signature);
            signer.addSignature(
                i,
                {
                    partialSig: {
                        pubkey: signingKeyPair.publicKey,
                        signature,
                    },
                },
                liquid.Pset.ECDSASigValidator(ecc),
            );
        }
    }

    finalize(utxos: NBXplorerUtxo[], finalizer: liquid.Finalizer): void {
        for (let i = 0; i < utxos.length; i++) {
            finalizer.finalizeInput(i, () => {
                const finals: {
                    finalScriptWitness?: Buffer;
                } = {};

                finals.finalScriptWitness = liquid.witnessStackToScriptWitness([
                    this.signatures[i],
                    this.signingKeys[i].publicKey,
                ]);
                return finals;
            });
        }
    }
}
