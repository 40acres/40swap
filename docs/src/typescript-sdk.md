# Typescript SDK

For typescript/javascript developers that don't want to be concerned with the low-level details, we provide an SDK to faciltate integration.
It takes care of all the actions needed for claimin/refunding swaps, abstracting users from the underlying blockchain transactions.

## Set-up

Just add it to your project with npm or your preferred package manager:
```shell
npm install @40acres/40swap-sdk
```
and import the `SwapService` from the package:
```typescript
import { SwapService, InMemoryPersistence } from '@40acres/40swap-sdk';

const swapService = new SwapService({
    baseUrl: 'https://app.40swap.com',
    persistence: new InMemoryPersistence(),
    network: 'bitcoin',
});
```

## Swap-in

First, provide a lightning invoice to get paid and a refund address in case things fail. Then, create the swap-out:

```typescript
const swapTracker = await swapService.createSwapIn({
    invoice: '<lightning_invoice>',
    chain: 'BITCOIN',
    refundAddress: async () => 'bc1qy0af6f3we9n2tl9hf5zqywaa40zu9rknl0xzd5',
});
```
Then, pay on-chain and simply track its status to know when it's done:
```typescript
swapTracker.on('change', (newStatus: PersistedSwapOut) => {
    if (newStatus.status === 'CREATED') {
        console.log(`Please, pay exactly ${newStatus.inputAmount} BTC to address ${newStatus.contractAddress} in order to start swap-in ${newStatus.swapId}`)
    } else if (newStatus.status === 'DONE') {
        console.log(`Swap-in with id ${newStatus.swapId} is finished. Outcome ${newStatus.outcome}`);
    }
});
swapTracker.on('error', (errorType, error) => {
    if (errorType === 'REFUND') {
        console.error(`Error getting refuind for swap-in ${swapTracker.value?.id}`);
    }
});
swapTracker.start();
```

## Swap-out

First, create the swap-out:

```typescript
const swapTracker = await swapService.createSwapOut({
    chain: 'BITCOIN',
    sweepAddress: 'bc1qead2llv6av4njx76cxgcn82lw9mx05dk0lmr7c', // this is the address where the funds will eventually be sent
    inputAmount: 0.0035,
});
```
Then, pay the invoice and simply track its status to know when it's done:
```typescript
swapTracker.on('change', (newStatus: PersistedSwapOut) => {
    if (newStatus.status === 'CREATED') {
        console.log(`Please, pay the following lightning invoice to start swap-out ${newStatus.swapId}: ${newStatus.invoice}`)
    } else if (newStatus.status === 'DONE') {
        console.log(`Swap-out with id ${newStatus.swapId} is finished. Outcome ${newStatus.outcome}`);
    }
});
swapTracker.on('error', (errorType, error) => {
    if (errorType === 'CLAIM') {
        console.error(`Error while claiming swap-out ${swapTracker.value?.id}`);
    }
});
swapTracker.start();
```

## Persistence

A 40swap client needs to stor some information (e.g. private keys for claiming/refunding) while the swap is is progress.
In the above examples, we're using `InMemoryPersistence` as our persistence layer, which means that if our application
is restarted before the swap is finished, the swap might not be able to complete and, more importantly, we might lose our funds.

To improve our code, we could, for instance, use the `FilesystemPersistence`, which will write a JSON file per swap to a local
directory provided by us:

```typescript
const swapService = new SwapService({
    baseUrl: 'https://app.40swap.com',
    persistence: new FilesystemPersistence({ path: '/var/40swap'}),
    network: 'bitcoin',
});
```

If you want anything more sophisticated like, for example, persisting the swap status to a database, you'll have to write
your own class implementing the interface `SwapPersistence`.

## The API client

If you use javascript/typescript but want to write your own client code, to have a more granular control of the swap lifecycle,
you can still use the API client provided by us:

```typescript
import { FortySwapClient } from '@40acres/40swap-sdk';

const client = new FortySwapClient('https://app.40swap.com');
console.log(await client.in.find('<swapId>'));
```
