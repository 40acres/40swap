import { Component } from 'solid-js';
import brandUrl from '/assets/brand.svg';
import elSalvadorUrl from '/assets/gobierno-de-el-salvador.png';
import twitterImgUrl from '/assets/twitter.svg';
import linkedinImgUrl from '/assets/linkedin.svg';
import { NavLinks } from './NavLinks.js';
import { Container } from 'solid-bootstrap';

export const Footer: Component = () => <>
    <footer>
        <Container class="footer">
            <div class="d-flex flex-column gap-3">
                <div><img src={brandUrl} /></div>
                <div><strong>40 ACRES, S.A. DE C.V.</strong><br />Company Registration No. 2024113630 - El Salvador</div>
                <div class="d-flex gap-3">
                    <a href="https://x.com/40acres_sv"><img src={twitterImgUrl} /></a>
                    <a href="https://www.linkedin.com/company/40acres/"><img src={linkedinImgUrl} /></a>
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