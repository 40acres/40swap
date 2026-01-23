import { z } from 'zod';
import { networks } from 'bitcoinjs-lib';

const CHAINS = ['BITCOIN', 'LIQUID'] as const;
const chainSchema = z.enum(CHAINS).describe('The blockchain to swap from/to');
export type Chain = z.infer<typeof chainSchema>;

const SWAP_IN_STATUSES = [
    // happy path
    'CREATED',
    // If the amount does not match the L2 invoice, mismatched payment statuses
    'CONTRACT_AMOUNT_MISMATCH_UNCONFIRMED',
    'CONTRACT_AMOUNT_MISMATCH',
    // happy path
    'CONTRACT_FUNDED_UNCONFIRMED',
    'CONTRACT_FUNDED',
    'INVOICE_PAID',
    'CONTRACT_CLAIMED_UNCONFIRMED',
    'DONE',
    // if it expires after CONTRACT_FUNDED
    'CONTRACT_REFUNDED_UNCONFIRMED',
    'CONTRACT_EXPIRED',
] as const;
const swapInStatusSchema = z.enum(SWAP_IN_STATUSES).describe(`
        The happy path:
            - CREATED: the swap was just created.
            - CONTRACT_FUNDED_UNCONFIRMED: the on-chain transaction from the user was found on the mempool.
            - CONTRACT_FUNDED: the on-chain transaction from the user was confirmed.
            - INVOICE_PAID: the lightning invoice was paid to the user.
            - CONTRACT_CLAIMED_UNCONFIRMED: 40swap sent to the mempool the tx that unlocks the on-chain funds.
        Expiration path:
            - CONTRACT_EXPIRED: after CONTRACT_FUNDED, if the expiration block is reached, it will move to this state. It means that the swap can be refunded.
            - CONTRACT_REFUNDED_UNCONFIRMED: the user sent the refund tx to the mempool.
        Amount mismatch path:
            - CONTRACT_AMOUNT_MISMATCH_UNCONFIRMED: after CREATED, if the user sends a wrong amount, it will move to this state.
            - CONTRACT_AMOUNT_MISMATCH: when the tx above is confirmed. After this, it should move to CONTRACT_EXPIRED.
        
        - DONE: the swap-in is finished, either successfully or not.
    `);
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
const swapOutStatusSchema = z.enum(SWAP_OUT_STATUSES).describe(`
        The happy path:
            - CREATED: the swap was just created.
            - INVOICE_PAYMENT_INTENT_RECEIVED: the user attempted to pay the invoice and 40swap received the lightning HTLC,
            - CONTRACT_FUNDED_UNCONFIRMED: 40swap sent the on-chain transaction that locks the funds in the contract.
            - CONTRACT_FUNDED: the contract funding traansaction was confirmed.
            - CONTRACT_CLAIMED_UNCONFIRMED: the user sent the on-chain transaction that unlocks the funds to himself.
            - DONE: the swap-out is finished, either successfully or not.
        Expiration path:
            - CONTRACT_EXPIRED: after CONTRACT_FUNDED, if the expiration block is reached, it will move to this state. It means that the swap failed and 40swap will refund to itself.
            - CONTRACT_REFUNDED_UNCONFIRMED: 40swap sent the refund tx to the mempool.
    `);
export type SwapOutStatus = z.infer<typeof swapOutStatusSchema>;

const SWAP_OUTCOMES = ['SUCCESS', 'REFUNDED', 'EXPIRED', 'ERROR'] as const;
const swapOutcomesSchema = z.enum(SWAP_OUTCOMES).describe(`
        SUCCESS: The swap was successful.
        REFUNDED: The swap failed and was refunded.
        EXPIRED: The swap expired before any funds were sent.
        ERROR: There was an error processing the swap.
    `);
export type SwapOutcome = z.infer<typeof swapOutcomesSchema>;

export const swapInRequestSchema = z.object({
    chain: chainSchema,
    invoice: z.string().describe('The BOLT-11 invoice to receive the lightning funds.'),
    refundPublicKey: z
        .string()
        .describe('In case of failure, the corresponding private key can be used to sign the on-chain transaction that returns the funds to the user.'),
    lockBlockDeltaIn: z
        .number()
        .lt(5000)
        .optional()
        .describe('Number of blocks after which the swap can be considered expired and can be refunded. Leave it empty to use the default value.'),
});
export type SwapInRequest = z.infer<typeof swapInRequestSchema>;

const swapResponseSchema = z.object({
    swapId: z.string().describe('Identifier of the newly created swap.'),
    chain: chainSchema,
    contractAddress: z.string().describe('The on-chain address where the funds will be locked in before being released.'),
    redeemScript: z.string().describe('The bitcoin script to which the on-chain funds will be locked. The contract address is derived from this script.'),
    timeoutBlockHeight: z.number().describe('Block number at which the swap will expire and can be refunded.'),
    lockTx: z.string().optional().describe('Once the user has sent the funds on-chain, this field will contain the transaction in hex format.'),
    inputAmount: z.number().positive().describe('The amount that the user must send.'),
    outputAmount: z.number().describe('The amount that the user will receive.'),
    createdAt: z.string().describe('Date at which this swap was created.'),
    outcome: swapOutcomesSchema.optional(),
});

export const getSwapInResponseSchema = swapResponseSchema.extend({
    status: swapInStatusSchema,
});
export type GetSwapInResponse = z.infer<typeof getSwapInResponseSchema>;

export const swapOutRequestSchema = z.object({
    chain: chainSchema,
    preImageHash: z.string().describe('The SHA256 hash of a random 32-byte preimage generated by the client, in hex format'),
    inputAmount: z.number().positive().describe('The amount that the user must send.'),
    claimPubKey: z.string().describe('The public key corresponding to the private key that can be used to unlock the on-chain funds.'),
});
export type SwapOutRequest = z.infer<typeof swapOutRequestSchema>;

export const getSwapOutResponseSchema = swapResponseSchema.extend({
    invoice: z.string().describe('The BOLT-11 invoice to be paid by the user.'),
    status: swapOutStatusSchema,
    redeemScript: z
        .string()
        .optional()
        .describe('The bitcoin script to which the on-chain funds will be locked. The contract address is derived from this script.'),
    contractAddress: z.string().optional().describe('The on-chain address where the funds will be locked in before being released.'),
    refundPublicKey: z.string().optional().describe('The public key that 40swap uses for refunding expired swaps.'),
});
export type GetSwapOutResponse = z.infer<typeof getSwapOutResponseSchema>;

export const frontendConfigurationSchema = z.object({
    bitcoinNetwork: z.enum(['bitcoin', 'regtest', 'testnet']).transform((n) => networks[n]),
    feePercentage: z.number(),
    minimumAmount: z.number(),
    maximumAmount: z.number(),
    mempoolDotSpaceUrl: z.string().url(),
    esploraUrl: z.string().url(),
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
