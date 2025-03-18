import { NbxplorerService } from './NbxplorerService.js';
import { DataSource } from 'typeorm';
import { createZodDto } from '@anatine/zod-nestjs';
import { BadRequestException, Body, Controller, Get, Logger, Param, Post, Query } from '@nestjs/common';
import { buildContractSpendBasePsbt, buildTransactionWithFee } from './bitcoin-utils.js';
import { ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';
import { address, Psbt, Transaction } from 'bitcoinjs-lib';
import * as liquid from 'liquidjs-lib';
import assert from 'node:assert';
import { SwapOut } from './entities/SwapOut.js';
import { BitcoinConfigurationDetails, BitcoinService } from './BitcoinService.js';
import { SwapService } from './SwapService.js';
import { ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import {
    claimLiquidRequestSchema,
    GetSwapOutResponse,
    PsbtResponse,
    psbtResponseSchema,
    signContractSpend,
    swapChainRequestSchema,
    swapOutRequestSchema,
    txRequestSchema,
} from '@40swap/shared';
import { regtest as liquidRegtest } from 'liquidjs-lib/src/networks.js';
const ECPair = ECPairFactory(ecc);

class SwapOutRequestDto extends createZodDto(swapOutRequestSchema) {}
class TxRequestDto extends createZodDto(txRequestSchema) {}
class GetSwapOutResponseDto extends createZodDto(swapOutRequestSchema) {}
class PsbtResponseDto extends createZodDto(psbtResponseSchema) {}
class SwapChainRequestDto extends createZodDto(swapChainRequestSchema) {}
class ClaimLiquidRequestDto extends createZodDto(claimLiquidRequestSchema) {}

@Controller('/swap/out')
export class SwapOutController {
    private readonly logger = new Logger(SwapOutController.name);
    
    constructor(
        private nbxplorer: NbxplorerService,
        private dataSource: DataSource,
        private bitcoinConfig: BitcoinConfigurationDetails,
        private bitcoinService: BitcoinService,
        private swapService: SwapService,
    ) {}

    @Post()
    @ApiCreatedResponse({description: 'Create a swap out', type: GetSwapOutResponseDto})
    async createSwap(@Body() request: SwapOutRequestDto): Promise<GetSwapOutResponse> {
        const swap = await this.swapService.createSwapOut(request);
        return this.mapToResponse(swap);
    }

    @Post('/liquid')
    @ApiCreatedResponse({ description: 'Create a swap between chains', type: GetSwapOutResponseDto })
    async liquidSwapOut(@Body() request: SwapChainRequestDto): Promise<GetSwapOutResponse> {
        if (request.originChain !== 'LIGHTNING' || request.destinationChain !== 'LIQUID') {
            throw new BadRequestException('We only support swaps from LIGHTNING to LIQUID currently');
        }
        const swap = await this.swapService.createSwapOutLightningToLiquidSwap(request);
        return this.mapToResponse(swap);
    }

    @Get('/:id')
    @ApiOkResponse({description: 'Get a swap out', type: GetSwapOutResponseDto})
    async getSwap(@Param('id') id: string): Promise<GetSwapOutResponse> {
        const swap = await this.dataSource.getRepository(SwapOut).findOneByOrFail({ id });
        return this.mapToResponse(swap);
    }

    @Post('/claimTx')
    @ApiCreatedResponse({description: 'Claim a swap out'})
    async claimSwapTx(@Body() txRequest: ClaimLiquidRequestDto): Promise<string> {
        const spendingTx = liquid.Transaction.fromHex(txRequest.spendingTx);
        const privKey = txRequest.privKey;
        const destinationAddress = txRequest.destinationAddress;
        const preImage = txRequest.preImage;
        const contractAddress = txRequest.contractAddress;
        return this.buildLiquidClaimTx(spendingTx, privKey, destinationAddress, preImage, contractAddress);
    }

    @Post('/:id/claim')
    @ApiCreatedResponse({description: 'Claim a swap out'})
    async claimSwap(@Body() txRequest: TxRequestDto, @Param('id') id: string): Promise<void> {
        const swap = await this.dataSource.getRepository(SwapOut).findOneByOrFail({ id });
        assert(swap.lockTx != null);
        try {
            const lockTx = Transaction.fromBuffer(swap.lockTx);
            const refundTx = Transaction.fromHex(txRequest.tx);
            if (refundTx.ins.filter(i => i.hash.equals(lockTx.getHash())).length !== 1) {
                throw new BadRequestException('invalid refund tx');
            }
            await this.nbxplorer.broadcastTx(refundTx);
        } catch (e) {
            throw new BadRequestException('invalid bitcoin tx');
        }
    }

    @Get('/:id/claim-psbt')
    @ApiOkResponse({description: 'Get a claim PSBT', type: PsbtResponseDto})
    async getClaimPsbt(@Param('id') id: string, @Query('address') outputAddress?: string): Promise<PsbtResponse> {
        if (outputAddress == null) {
            throw new BadRequestException('address is required');
        }
        try {
            address.toOutputScript(outputAddress, this.bitcoinConfig.network);
        } catch (e) {
            throw new BadRequestException(`invalid address ${outputAddress}`);
        }
        const swap = await this.dataSource.getRepository(SwapOut).findOneByOrFail({ id });
        assert(swap.lockTx != null);
        const lockTx = Transaction.fromBuffer(swap.lockTx);
        const claimPsbt = this.buildClaimPsbt(swap, lockTx, outputAddress, await this.bitcoinService.getMinerFeeRate('low_prio'));
        return { psbt: claimPsbt.toBase64() };
    }

    buildClaimPsbt(swap: SwapOut, spendingTx: Transaction, outputAddress: string, feeRate: number): Psbt {
        const { network } = this.bitcoinConfig;
        return buildTransactionWithFee(
            feeRate,
            (feeAmount, isFeeCalculationRun) => {
                assert(swap.lockScript != null);
                assert(swap.contractAddress != null);
                const psbt = buildContractSpendBasePsbt({
                    contractAddress: swap.contractAddress,
                    lockScript: swap.lockScript,
                    network,
                    spendingTx,
                    outputAddress,
                    feeAmount,
                });
                if (isFeeCalculationRun) {
                    signContractSpend({
                        psbt,
                        network,
                        key: ECPair.fromPrivateKey(swap.unlockPrivKey),
                        preImage: Buffer.alloc(32).fill(0),
                    });
                }
                return psbt;
            },
        );
    }

    private mapToResponse(swap: SwapOut): GetSwapOutResponse {
        return {
            swapId: swap.id,
            timeoutBlockHeight: swap.timeoutBlockHeight,
            redeemScript: swap.lockScript?.toString('hex'),
            invoice: swap.invoice,
            contractAddress: swap.contractAddress ?? undefined,
            outputAmount: swap.outputAmount.toNumber(),
            status: swap.status,
            lockTx: swap.lockTx?.toString('hex'),
            createdAt: swap.createdAt.toISOString(),
            inputAmount: swap.inputAmount.toNumber(),
            outcome: swap.outcome ?? undefined,
        };
    }


    async buildLiquidClaimTx(
        spendingTx: liquid.Transaction, 
        privKey: string, 
        destinationAddress: string, 
        preImage: string,
        contractAddress: string
    ): Promise<string> {
        const network = liquidRegtest;
        const swap = await this.dataSource.getRepository(SwapOut).findOne({
            where: { contractAddress: contractAddress },
        });
        
        if (!swap || !swap.lockScript) {
            throw new BadRequestException('Cannot find swap with matching contract address');
        }
        
        // Find the contract output index
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
                // Ignore errors in address parsing
            }
        }
        
        assert(contractOutputIndex !== -1, 'Contract output not found in spending transaction');
        assert(witnessUtxo != null, 'Witness utxo not found in spending transaction');
        
        // Create a new pset
        const pset = liquid.Creator.newPset();
        const updater = new liquid.Updater(pset);
        
        // Add input - use contractOutputIndex for the vout
        const input = new liquid.CreatorInput(spendingTx.getId(), contractOutputIndex, 0);  // Use 0 to enable timelock checks
        pset.addInput(input.toPartialInput());
        
        // Use index 0 for the input we just added to the pset (not contractOutputIndex)
        const psetInputIndex = 0;
        updater.addInSighashType(psetInputIndex, liquid.Transaction.SIGHASH_ALL);
        updater.addInWitnessUtxo(psetInputIndex, witnessUtxo);
        updater.addInWitnessScript(psetInputIndex, swap.lockScript);
        
        // Calculate output amount and fee
        const feeAmount = 1000; // estimate tx size
        const outputAmount = outputValue - feeAmount;
        
        if (outputAmount <= 1000) { // dust
            throw new Error(`Amount is too low: ${outputAmount}`);
        }
        
        // Add output
        const outputScript = liquid.address.toOutputScript(destinationAddress, network);
        const claimOutput = new liquid.CreatorOutput(network.assetHash, outputAmount, outputScript);
        updater.addOutputs([claimOutput]);
        
        // Add fee output - required for Liquid
        const feeOutput = new liquid.CreatorOutput(network.assetHash, feeAmount);
        updater.addOutputs([feeOutput]);
        
        // Sign input
        const signer = new liquid.Signer(pset);
        const keyPair = ECPair.fromWIF(privKey, network);
        
        // Verify the public key matches what's expected in the script
        if (!swap.counterpartyPubKey) {
            throw new BadRequestException('Counterparty public key not found in swap');
        }
        if (!keyPair.publicKey.equals(swap.counterpartyPubKey)) {
            this.logger.warn('Public key from provided private key does not match counterparty public key in swap');
            // This is a warning rather than an error because the script might use a different key
        }
        
        const signature = liquid.script.signature.encode(
            keyPair.sign(pset.getInputPreimage(psetInputIndex, liquid.Transaction.SIGHASH_ALL)),
            liquid.Transaction.SIGHASH_ALL,
        );
                
        signer.addSignature(
            psetInputIndex,
            {
                partialSig: {
                    pubkey: keyPair.publicKey,
                    signature,
                },
            },
            liquid.Pset.ECDSASigValidator(ecc),
        );
        
        // Finalize input
        const finalizer = new liquid.Finalizer(pset);
        finalizer.finalizeInput(psetInputIndex, () => {
            const finals: {
                finalScriptWitness?: Buffer;
            } = {};
            
            // Retrieve the actual preimageHash from the swap
            const preImageHashBuffer = swap.preImageHash;
            
            // For validation in the HTLC script:
            // 1. Calculate the hash160 of the provided preimage
            const preImageBuffer = Buffer.from(preImage, 'hex');
            const preimageHash160 = liquid.crypto.sha256(preImageBuffer);
            
            // 2. Check if the hash of the preimage matches the original preimageHash
            const isPreimageValid = preimageHash160.toString('hex') === preImageHashBuffer.toString('hex');
            
            // 3. Enforce validation
            if (!isPreimageValid) {
                console.log('Invalid preimage provided');
                console.log('preImageHashBuffer', preImageHashBuffer.toString('hex'));
                console.log('preimageHash160', preimageHash160.toString('hex'));
                console.log('isPreimageValid', isPreimageValid);
                throw new BadRequestException('Invalid preimage provided');
            }

            if (!swap.lockScript) {
                throw new BadRequestException('Lock script not found in swap');
            }
            
            finals.finalScriptWitness = liquid.witnessStackToScriptWitness([
                signature,
                Buffer.from(preImage, 'hex'),
                swap.lockScript,
            ]);
            
            return finals;
        });
        
        // Extract transaction
        const transaction = liquid.Extractor.extract(pset);
        return transaction.toHex();
    }

}