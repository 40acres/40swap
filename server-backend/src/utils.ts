export function sleep(millis: number, abortSignal?: AbortSignal): Promise<void> {
    const timeoutPromise = new Promise<void>(r => setTimeout(r, millis));
    if (abortSignal != null) {
        return Promise.any([
            timeoutPromise,
            new Promise<void>(resolve => {
                const aborter = (): void => resolve();
                abortSignal.addEventListener('abort', aborter);
                timeoutPromise.then(() => abortSignal.removeEventListener('abort', aborter));
            }),
        ]);
    }
    return timeoutPromise;
}

const BASE_58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export function base58Id(length = 12): string {
    const id = Buffer.alloc(length);
    const randomValues = crypto.getRandomValues(new Uint16Array(length));

    for (let i = 0; i < length; i += 1) {
        id.write(BASE_58_ALPHABET.charAt(randomValues[i] % BASE_58_ALPHABET.length), i, 'utf-8');
    }
    return id.toString('utf-8');
}

export function isValidOutpoint(outpoint: string): [boolean, string, number] {
    const parts = outpoint.split(':')
    if (parts.length !== 2) {
      return [false, "", -1];
    }

    const [txid, vout] = parts;
  
    // txid should be a 64-character hex string
    const isValidTxid = /^[0-9a-fA-F]{64}$/.test(txid);
    const intVOut = Number.parseInt(vout);
    
    // vout should be a non-negative integer
    const isValidVout = !Number.isNaN(intVOut) && intVOut >= 0;
  
    return [isValidTxid && isValidVout, txid, intVOut];
 }