export interface AssetConfig {
    name: string;
    displayName: string;
    icon: string;
    available: boolean;
    restrictedAssets: string[];
}

export const assetsConfiguration = [
    {
        'name': 'ON_CHAIN_BITCOIN',
        'displayName': 'BTC',
        'icon': '/assets/bitcoin-logo.svg',
        'available': true,
        'restrictedAssets': [
            'ON_CHAIN_LIQUID',
        ],
    },
    {
        'name': 'LIGHTNING_BITCOIN',
        'displayName': 'Lightning',
        'icon': '/assets/lightning-logo.svg',
        'available': true,
        'restrictedAssets': [],
    },
    {
        'name': 'ON_CHAIN_LIQUID',
        'displayName': 'Liquid',
        'icon': '/assets/liquid-logo.svg',
        'available': false,
        'restrictedAssets': [
            'ON_CHAIN_BITCOIN',
        ],
    },
] as AssetConfig[];

export type Asset = typeof assetsConfiguration[number]['name'];

export interface AssetConfigWithTypes extends Omit<AssetConfig, 'name' | 'restrictedAssets'> {
    name: Asset;
    restrictedAssets: Asset[];
}

export const typedAssetsConfiguration: AssetConfigWithTypes[] = assetsConfiguration.map(asset => ({
    ...asset,
    name: asset.name,
    restrictedAssets: [...asset.restrictedAssets] as Asset[],
}));
