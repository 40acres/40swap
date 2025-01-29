/** @type {import('ts-jest').JestConfigWithTsJest} **/
export default {
    testEnvironment: 'node',
    transform: {
        '^.+.tsx?$': [
            'ts-jest', {
                tsconfig: 'test/tsconfig.json',
            },
        ],
    },
    roots: ['test'],
};