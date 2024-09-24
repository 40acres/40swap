import { z } from 'zod';

export const swapInRequestSchema = z.object({
    invoice: z.string(),
    refundPublicKey: z.string(),
});
export type SwapInRequest = z.infer<typeof swapInRequestSchema>;

export const swapInResponseSchema = z.object({
    swapId: z.string(),
    address: z.string(),
    redeemScript: z.string(),
    timeoutBlockHeight: z.number(),
});
export type SwapInResponse = z.infer<typeof swapInResponseSchema>;


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
