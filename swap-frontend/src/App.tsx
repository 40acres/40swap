import { Component, ParentComponent } from 'solid-js';
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
        <div id="main">
            <header>
                <Navbar class="mb-4 pt-4" expand="lg" collapseOnSelect>
                    <Container>
                        <Navbar.Brand class="fs-2" href="/">
                            <img src={logo} style="height: 3rem"/>
                        </Navbar.Brand>
                        <Nav class="justify-content-end gap-5">
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
                                <Nav.Link link href="/contact">Contact</Nav.Link>
                            </Nav.Item>
                        </Nav>
                    </Container>
                </Navbar>
            </header>
            {props.children}
        </div>
        <footer>TBD</footer>
        <Toaster toastOptions={{
            duration: 5000,
            position: 'bottom-right',
        }}/>
    </>;
};

const NarrowContainer: ParentComponent = (props) => {
    return <div style="width: 600px" class="mx-auto content">
        {props.children}
    </div>;
};

const WideContainer: ParentComponent = (props) => {
    return <Container class="content">
        {props.children}
    </Container>;
};

const App: Component = () => {
    return <Router root={Layout}>
        <Route path="/" component={() => <NarrowContainer><SwapForm /></NarrowContainer>} />
        <Route path="/swap/in/:id" component={() => <NarrowContainer><SwapInDetails /></NarrowContainer>} />
        <Route path="/swap/out/:id" component={() => <NarrowContainer><SwapOutDetails /></NarrowContainer>} />
        <Route path="/history" component={() => <WideContainer><History /></WideContainer>} />
        <Route path="/*" component={() => <WideContainer><h3 class="text-center">Page not found</h3></WideContainer>} />
    </Router>;
};

render(() => <App/>, document.getElementById('root') as HTMLElement);
