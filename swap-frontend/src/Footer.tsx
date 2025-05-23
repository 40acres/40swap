import { Component } from 'solid-js';
import fortyAcresBrandUrl from '/40acres-brand.svg?url';
import elSalvadorUrl from '/gobierno-de-el-salvador.png?url';
import twitterImgUrl from '/twitter.svg?url';
import linkedinImgUrl from '/linkedin.svg?url';
import githubImgUrl from '/github.svg?url';
import { NavLinks } from './NavLinks.js';
import { Container } from 'solid-bootstrap';

export const Footer: Component = () => <>
    <footer>
        <Container class="footer">
            <div class="d-flex flex-column gap-3">
                <div><a href="https://40acres.pro"><img src={fortyAcresBrandUrl} /></a></div>
                <div><strong>40 ACRES, S.A. DE C.V.</strong><br />Company Registration No. 2024113630 - El Salvador</div>
                <div class="d-flex gap-3">
                    <a href="https://x.com/40acres_sv"><img src={twitterImgUrl} height="28" title="X" /></a>
                    <a href="https://www.linkedin.com/company/40acres/"><img src={linkedinImgUrl} height="28" title="LinkedIn" /></a>
                    <a href="https://github.com/40acres/40swap/"><img src={githubImgUrl} height="28" title="GitHub" /></a>
                </div>
                <div>Copyright © 2024 40Swap.com</div>
            </div>
            <div class="d-flex flex-column gap-3">
                <div><img src={elSalvadorUrl} /></div>
                <div><strong>BTC License</strong><br /> Codigo de registro: 664bd64379e50005ac479693</div>
            </div>
            <div class="d-flex flex-column gap-3">
                <NavLinks />
            </div>
        </Container>
    </footer>
</>;
