import * as yaml from 'js-yaml';
import fs from 'fs';
import path from 'path';
import { homedir } from 'os';
import assert from 'assert';
import { z } from 'zod';
import moment from 'moment';

const YAML_CONFIG_FILENAME = '40swap.conf.yaml';

const SEARCH_PATHS = [
    'dev',
    homedir(),
    '/etc',
    '/etc/40swap',
];

export const configSchema = z.object({
    server: z.object({
        port: z.number().int().positive(),
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
    bitcoin: z.object({
        network: z.enum(['bitcoin', 'regtest', 'testnet']),
        requiredConfirmations: z.number().int().nonnegative(),
    }),
    nbxplorer:  z.object({
        baseUrl: z.string().url(),
        fallbackFeeRate: z.number().int().positive(),
        longPollingTimeoutSeconds: z.number().int().positive().default(60),
    }),
    lnd: z.object({
        socket: z.string(),
        cert: z.string(),
        macaroon: z.string(),
    }),
    mempoolBlockExplorer: z.object({
        url: z.string().url(),
        useFeeEstimator: z.boolean().default(true),
    }),
    swap: z.object({
        feePercentage: z.number().nonnegative(),
        minimumAmount: z.number().positive(),
        maximumAmount: z.number().positive(),
        lockBlockDelta: z.object({
            in: z.number().int().positive(),
            out: z.number().int().positive(),
        }),
        expiryDuration: z.string()
            .transform(d => moment.duration(d))
            .refine(d => d.toISOString() !== 'P0D'),
    }),
});

export type FourtySwapConfiguration = z.infer<typeof configSchema>;

export default (): FourtySwapConfiguration => {
    const filePath = SEARCH_PATHS
        .map(p => path.join(p, YAML_CONFIG_FILENAME))
        .find(f => fs.existsSync(f));
    assert(filePath, 'config file not found');
    const config = yaml.load(fs.readFileSync(filePath).toString()) as object;

    const devFilePath = 'dev/40swap.lightning.yml';
    let devConfig: object|undefined;
    if (fs.existsSync(devFilePath)) {
        const devFileContent = fs.readFileSync(devFilePath).toString();
        devConfig = yaml.load(devFileContent) as object;
    }
    return configSchema.parse({
        ...config,
        ...devConfig,
    });
};