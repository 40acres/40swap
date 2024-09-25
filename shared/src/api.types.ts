import { z } from 'zod';

const SWAP_IN_STATUSES = ['CREATED', 'CONTRACT_FUNDED', 'INVOICE_PAID', 'CLAIMED'] as const;
const swapInStateSchema = z.enum(SWAP_IN_STATUSES);
export type SwapInState = z.infer<typeof swapInStateSchema>;

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
    status: swapInStateSchema,
});
export type GetSwapInResponse = z.infer<typeof getSwapInResponseSchema>;

export const swapOutRequestSchema = z.object({
    preImageHash: z.string(),
    inputAmount: z.number().positive(),
    claimPubKey: z.string(),
});
export type SwapOutRequest = z.infer<typeof swapOutRequestSchema>;

export const swapOutResponseSchema = z.object({
    swapId: z.string(),
    invoice: z.string(),
    redeemScript: z.string(),
    timeoutBlockHeight: z.number(),
    outputAmount: z.number().positive(),
    contractAddress: z.string(),
});
export type SwapOutResponse = z.infer<typeof swapOutResponseSchema>;
