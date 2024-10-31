import { Component } from 'solid-js';
import brandUrl from '/assets/brand.svg';
import elSalvadorUrl from '/assets/gobierno-de-el-salvador.png';

export const Footer: Component = () => <>
    <footer>
        <div class="d-flex flex-column gap-3">
            <div><img src={brandUrl} /></div>
            <div><strong>40 ACRES, S.A. DE C.V.</strong><br />Company Registration No. 2024113630 - El Salvador</div>
            <div>Copyright © 2024 40Swap.com</div>
        </div>
        <div class="d-flex flex-column gap-3">
            <div><img src={elSalvadorUrl} /></div>
            <div><strong>BTC License</strong><br /> Codigo de registro: 664bd64379e50005ac479693</div>
        </div>
    </footer>
</>;
