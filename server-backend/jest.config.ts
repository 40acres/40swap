import type { Config } from 'jest';
import { createDefaultEsmPreset } from 'ts-jest';

const presetConfig = createDefaultEsmPreset({
    //...options
});

export default {
    ...presetConfig,
    maxWorkers: 1,
} satisfies Config;
