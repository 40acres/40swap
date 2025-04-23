import { Asset, AssetConfig, assetsConfiguration } from './AssetsConfiguration';


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
