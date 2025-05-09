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
            minIn: z.number().int().positive().default(144),
            in: z.number().int().positive(),
            out: z.number().int().positive(),
        }),
        expiryDuration: z.string()
            .transform(d => moment.duration(d))
            .refine(d => d.toISOString() !== 'P0D'),
    }),
    elements: z.object({
        xpub: z.string(),
        rpcUrl: z.string().url(),
        rpcUsername: z.string(),
        rpcPassword: z.string(),
        esploraUrl: z.string().url(),
    }),
});

export type FourtySwapConfiguration = z.infer<typeof configSchema>;

export default (): FourtySwapConfiguration => {
    const filePath = SEARCH_PATHS
        .map(p => path.join(p, YAML_CONFIG_FILENAME))
        .find(f => fs.existsSync(f));
    assert(filePath, 'config file not found');
    const config = yaml.load(fs.readFileSync(filePath).toString()) as object;

    const lightningDevFilePath = 'dev/40swap.lightning.yml';
    let lightningDevConfig: object|undefined;
    if (fs.existsSync(lightningDevFilePath)) {
        const lightningDevFileContent = fs.readFileSync(lightningDevFilePath).toString();
        lightningDevConfig = yaml.load(lightningDevFileContent) as object;
    }
    const elementsDevFilePath = 'dev/40swap.elements.yml';
    let elementsDevConfig: object|undefined;
    if (fs.existsSync(elementsDevFilePath)) {
        const elementsDevFileContent = fs.readFileSync(elementsDevFilePath).toString();
        elementsDevConfig = yaml.load(elementsDevFileContent) as object;
    }
    return configSchema.parse({
        ...config,
        ...lightningDevConfig,
        ...elementsDevConfig,
    });
};