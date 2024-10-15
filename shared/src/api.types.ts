import { z } from 'zod';
import { networks } from 'bitcoinjs-lib';

const SWAP_IN_STATUSES = [
    // happy path
    'CREATED',
    'CONTRACT_FUNDED',
    'INVOICE_PAID',
    'CLAIMED',
    // if it expires after CONTRACT_FUNDED
    'CONTRACT_EXPIRED',
    'REFUNDED',
] as const;
const swapInStatusSchema = z.enum(SWAP_IN_STATUSES);
export type SwapInStatus = z.infer<typeof swapInStatusSchema>;

const SWAP_OUT_STATUSES = [
    // happy path
    'CREATED',
    'INVOICE_PAYMENT_INTENT_RECEIVED',
    'CONTRACT_FUNDED',
    'CLAIMED',
    // if it expires after CONTRACT_FUNDED
    'CONTRACT_EXPIRED',
    'REFUNDED',
] as const;
const swapOutStatusSchema = z.enum(SWAP_OUT_STATUSES);
export type SwapOutStatus = z.infer<typeof swapOutStatusSchema>;

export const swapInRequestSchema = z.object({
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
});

export const getSwapInResponseSchema = swapResponseSchema.extend({
    status: swapInStatusSchema,
});
export type GetSwapInResponse = z.infer<typeof getSwapInResponseSchema>;

export const swapOutRequestSchema = z.object({
    preImageHash: z.string(),
    inputAmount: z.number().positive(),
    claimPubKey: z.string(),
});
export type SwapOutRequest = z.infer<typeof swapOutRequestSchema>;

export const getSwapOutResponseSchema = swapResponseSchema.extend({
    invoice: z.string(),
    status: swapOutStatusSchema,
});
export type GetSwapOutResponse = z.infer<typeof getSwapOutResponseSchema>;

export const frontendConfigurationSchema = z.object({
    bitcoinNetwork: z.enum(['bitcoin', 'regtest', 'testnet']).transform(n => networks[n]),
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
