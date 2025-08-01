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

    /**
     * Send funds to lightning wallet within the provider account
     */
    abstract send(amount: number, destination?: string): Promise<void>;

    /**
     * Withdraw funds from provider account to external wallet
     */
    abstract withdraw(amount: number, address: string): Promise<void>;

    /**
     * Execute a complete swap operation (send + withdraw)
     */
    abstract swap(amount: number, liquidAddress: string): Promise<void>;
}
