import { Component, createResource, createSignal, For, Show } from 'solid-js';
import { Button, Modal, Table } from 'solid-bootstrap';
import { applicationContext } from './ApplicationContext.js';
import { A } from '@solidjs/router';
import lightningIcon from '/assets/lightning-icon-monochrome.svg';
import bitcoinIcon from '/assets/bitcoin-icon-monochrome.svg';
import swapIcon from '/assets/swap-icon-monochrome.svg';
import { SwapType } from './utils.js';
import Fa from 'solid-fa';
import { faTrash } from '@fortawesome/free-solid-svg-icons';

const SwapTypeComponent: Component<{ type: SwapType }> = (props) => {
    const from = props.type === 'in' ? bitcoinIcon : lightningIcon;
    const to = props.type === 'in' ? lightningIcon : bitcoinIcon;

    return <><img src={from} /> <img src={swapIcon} /> <img src={to} /></>;
};


export const History: Component = () => {
    const { localSwapStorageService } = applicationContext;
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

    return <>
        <Show when={swaps()?.length ?? 0 > 0} fallback={<h3 class="text-center">No data</h3>}>
            <h3>Swap history</h3>
            <Table class="swap-history-table">
                <thead>
                    <tr>
                        <th>Type</th>
                        <th>Id</th>
                        <th>Date</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    <For each={swaps()}>{s => <>
                        <tr>
                            <td><SwapTypeComponent type={s.type} /></td>
                            <td><A href={`/swap/${s.type}/${s.swapId}`}>{s.swapId}</A></td>
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
    </>;
};
