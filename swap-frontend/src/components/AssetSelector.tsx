import { Component, For } from 'solid-js';
import { Dropdown } from 'solid-bootstrap';
import { Asset } from '../utils.js';
import bitcoinLogo from '/assets/bitcoin-logo.svg';
import lightningLogo from '/assets/lightning-logo.svg';
import liquidLogo from '/assets/liquid-logo.svg';


type AssetSelectorProps = {
    selectedAsset: Asset;
    onAssetSelect: (asset: Asset) => void;
    disabled?: boolean;
    excludeAssets?: Asset[];
}

const AssetDetails: Record<Asset, {
    displayName: string;
    icon: string;
}> = {
    'ON_CHAIN_BITCOIN': {
        displayName: 'BTC',
        icon: bitcoinLogo,
    },
    'LIGHTNING_BITCOIN': {
        displayName: 'Lightning',
        icon: lightningLogo,
    },
    'ON_CHAIN_LIQUID': {
        displayName: 'Liquid',
        icon: liquidLogo,
    },
};

const AVAILABLE_ASSETS = [
    'ON_CHAIN_BITCOIN',
    'LIGHTNING_BITCOIN',
    'ON_CHAIN_LIQUID',
] as const;

export const AssetSelector: Component<AssetSelectorProps> = (props) => {
    const filteredAssets = (): Asset[] => 
        AVAILABLE_ASSETS.filter(asset => !props.excludeAssets?.includes(asset));

    return (
        <div class="fw-medium">
            <Dropdown>
                <Dropdown.Toggle 
                    variant="light" 
                    class="d-flex align-items-center gap-2 border-0 p-2"
                    disabled={props.disabled}
                >
                    <img 
                        src={AssetDetails[props.selectedAsset].icon} 
                        alt={AssetDetails[props.selectedAsset].displayName} 
                        draggable={false}
                    />
                    <span class="text-uppercase">
                        {AssetDetails[props.selectedAsset].displayName}
                    </span>
                </Dropdown.Toggle>
                <Dropdown.Menu class='w-100'>
                    <For each={filteredAssets()}>
                        {(asset) => (
                            <Dropdown.Item 
                                onClick={() => props.onAssetSelect(asset)}
                                class="d-flex align-items-center gap-2"
                            >
                                <img 
                                    src={AssetDetails[asset].icon}
                                    alt={AssetDetails[asset].displayName}
                                    draggable={false}
                                />
                                <span class="text-uppercase">
                                    {AssetDetails[asset].displayName}
                                </span>
                            </Dropdown.Item>
                        )}
                    </For>
                </Dropdown.Menu>
            </Dropdown>
        </div>
    );
}; 