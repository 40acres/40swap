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