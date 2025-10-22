/**
 * Abstract base class for swap providers.
 * Provides common functionality and interface for different exchange providers.
 */
export abstract class SwapProvider {
    protected name: string;
    protected key: string;
    protected secret: string;

    /**
     * Creates a new SwapProvider instance.
     * @param name - Name of the swap provider
     * @param key - API key for authentication
     * @param secret - API secret for authentication
     */
    constructor(name: string, key: string, secret: string) {
        this.name = name;
        this.key = key;
        this.secret = secret;
    }

    /**
     * Gets the provider name.
     * @returns The provider name
     */
    public getName(): string {
        return this.name;
    }

    /**
     * Gets the API key (be careful with logging this).
     * @returns The API key
     */
    public getKey(): string {
        return this.key;
    }

    /**
     * Gets the API secret (be careful with logging this).
     * @returns The API secret
     */
    public getSecret(): string {
        return this.secret;
    }

    /**
     * Makes an HTTP request with the specified parameters.
     * @param url - The URL to make the request to
     * @param method - HTTP method (GET, POST, etc.)
     * @param headers - Request headers
     * @param body - Optional request body
     * @returns Promise resolving to the fetch Response
     */
    protected async makeHttpRequest(url: string, method: string, headers: Record<string, string>, body?: string): Promise<Response> {
        return fetch(url, {
            method,
            headers,
            body: method !== 'GET' ? body : undefined,
        });
    }
}
