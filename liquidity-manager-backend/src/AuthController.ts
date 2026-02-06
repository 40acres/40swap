import { Controller, Get, Logger, Query, Req, Res, Session } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { OidcService } from './OidcService.js';
import { Public } from './PublicDecorator.js';
import { LiquidityManagerConfiguration } from './configuration.js';

interface SessionData {
    userId?: string;
    username?: string;
    email?: string;
    idToken?: string;
    accessToken?: string;
    codeVerifier?: string;
    state?: string;
    returnUrl?: string;
}

interface UserInfo {
    id: string;
    username?: string;
    email?: string;
}

interface SessionResponse {
    authenticated: boolean;
    user?: UserInfo;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
    private readonly logger = new Logger(AuthController.name);

    constructor(
        private readonly oidcService: OidcService,
        private readonly config: ConfigService<LiquidityManagerConfiguration>,
    ) {}

    @Get('login')
    @ApiOperation({ summary: 'Initiate OIDC login flow' })
    @ApiResponse({ status: 302, description: 'Redirect to Keycloak login page' })
    @Public()
    async login(@Session() session: SessionData, @Res() res: Response, @Query('returnUrl') returnUrl?: string): Promise<void> {
        const redirectUri = `${this.getBaseUrl()}/api/auth/callback`;
        const state = this.oidcService.generateState();
        const codeVerifier = this.oidcService.generateCodeVerifier();

        session.codeVerifier = codeVerifier;
        session.state = state;
        if (returnUrl) {
            session.returnUrl = returnUrl;
        }

        const authUrl = await this.oidcService.generateAuthUrl(redirectUri, state, codeVerifier);
        this.logger.log(`Redirecting to Keycloak: ${authUrl}`);
        res.redirect(authUrl);
    }

    @Get('callback')
    @ApiOperation({ summary: 'Handle OIDC callback' })
    @ApiResponse({ status: 302, description: 'Redirect to frontend after successful login' })
    @Public()
    async callback(@Query('code') code: string, @Query('state') state: string, @Session() session: SessionData, @Res() res: Response): Promise<void> {
        try {
            if (!code) {
                this.logger.error('No authorization code received');
                return res.redirect(this.getBaseUrl() + '?error=no_code');
            }

            if (state !== session.state) {
                this.logger.error('State mismatch');
                return res.redirect(this.getBaseUrl() + '?error=invalid_state');
            }

            const codeVerifier = session.codeVerifier;
            if (!codeVerifier) {
                this.logger.error('No code verifier in session');
                return res.redirect(this.getBaseUrl() + '?error=no_verifier');
            }

            const redirectUri = `${this.getBaseUrl()}/api/auth/callback`;
            const tokenSet = await this.oidcService.exchangeCodeForTokens(code, redirectUri, codeVerifier);

            const userInfo = await this.oidcService.getUserInfo(tokenSet.access_token!);

            session.userId = userInfo.sub as string;
            session.username = userInfo.preferred_username as string;
            session.email = userInfo.email as string;
            session.idToken = tokenSet.id_token;
            session.accessToken = tokenSet.access_token;

            delete session.codeVerifier;
            delete session.state;

            this.logger.log(`User ${session.username} authenticated successfully`);

            const returnUrl = session.returnUrl || this.getBaseUrl();
            delete session.returnUrl;
            res.redirect(returnUrl);
        } catch (error) {
            this.logger.error('Authentication callback error', error);
            this.logger.error((error as Error).stack ?? String(error));
            res.redirect(this.getBaseUrl() + '?error=auth_failed');
        }
    }

    @Get('logout')
    @ApiOperation({ summary: 'Logout and end session' })
    @ApiResponse({ status: 302, description: 'Redirect to Keycloak logout' })
    logout(@Session() session: SessionData, @Req() req: Request, @Res() res: Response): void {
        const idToken = session.idToken;

        req.session.destroy((err) => {
            if (err) {
                this.logger.error('Error destroying session', err);
            }
        });

        if (idToken) {
            const logoutUrl = this.oidcService.getEndSessionUrl(idToken);
            this.logger.log(`Redirecting to Keycloak logout: ${logoutUrl}`);
            res.redirect(logoutUrl);
        } else {
            res.redirect(this.getBaseUrl());
        }
    }

    @Get('session')
    @ApiOperation({ summary: 'Get current session info' })
    @ApiResponse({ status: 200, description: 'Session information' })
    getSession(@Session() session: SessionData): SessionResponse {
        if (session.userId) {
            return {
                authenticated: true,
                user: {
                    id: session.userId,
                    username: session.username,
                    email: session.email,
                },
            };
        }
        return { authenticated: false };
    }

    private getBaseUrl(): string {
        const authConfig = this.config.getOrThrow('auth', { infer: true });
        return authConfig.baseUrl;
    }
}
