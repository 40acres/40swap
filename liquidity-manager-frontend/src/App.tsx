import { Component } from 'solid-js';
import { Route, Router, A, RouteSectionProps } from '@solidjs/router';
import { Container, Navbar, Nav } from 'solid-bootstrap';
import { ChannelsPage } from './components/ChannelsPage';
import { Toaster } from 'solid-toast';
import 'bootstrap/dist/css/bootstrap.min.css';
import './app.scss';
import { SwapHistoryPage } from './components/SwapHistoryPage.js';

const Layout: Component<RouteSectionProps> = (props) => {
    return (
        <>
            <Navbar bg="dark" variant="dark" expand="lg" class="mb-4">
                <Container>
                    <Navbar.Brand>Lightning Liquidity Manager</Navbar.Brand>
                    <Navbar.Toggle />
                    <Navbar.Collapse>
                        <Nav class="ms-auto">
                            <Nav.Link as={A} href="/">
                                Channels
                            </Nav.Link>
                            <Nav.Link as={A} href="/history">
                                History
                            </Nav.Link>
                        </Nav>
                    </Navbar.Collapse>
                </Container>
            </Navbar>
            {props.children}
        </>
    );
};

const App: Component = () => {
    return (
        <>
            <Router root={Layout}>
                <Route path="/" component={ChannelsPage} />
                <Route path="/history" component={SwapHistoryPage} />
            </Router>
            <Toaster position="bottom-right" />
        </>
    );
};

export default App;
