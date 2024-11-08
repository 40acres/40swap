import { Component } from 'solid-js';
import { Nav } from 'solid-bootstrap';

export const NavLinks: Component = () => <>
    <Nav.Item>
        <Nav.Link link href="/">Swap</Nav.Link>
    </Nav.Item>
    <Nav.Item>
        <Nav.Link link href="/history">History</Nav.Link>
    </Nav.Item>
    <Nav.Item>
        <Nav.Link link href="/faq">FAQ</Nav.Link>
    </Nav.Item>
    <Nav.Item>
        <Nav.Link href="https://www.40acres.pro/contact">Contact</Nav.Link>
    </Nav.Item>
</>;