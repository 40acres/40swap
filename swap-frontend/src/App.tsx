import { Component } from 'solid-js';
import { Container, Navbar, Tab, Tabs } from 'solid-bootstrap';
import Fa from 'solid-fa';
import { faAddressBook } from '@fortawesome/free-solid-svg-icons';
import './app.scss';
import { render } from 'solid-js/web';
import 'solid-devtools';
import { SwapInComponent } from './SwapInComponent.js';
import { SwapOutComponent } from './SwapOutComponent.js';

const App: Component = () => {
    return <>
        <Navbar class="mb-4" expand="lg" collapseOnSelect>
            <Container>
                <Navbar.Brand class="fs-2">
                    <Fa icon={faAddressBook} size="lg" /> 40Swap
                </Navbar.Brand>
            </Container>
        </Navbar>
        <Container fluid id='main'>
            <div style="width: 450px" class="border border-primary mx-auto p-3">
                <Tabs defaultActiveKey="swap-in" class="mb-3">
                    <Tab title="Swap In" eventKey="swap-in">
                        <SwapInComponent />
                    </Tab>
                    <Tab title="Swap Out" eventKey="swap-out">
                        <SwapOutComponent />
                    </Tab>
                </Tabs>
            </div>
        </Container>
    </>;
};

render(() => <App />, document.getElementById('root') as HTMLElement);
