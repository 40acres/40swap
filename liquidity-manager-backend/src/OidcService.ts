import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Issuer, Client, generators, TokenSet } from 'openid-client';
import { LiquidityManagerConfiguration } from './configuration.js';

@Injectable()
export class OidcService {
    private readonly logger = new Logger(OidcService.name);
    private client: Client | null = null;
    private issuer: Issuer | null = null;
    private initPromise: Promise<void> | null = null;

    constructor(private readonly config: ConfigService<LiquidityManagerConfiguration>) {}

    private async ensureInitialized(): Promise<void> {
        if (this.client && this.issuer) {
            return;
        }
        if (!this.initPromise) {
            this.initPromise = this.initialize();
        }
        await this.initPromise;
    }

    private async initialize(): Promise<void> {
        const authConfig = this.config.getOrThrow('auth', { infer: true });
        const keycloakUrl = authConfig.keycloak.url;
        const realm = authConfig.keycloak.realm;
        const clientId = authConfig.keycloak.clientId;

        try {
            this.logger.log(`Discovering OIDC configuration from ${keycloakUrl}/realms/${realm}`);

            const issuerUrl = `${keycloakUrl}/realms/${realm}`;
            this.issuer = await Issuer.discover(issuerUrl);

            this.client = new this.issuer.Client({
                client_id: clientId,
                token_endpoint_auth_method: 'none',
            });

            this.logger.log('OIDC client initialized successfully');
            this.logger.log(`Issuer: ${this.issuer.issuer}`);
        } catch (error) {
            this.initPromise = null;
            const msg = error instanceof AggregateError ? error.errors.map((e) => e.toString()).join(', ') : (error as Error).toString();
            this.logger.error(`Failed to initialize OIDC client: ${msg}`, error);
            throw error;
        }
    }

    private getClient(): Client {
        if (!this.client) {
            throw new Error('OIDC client not initialized');
        }
        return this.client;
    }

    private getIssuer(): Issuer {
        if (!this.issuer) {
            throw new Error('OIDC issuer not initialized');
        }
        return this.issuer;
    }

    async generateAuthUrl(redirectUri: string, state: string, codeVerifier: string): Promise<string> {
        await this.ensureInitialized();
        const client = this.getClient();
        const codeChallenge = generators.codeChallenge(codeVerifier);

        return client.authorizationUrl({
            redirect_uri: redirectUri,
            scope: 'openid profile email',
            state,
            code_challenge: codeChallenge,
            code_challenge_method: 'S256',
        });
    }

    async exchangeCodeForTokens(code: string, redirectUri: string, codeVerifier: string): Promise<TokenSet> {
        await this.ensureInitialized();
        const issuer = this.getIssuer();
        const metadata = issuer.metadata;

        try {
            // Manual token exchange to bypass strict issuer validation
            const authConfig = this.config.getOrThrow('auth', { infer: true });
            const params = new URLSearchParams({
                grant_type: 'authorization_code',
                code,
                redirect_uri: redirectUri,
                client_id: authConfig.keycloak.clientId,
                code_verifier: codeVerifier,
            });

            const response = await fetch(metadata.token_endpoint!, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: params.toString(),
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Token exchange failed: ${error}`);
            }

            const tokenSet = await response.json();
            this.logger.log('Token exchange successful');
            return tokenSet as TokenSet;
        } catch (error) {
            this.logger.error('Token exchange failed', error);
            throw error;
        }
    }

    async getUserInfo(accessToken: string): Promise<Record<string, unknown>> {
        await this.ensureInitialized();
        const client = this.getClient();
        return client.userinfo(accessToken);
    }

    async getEndSessionUrl(idToken: string): Promise<string> {
        await this.ensureInitialized();
        const client = this.getClient();
        const authConfig = this.config.getOrThrow('auth', { infer: true });
        const frontendUrl = authConfig.baseUrl;
        return client.endSessionUrl({
            id_token_hint: idToken,
            post_logout_redirect_uri: frontendUrl,
        });
    }

    generateCodeVerifier(): string {
        return generators.codeVerifier();
    }

    generateState(): string {
        return generators.state();
    }
}
