import { Component, createResource, For } from 'solid-js';
import { Container, Table } from 'solid-bootstrap';
import { applicationContext } from './ApplicationContext.js';
import { A } from '@solidjs/router';

export const History: Component = () => {
    const { localSwapStorageService } = applicationContext;
    const [swaps] = createResource(async () => await localSwapStorageService.findAllLocally());

    return <Container>
        <Table striped>
            <thead>
                <tr>
                    <th>Swap Id</th>
                    <th>Type</th>
                </tr>
            </thead>
            <tbody>
                <For each={swaps()}>{s => <>
                    <tr>
                        <td><A href={`/swap/${s.type}/${s.swapId}`}>{s.swapId}</A></td>
                        <td>{s.type}</td>
                    </tr>
                </>}</For>
            </tbody>
        </Table>
    </Container>;
};
