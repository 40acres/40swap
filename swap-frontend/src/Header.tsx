import { Component, createSignal } from 'solid-js';
import { Container, Nav, Navbar, Offcanvas } from 'solid-bootstrap';
import logo from '/assets/brand.svg';
import { useBeforeLeave } from '@solidjs/router';
import { NavLinks } from './NavLinks.js';

export const Header: Component = () => {
    const [showOffCanvas, setShowOffCanvas] = createSignal(false);

    useBeforeLeave(e => setShowOffCanvas(false));

    return <>
        <Navbar class="mb-4 pt-4" expand="md" collapseOnSelect>
            <Container>
                <Navbar.Brand class="fs-2" href="https://www.40swap.com">
                    <img src={logo} style="height: 3rem"/>
                </Navbar.Brand>
                <Navbar.Toggle class="d-sm-block d-md-none" onClick={() => setShowOffCanvas(true)} />
                <Nav class="justify-content-end gap-5 d-none d-md-flex">
                    <NavLinks />
                </Nav>
                <Offcanvas show={showOffCanvas()} onHide={setShowOffCanvas(false)}>
                    <Offcanvas.Header closeButton>
                        <Offcanvas.Title>40Swap</Offcanvas.Title>
                    </Offcanvas.Header>
                    <Offcanvas.Body>
                        <Nav class="gap-3">
                            <NavLinks />
                        </Nav>
                    </Offcanvas.Body>
                </Offcanvas>
            </Container>
        </Navbar>
    </>;
};
