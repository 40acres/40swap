import { z } from 'zod';
import { networks } from 'bitcoinjs-lib';

const CHAINS = [
    'BITCOIN',
    'LIGHTNING',
    'LIQUID',
] as const;
const chainSchema = z.enum(CHAINS);
export type Chain = z.infer<typeof chainSchema>;

const SWAP_IN_STATUSES = [
    // happy path
    'CREATED',
    'CONTRACT_FUNDED_UNCONFIRMED',
    'CONTRACT_FUNDED',
    'INVOICE_PAID',
    'CONTRACT_CLAIMED_UNCONFIRMED',
    'DONE',
    // if it expires after CONTRACT_FUNDED
    'CONTRACT_REFUNDED_UNCONFIRMED',
    'CONTRACT_EXPIRED',
] as const;
const swapInStatusSchema = z.enum(SWAP_IN_STATUSES);
export type SwapInStatus = z.infer<typeof swapInStatusSchema>;

const SWAP_OUT_STATUSES = [
    // happy path
    'CREATED',
    'INVOICE_PAYMENT_INTENT_RECEIVED',
    'CONTRACT_FUNDED_UNCONFIRMED',
    'CONTRACT_FUNDED',
    'CONTRACT_CLAIMED_UNCONFIRMED',
    'DONE',
    // if it expires after CONTRACT_FUNDED
    'CONTRACT_EXPIRED',
    'CONTRACT_REFUNDED_UNCONFIRMED',
] as const;
const swapOutStatusSchema = z.enum(SWAP_OUT_STATUSES);
export type SwapOutStatus = z.infer<typeof swapOutStatusSchema>;

const SWAP_OUTCOMES = [
    'SUCCESS',
    'REFUNDED',
    'EXPIRED',
] as const;
const swapOutcomesSchema = z.enum(SWAP_OUTCOMES);
export type SwapOutcome = z.infer<typeof swapOutcomesSchema>;

export const swapInRequestSchema = z.object({
    chain: chainSchema,
    invoice: z.string(),
    refundPublicKey: z.string(),
});
export type SwapInRequest = z.infer<typeof swapInRequestSchema>;

const swapResponseSchema = z.object({
    swapId: z.string(),
    contractAddress: z.string(),
    redeemScript: z.string(),
    timeoutBlockHeight: z.number(),
    lockTx: z.string().optional(),
    inputAmount: z.number().positive(),
    outputAmount: z.number(),
    createdAt: z.string(),
    outcome: swapOutcomesSchema.optional(),
});

export const getSwapInResponseSchema = swapResponseSchema.extend({
    status: swapInStatusSchema,
});
export type GetSwapInResponse = z.infer<typeof getSwapInResponseSchema>;

export const swapOutRequestSchema = z.object({
    chain: chainSchema,
    preImageHash: z.string(),
    inputAmount: z.number().positive(),
    claimPubKey: z.string(),
});
export type SwapOutRequest = z.infer<typeof swapOutRequestSchema>;

export const getSwapOutResponseSchema = swapResponseSchema.extend({
    invoice: z.string(),
    status: swapOutStatusSchema,
    redeemScript: z.string().optional(),
    contractAddress: z.string().optional(),
});
export type GetSwapOutResponse = z.infer<typeof getSwapOutResponseSchema>;

export const swapChainRequestSchema = z.object({
    originChain: chainSchema,
    destinationChain: chainSchema,
    inputAmount: z.number().positive(),
    claimPubKey: z.string(),
    preImageHash: z.string(),
});
export type SwapChainRequest = z.infer<typeof swapChainRequestSchema>;

export const claimLiquidRequestSchema = z.object({
    privKey: z.string(),
    preImage: z.string(),
    destinationAddress: z.string()
});
export type ClaimLiquidRequest = z.infer<typeof claimLiquidRequestSchema>;

export const intiateSwapFromLNToLQResponse = z.object({
    invoice: z.string(),
    hash: z.string(),
    liquidHtlcAddress: z.string(),
    htlcScript: z.string(),
    claimPubKey: z.string(),
    refundPubKey: z.string(),
    locktime: z.number(),
    amount: z.number(),
});
export type IntiateSwapFromLNToLQResponse = z.infer<typeof intiateSwapFromLNToLQResponse>;
export type RedeemSwapFromLNToLQRequest = z.infer<typeof intiateSwapFromLNToLQResponse>;

export const getSwapChainResponseSchema = swapResponseSchema.extend({
    invoice: z.string(),
    status: swapOutStatusSchema,
    redeemScript: z.string().optional(),
    contractAddress: z.string().optional(),
});
export type GetSwapChainResponse = z.infer<typeof getSwapOutResponseSchema>;

export const frontendConfigurationSchema = z.object({
    bitcoinNetwork: z.enum(['bitcoin', 'regtest', 'testnet']).transform(n => networks[n]),
    feePercentage: z.number(),
    minimumAmount: z.number(),
    maximumAmount: z.number(),
    mempoolDotSpaceUrl: z.string().url(),
});
export type FrontendConfiguration = z.infer<typeof frontendConfigurationSchema>;
export type FrontendConfigurationServer = z.input<typeof frontendConfigurationSchema>;

export const psbtResponseSchema = z.object({
    psbt: z.string(),
});
export type PsbtResponse = z.infer<typeof psbtResponseSchema>;

export const txRequestSchema = z.object({
    tx: z.string(),
});
export type TxRequest = z.infer<typeof txRequestSchema>;
