import { z } from 'zod';
import { networks } from 'bitcoinjs-lib';

const CHAINS = [
    'BITCOIN',
    'LIQUID',
] as const;
const chainSchema = z.enum(CHAINS);
export type Chain = z.infer<typeof chainSchema>;

export enum SwapInStatus {
    // Happy path
    CREATED = 'CREATED',
    CONTRACT_FUNDED_UNCONFIRMED = 'CONTRACT_FUNDED_UNCONFIRMED',
    CONTRACT_FUNDED = 'CONTRACT_FUNDED',
    INVOICE_PAID = 'INVOICE_PAID',
    CONTRACT_CLAIMED_UNCONFIRMED = 'CONTRACT_CLAIMED_UNCONFIRMED',
    DONE = 'DONE',
    // if it expire after CONTRACT_FUNDED
    CONTRACT_REFUNDED_UNCONFIRMED = 'CONTRACT_REFUNDED_UNCONFIRMED',
    CONTRACT_EXPIRED = 'CONTRACT_EXPIRED',
}

export enum SwapOutStatus {
    CREATED = 'CREATED',
    INVOICE_PAYMENT_INTENT_RECEIVED = 'INVOICE_PAYMENT_INTENT_RECEIVED',
    CONTRACT_FUNDED_UNCONFIRMED = 'CONTRACT_FUNDED_UNCONFIRMED',
    CONTRACT_FUNDED = 'CONTRACT_FUNDED',
    CONTRACT_CLAIMED_UNCONFIRMED = 'CONTRACT_CLAIMED_UNCONFIRMED',
    DONE = 'DONE',
    CONTRACT_EXPIRED = 'CONTRACT_EXPIRED',
    CONTRACT_REFUNDED_UNCONFIRMED = 'CONTRACT_REFUNDED_UNCONFIRMED',
}

// Update schemas to use enums
export const swapInStatusSchema = z.nativeEnum(SwapInStatus);
export const swapOutStatusSchema = z.nativeEnum(SwapOutStatus);

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
    /**
     * Optional parameter to specify a custom CLTV expiry (in blocks) for the swap.
     * If omitted, the default value from the server configuration is used.
     * The minimum value allowed is 144 blocks.
     */
    lockBlockDeltaIn: z.number().optional(),
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
