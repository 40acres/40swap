import { Component, For } from 'solid-js';
import { Dropdown } from 'solid-bootstrap';
import { AssetType } from '../utils.js';
import bitcoinLogo from '/assets/bitcoin-logo.svg';
import lightningLogo from '/assets/lightning-logo.svg';
import liquidLogo from '/assets/liquid-logo.svg';


type AssetSelectorProps = {
    selectedAsset: AssetType;
    onAssetSelect: (asset: AssetType) => void;
    disabled?: boolean;
}

const AssetDetails: Record<AssetType, {
    displayName: string;
    icon: string;
}> = {
    [AssetType.ON_CHAIN_BITCOIN]: {
        displayName: 'BTC',
        icon: bitcoinLogo,
    },
    [AssetType.LIGHTNING_BITCOIN]: {
        displayName: 'Lightning',
        icon: lightningLogo,
    },
    [AssetType.ON_CHAIN_LIQUID]: {
        displayName: 'Liquid',
        icon: liquidLogo,
    },
};

const AVAILABLE_ASSETS = [
    AssetType.ON_CHAIN_BITCOIN,
    AssetType.LIGHTNING_BITCOIN,
    AssetType.ON_CHAIN_LIQUID,
] as const;

export const AssetSelector: Component<AssetSelectorProps> = (props) => {
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
                    <For each={AVAILABLE_ASSETS}>
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