import { NbxplorerService, NBXplorerUtxo, NBXplorerUtxosResponse } from './NbxplorerService.js';
import { FourtySwapConfiguration } from './configuration.js';
import { Injectable } from '@nestjs/common';


@Injectable()
export class LiquidService {
    constructor(
        private nbxplorer: NbxplorerService,
        private swapConfig: FourtySwapConfiguration['swap'],
    ) {}

    async getUtxos(): Promise<NBXplorerUtxosResponse | void> {
        const utxoResponse = await this.nbxplorer.getUTXOs(this.swapConfig.liquidXpub, 'lbtc');
        if (!utxoResponse) {
            throw new Error('No UTXOs returned from NBXplorer');
        }
        return utxoResponse;
    }

    async getConfirmedUtxos(): Promise<NBXplorerUtxo[]> {
        const utxoResponse = await this.getUtxos();
        return utxoResponse?.confirmed.utxOs ?? [];
    }

    async getConfirmedUtxosAndInputValueForAmount(amount: number): Promise<{ 
        utxos: NBXplorerUtxo[], 
        totalInputValue: number,
    }> {
        let totalInputValue = 0;
        const confirmedUtxos = await this.getConfirmedUtxos();
        const selectedUtxos = [];
        for (const utxo of confirmedUtxos) {
            selectedUtxos.push(utxo);
            totalInputValue += Number(utxo.value);
            if (totalInputValue >= amount) {
                break;
            }
        }
        if (totalInputValue < amount) {
            throw new Error(`Insufficient funds, required ${amount} but only ${totalInputValue} available`);
        }
        return { utxos: selectedUtxos, totalInputValue };
    }
}

