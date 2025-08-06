export abstract class SwapProvider {
    protected name: string;
    protected key: string;
    protected secret: string;

    constructor(name: string, key: string, secret: string) {
        this.name = name;
        this.key = key;
        this.secret = secret;
    }

    public getName(): string {
        return this.name;
    }

    public getKey(): string {
        return this.key;
    }

    public getSecret(): string {
        return this.secret;
    }

    protected async makeHttpRequest(url: string, method: string, headers: Record<string, string>, body?: string): Promise<Response> {
        return fetch(url, {
            method,
            headers,
            body: method !== 'GET' ? body : undefined,
        });
    }
}
