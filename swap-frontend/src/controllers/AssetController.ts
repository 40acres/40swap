export interface AssetConfig {
    name: string;
    displayName: string;
    icon: string;
    available: boolean;
    restrictedAssets: string[];
}

export const assetsConfiguration = [
    {
        name: 'ON_CHAIN_BITCOIN',
        displayName: 'BTC',
        icon: '/bitcoin-logo.svg',
        available: true,
        restrictedAssets: ['ON_CHAIN_LIQUID'],
    },
    {
        name: 'LIGHTNING_BITCOIN',
        displayName: 'Lightning',
        icon: '/lightning-logo.svg',
        available: true,
        restrictedAssets: [],
    },
    {
        name: 'ON_CHAIN_LIQUID',
        displayName: 'Liquid',
        icon: '/liquid-logo.svg',
        available: true,
        restrictedAssets: ['ON_CHAIN_BITCOIN'],
    },
] as AssetConfig[];

export type Asset = (typeof assetsConfiguration)[number]['name'];

export interface AssetConfigWithTypes extends Omit<AssetConfig, 'name' | 'restrictedAssets'> {
    name: Asset;
    restrictedAssets: Asset[];
}

export const typedAssetsConfiguration: AssetConfigWithTypes[] = assetsConfiguration.map((asset) => ({
    ...asset,
    name: asset.name,
    restrictedAssets: [...asset.restrictedAssets] as Asset[],
}));

export class AssetController {
    getAvailableAssets(): AssetConfig[] {
        return assetsConfiguration.filter((asset: AssetConfig) => asset.available);
    }

    getAssetConfigByName(asset: Asset): AssetConfig {
        const assetConfig = assetsConfiguration.find((a: AssetConfig) => a.name === asset);
        if (!assetConfig) {
            throw new Error(`Asset config not found for asset: ${asset}`);
        }
        return assetConfig;
    }

    getAvailableAssetsForAsset(asset: Asset): AssetConfig[] {
        const assetConfig = this.getAssetConfigByName(asset);
        return assetsConfiguration.filter((a: AssetConfig) => a.available && !assetConfig?.restrictedAssets.includes(a.name) && a.name !== asset);
    }

    getDisplayNameForAsset(asset: Asset): string {
        const assetConfig = this.getAssetConfigByName(asset);
        return assetConfig.displayName;
    }

    getIconForAsset(asset: Asset): string {
        const assetConfig = this.getAssetConfigByName(asset);
        return assetConfig.icon;
    }
}

// Create singleton instance
export const assetController = new AssetController();
