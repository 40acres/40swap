import * as yaml from 'js-yaml';
import fs from 'fs';
import path from 'path';
import { homedir } from 'os';
import { z } from 'zod';
import assert from 'node:assert';

const YAML_CONFIG_FILENAME = 'liquidity-manager.conf.yaml';

const SEARCH_PATHS = ['dev', homedir(), '/etc', '/etc/40swap'];

export const configSchema = z.object({
    server: z.object({
        port: z.number().int().positive(),
        environment: z.enum(['production', 'development']).optional(),
    }),
    db: z.object({
        host: z.string(),
        port: z.number().int().positive(),
        username: z.string(),
        password: z.string(),
        database: z.string(),
        synchronize: z.boolean().default(false),
        migrationsRun: z.boolean().default(true),
    }),
    lnd: z.object({
        socket: z.string(),
        cert: z.string(),
        macaroon: z.string(),
    }),
    bitfinex: z.object({
        apiKey: z.string(),
        apiSecret: z.string(),
    }),
    elements: z.object({
        rpcUrl: z.string(),
        rpcUsername: z.string(),
        rpcPassword: z.string(),
        rpcWallet: z.string(),
    }),
});

export type LiquidityManagerConfiguration = z.infer<typeof configSchema>;

export default function (): LiquidityManagerConfiguration {
    const filePath = SEARCH_PATHS.map((p) => path.join(p, YAML_CONFIG_FILENAME)).find((f) => fs.existsSync(f));
    assert(filePath, 'config file not found');
    const config = yaml.load(fs.readFileSync(filePath).toString()) as object;

    const lightningDevFilePath = 'dev/liquidity-manager.lightning.yml';
    let lightningDevConfig: object | undefined;
    if (fs.existsSync(lightningDevFilePath)) {
        const lightningDevFileContent = fs.readFileSync(lightningDevFilePath).toString();
        lightningDevConfig = yaml.load(lightningDevFileContent) as object;
    }

    const mergedConfig: Record<string, unknown> = {
        ...config,
        ...lightningDevConfig,
    };
    return configSchema.parse(mergedConfig);
}
