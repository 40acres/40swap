import { Component, For, Show } from 'solid-js';
import { Dropdown } from 'solid-bootstrap';
import { Asset } from '../controllers/AssetsConfiguration.js';
import { assetController } from '../controllers/AssetController.js';
import { AssetConfig } from '../controllers/AssetsConfiguration.js';


type AssetSelectorProps = {
    selectedAsset: Asset;
    counterpartyAsset: Asset;
    onAssetSelect: (asset: Asset) => void;
    disabled?: boolean;
}

export const AssetSelector: Component<AssetSelectorProps> = (props) => {
    function availableAssets(): AssetConfig[] {
        const assets = assetController.getAvailableAssetsForAsset(props.counterpartyAsset);
        return assets.filter((asset) => asset.name !== props.selectedAsset);
    }

    function hasAvailableAssets(): boolean {
        return availableAssets().length > 0;
    }

    return (
        <div class="fw-medium">
            <Show when={hasAvailableAssets()} fallback={
                <div class="d-flex align-items-center gap-2 border-0 p-2">
                    <img 
                        src={assetController.getIconForAsset(props.selectedAsset)} 
                        alt={assetController.getDisplayNameForAsset(props.selectedAsset)} 
                        draggable={false}
                    />
                    <span class="text-uppercase">
                        {assetController.getDisplayNameForAsset(props.selectedAsset)}
                    </span>
                </div>
            }>
                <Dropdown>
                    <Dropdown.Toggle 
                        variant="light" 
                        class="d-flex align-items-center gap-2 border-0 p-2"
                        disabled={props.disabled}
                    >
                        <img 
                            src={assetController.getIconForAsset(props.selectedAsset)} 
                            alt={assetController.getDisplayNameForAsset(props.selectedAsset)} 
                            draggable={false}
                        />
                        <span class="text-uppercase">
                            {assetController.getDisplayNameForAsset(props.selectedAsset)}
                        </span>
                    </Dropdown.Toggle>
                    <Dropdown.Menu class='w-100'>
                        <For each={availableAssets()}>
                            {(asset) => (
                                <Dropdown.Item 
                                    onClick={() => props.onAssetSelect(asset.name)}
                                    class="d-flex align-items-center gap-2"
                                >
                                    <img 
                                        src={assetController.getIconForAsset(asset.name)}
                                        alt={assetController.getDisplayNameForAsset(asset.name)}
                                        draggable={false}
                                    />
                                    <span class="text-uppercase">
                                        {assetController.getDisplayNameForAsset(asset.name)}
                                    </span>
                                </Dropdown.Item>
                            )}
                        </For>
                    </Dropdown.Menu>
                </Dropdown>
            </Show>
        </div>
    );
}; 