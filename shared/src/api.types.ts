import { z } from 'zod';
import { networks } from 'bitcoinjs-lib';

const SWAP_IN_STATUSES = ['CREATED', 'CONTRACT_FUNDED', 'INVOICE_PAID', 'CLAIMED'] as const;
const swapInStatusSchema = z.enum(SWAP_IN_STATUSES);
export type SwapInStatus = z.infer<typeof swapInStatusSchema>;

const SWAP_OUT_STATUSES = ['CREATED', 'INVOICE_PAYMENT_INTENT_RECEIVED', 'CONTRACT_FUNDED', 'CLAIMED'] as const;
const swapOutStatusSchema = z.enum(SWAP_OUT_STATUSES);
export type SwapOutStatus = z.infer<typeof swapOutStatusSchema>;

export const swapInRequestSchema = z.object({
    invoice: z.string(),
    refundPublicKey: z.string(),
});
export type SwapInRequest = z.infer<typeof swapInRequestSchema>;

export const getSwapInResponseSchema = z.object({
    swapId: z.string(),
    address: z.string(),
    redeemScript: z.string(),
    timeoutBlockHeight: z.number(),
    status: swapInStatusSchema,
    inputAmount: z.number().positive(),
});
export type GetSwapInResponse = z.infer<typeof getSwapInResponseSchema>;

export const swapOutRequestSchema = z.object({
    preImageHash: z.string(),
    inputAmount: z.number().positive(),
    claimPubKey: z.string(),
});
export type SwapOutRequest = z.infer<typeof swapOutRequestSchema>;

export const getSwapOutResponseSchema = z.object({
    swapId: z.string(),
    invoice: z.string(),
    redeemScript: z.string(),
    timeoutBlockHeight: z.number(),
    contractAddress: z.string(),
    lockTx: z.string().optional(),
    outputAmount: z.number().positive().optional(),
    status: swapOutStatusSchema,
});
export type GetSwapOutResponse = z.infer<typeof getSwapOutResponseSchema>;

export const claimSwapOutRequestSchema = z.object({
    claimTx: z.string(),
});
export type ClaimSwapOutRequest = z.infer<typeof claimSwapOutRequestSchema>;

export const frontendConfigurationSchema = z.object({
    bitcoinNetwork: z.enum(['bitcoin', 'regtest', 'testnet']).transform(n => networks[n]),
});
export type FrontendConfiguration = z.infer<typeof frontendConfigurationSchema>;
export type FrontendConfigurationServer = z.input<typeof frontendConfigurationSchema>;