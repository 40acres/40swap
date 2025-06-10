# What is a swap?

Swaps (also known as submarine swaps) are a way to move your bitcoin between different layers in a trustless and atomic way:

- Trustless because you are always in control of your funds and don't need to trust that 40swap is not malicious.
- Atomic because, although there are technically 2 payments happening in every swap, either both succeed or both fail.

At the moment, 40swap supports 2 types of swaps: swap-in and swap-out.

## Swap-in

In this type of swap, a user that holds bitcoin on either the L1 or the Liquid blockchain, can move it to the lightning network.

This can be used, for instance, to enable Bitcoin L1 or Liquid payments in an existing lightning wallet.

At a high level, these are the steps a bitcoin swap-in goes through:

1. The user generates an BOLT-11 lightning invoice with the desired amount to swap.
2. The user generates a random key pair. This can be used in case of error to get a refund.
3. The users sends both the invoice and the public key to 40swap.
4. 40swap generates a HTLC contract that is locked by the preimage that corresponds to the lightning invoice (#1), and can be
   refunded with the user's private key (#2).
5. 40swap sends to the user:
    - A bitcoin address derived from the HTLC contract (#4).
    - The amount of bitcoin to pay (this is the desired swap amount + a fee).
6. The user pays the requested amount to the aforementioned address.
7. 40swap pays the lightning invoice (#1) to the user.
8. With the preimage obtained from the lightning payment, 40swap generates a transaction that transfers the funds deposited in the
   contract address to an address of its own.

## Swap-out

In this type of swap, a user that holds bitcoin on a lightning channel, can move it to bitcoin L1 or the Liquid network.

This can be used, for instance, to add receive lightning payments into an already existing L1 wallet or service.

At a high level, this is the flow:

1. The user generates a random preimage and hashes it.
2. The user sends to 40 swap the desired amount to swap and the hash.
3. 40swap generates a HTLC contract that is locked by the preimage and can be refunded with a private key it owns, and derives
   the contract address from it.
4. 40swap generates a lightning invoice with the payment hash generated in #1, and sends it back to the user.
5. The user pays the ligthning invoice, but 40swap can't accept the payment yet because it doesn't know the preimage,
   so the lightning payment is kept "on-hold", with the HTLC still open.
6. 40swap sends an on-chain payment to the address generated in #3.
7. The user sends another on-chain payment, sending the funds locked by the previous tx to an address of its own. To do this,
   they have to use the preimage generated in #1.
8. 40swap detects this payment on-chain a gets the preimage that's revealed with it.
9. 40swap uses the preimage to finally accept the lightning payment.
