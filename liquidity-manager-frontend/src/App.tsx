import { Component } from 'solid-js';
import { Container, Navbar } from 'solid-bootstrap';
import { ChannelsPage } from './components/ChannelsPage';
import { Toaster } from 'solid-toast';
import 'bootstrap/dist/css/bootstrap.min.css';
import './app.scss';

const App: Component = () => {
    return (
        <>
            <Navbar bg="dark" variant="dark" expand="lg" class="mb-4">
                <Container>
                    <Navbar.Brand>Lightning Liquidity Manager</Navbar.Brand>
                </Container>
            </Navbar>
            <ChannelsPage />
            <Toaster position="top-right" />
        </>
    );
};

export default App;
