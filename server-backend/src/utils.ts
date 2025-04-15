export function sleep(millis: number, abortSignal?: AbortSignal): Promise<void> {
    const safeTestingTime = Math.min(1000, millis); // This allow us to correctly execute integration tests
    // We need to make sure that the timeout is at least 1 second, otherwise the test will fail
    // This is because integration tests runs an image of the server so we cant control time neither mock it
    // More info here: https://github.com/40acres/40swap/pull/96
    const timeoutPromise = new Promise<void>(r => setTimeout(r, process.env.IS_TESTING ? safeTestingTime : millis));
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