import { Component } from 'solid-js';
import { Container, Nav, Navbar, Tab, Tabs } from 'solid-bootstrap';
import Fa from 'solid-fa';
import { faAddressBook } from '@fortawesome/free-solid-svg-icons';
import './app.scss';
import { render } from 'solid-js/web';
import 'solid-devtools';
import { SwapInDetails } from './SwapInDetails.js';
import { SwapOutDetails } from './SwapOutDetails.js';
import { Route, Router, RouteSectionProps } from '@solidjs/router';
import { Toaster } from 'solid-toast';
import { SwapInForm } from './SwapInForm.js';
import { SwapOutForm } from './SwapOutForm.js';
import { History } from './History.js';

const Layout: Component<RouteSectionProps> = (props) => {
    return <>
        <Navbar class="mb-4" expand="lg" collapseOnSelect>
            <Container>
                <Navbar.Brand class="fs-2" href="/">
                    <Fa icon={faAddressBook} size="lg" /> 40Swap
                </Navbar.Brand>
                <Nav class="me-auto">
                    <Nav.Link link href="/history">History</Nav.Link>
                </Nav>
            </Container>
        </Navbar>
        <Container fluid id='main'>
            {props.children}
        </Container>
        <Toaster toastOptions={{
            duration: 5000,
            position: 'bottom-right',
        }}/>
    </>;
};

const Home: Component = () => {
    return <div style="width: 450px" class="border border-primary mx-auto p-3">
        <Tabs defaultActiveKey="swap-in" class="mb-3">
            <Tab title="Swap In" eventKey="swap-in">
                <SwapInForm/>
            </Tab>
            <Tab title="Swap Out" eventKey="swap-out">
                <SwapOutForm/>
            </Tab>
        </Tabs>
    </div>;
};

const App: Component = () => {
    return <Router root={Layout}>
        <Route path="/" component={Home} />
        <Route path="/swap/in/:id" component={SwapInDetails} />
        <Route path="/swap/out/:id" component={SwapOutDetails} />
        <Route path="/history" component={History} />
    </Router>;
};

render(() => <App/>, document.getElementById('root') as HTMLElement);
