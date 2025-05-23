import { Component, createResource, createSignal, For, Show } from 'solid-js';
import { Button, Modal, Table } from 'solid-bootstrap';
import { applicationContext } from './ApplicationContext.js';
import { A } from '@solidjs/router';
import lightningIcon from '/lightning-icon-monochrome.svg?url';
import bitcoinIcon from '/bitcoin-icon-monochrome.svg?url';
import liquidIcon from '/liquid-logo-monochrome.svg?url';
import swapIcon from '/swap-icon-monochrome.svg?url';
import { SwapType } from './utils.js';
import Fa from 'solid-fa';
import { faTrash } from '@fortawesome/free-solid-svg-icons';
import moment from 'moment';
import { Chain } from '@40swap/shared';

const SwapTypeComponent: Component<{ type: SwapType, chain: Chain }> = (props) => {
    const from = props.type === 'in' ? bitcoinIcon : lightningIcon;
    let to = props.type === 'in' ? lightningIcon : bitcoinIcon;
    if (props.chain === 'LIQUID') {
        to = liquidIcon;
    }

    return <><img src={from} /> <img src={swapIcon} /> <img src={to} /></>;
};


export const History: Component = () => {
    const { localSwapStorageService } = applicationContext;
    let fileInputRef: HTMLInputElement|undefined;
    const [swaps, { refetch }] = createResource(async () => await localSwapStorageService.findAllLocally());

    const [swapToDelete, setSwapToDelete] = createSignal<string|undefined>();

    async function deleteSwap(): Promise<void> {
        const id = swapToDelete();
        if (id == null) {
            return;
        }
        await localSwapStorageService.delete(id);
        setSwapToDelete();
        refetch();
    }

    async function export_(): Promise<void> {
        const content = await localSwapStorageService.createBackup();
        const blob = new Blob([content], {type: 'application/json'});
        const elem = window.document.createElement('a');
        elem.href = window.URL.createObjectURL(blob);
        elem.download = `40swap_backup_${moment().format('YYYYMMD_HHmmss')}.json`;
        elem.click();
    }

    async function import_(target: HTMLInputElement): Promise<void> {
        const file = (target.files ?? [])[0];
        if (file == null) {
            return;
        }
        const reader = new FileReader();
        reader.readAsText(file, 'utf-8');
        reader.addEventListener('loadend', async () => {
            if (reader.result == null) {
                return;
            }
            fileInputRef!.value = '';
            try {
                await localSwapStorageService.restoreBackup(reader.result.toString());
                refetch();
            } catch (e) {
                console.log('Invalid backup file');
                console.error(e);
            }
        });
    }

    return <>
        <Show when={swaps()?.length ?? 0 > 0} fallback={<h3 class="text-center">No data</h3>}>
            <h3>Swap history</h3>
            <Table class="swap-history-table">
                <thead>
                    <tr>
                        <th>Type</th>
                        <th>Id</th>
                        <th>Chain</th>
                        <th>Date</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    <For each={swaps()}>{s => <>
                        <tr>
                            <td><SwapTypeComponent type={s.type} chain={s.chain} /></td>
                            <td><A href={`/swap/${s.type}/${s.swapId}`}>{s.swapId}</A></td>
                            <td>{s.chain}</td>
                            <td>{new Date(s.createdAt).toLocaleString()}</td>
                            <td><span onClick={() => setSwapToDelete(s.swapId)}><Fa icon={faTrash} /></span></td>
                        </tr>
                    </>}</For>
                </tbody>
            </Table>

            <Modal show={swapToDelete() != null} centered onHide={() => setSwapToDelete()}>
                <Modal.Header closeButton>
                    <Modal.Title>Confirmation</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    Are you sure you want to delete swap {swapToDelete()}?
                </Modal.Body>
                <Modal.Footer>
                    <div class="d-flex flex-grow-1 flex-shrink-0 gap-2">
                        <Button variant="secondary" onClick={() => setSwapToDelete()}>No</Button>
                        <Button variant="primary" onClick={() => deleteSwap()}>Yes</Button>
                    </div>
                </Modal.Footer>
            </Modal>
        </Show>
        <div class="d-flex gap-2 justify-content-end">
            <Button onclick={export_} disabled={swaps() == null || swaps()!.length === 0}>Export</Button>
            <Button variant="secondary" onClick={() => fileInputRef?.click()}>Import</Button>
            <input type="file" class="d-none" onChange={ev => import_(ev.target)} ref={fileInputRef!} />
        </div>
    </>;

};
