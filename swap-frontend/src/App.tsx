import { Component } from 'solid-js';
import { Container, Nav, Navbar } from 'solid-bootstrap';
import './app.scss';
import { render } from 'solid-js/web';
import 'solid-devtools';
import { SwapInDetails } from './SwapInDetails.js';
import { SwapOutDetails } from './SwapOutDetails.js';
import { Route, Router, RouteSectionProps } from '@solidjs/router';
import { Toaster } from 'solid-toast';
import { History } from './History.js';
import logo from '/assets/brand.svg';
import { SwapForm } from './SwapForm.js';

const Layout: Component<RouteSectionProps> = (props) => {
    return <>
        <Navbar class="mb-4" expand="lg" collapseOnSelect>
            <Container>
                <Navbar.Brand class="fs-2" href="/">
                    <img src={logo} style="height: 3rem"/>
                </Navbar.Brand>
                <Nav class="me-auto">
                    <Nav.Link link href="/history">History</Nav.Link>
                </Nav>
            </Container>
        </Navbar>
        <div style="width: 600px; padding: 30px" class="mx-auto" id="main">
            {props.children}
        </div>
        <Toaster toastOptions={{
            duration: 5000,
            position: 'bottom-right',
        }}/>
    </>;
};

const App: Component = () => {
    return <Router root={Layout}>
        <Route path="/" component={SwapForm} />
        <Route path="/swap/in/:id" component={SwapInDetails} />
        <Route path="/swap/out/:id" component={SwapOutDetails} />
        <Route path="/history" component={History} />
    </Router>;
};

render(() => <App/>, document.getElementById('root') as HTMLElement);
