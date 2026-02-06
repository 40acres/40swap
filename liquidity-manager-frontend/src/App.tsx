import { Component, Show } from 'solid-js';
import { Route, Router, A, RouteSectionProps } from '@solidjs/router';
import { Container, Navbar, Nav, NavDropdown } from 'solid-bootstrap';
import { ChannelsPage } from './components/ChannelsPage';
import { Toaster } from 'solid-toast';
import 'bootstrap/dist/css/bootstrap.min.css';
import './app.scss';
import { SwapHistoryPage } from './components/SwapHistoryPage.js';
import { AuthProvider, useAuth } from './services/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';

const Layout: Component<RouteSectionProps> = (props) => {
    const auth = useAuth();

    return (
        <>
            <Navbar bg="dark" variant="dark" expand="lg" class="mb-4">
                <Container>
                    <Navbar.Brand>Lightning Liquidity Manager</Navbar.Brand>
                    <Navbar.Toggle />
                    <Navbar.Collapse>
                        <Nav class="ms-auto">
                            <Show when={auth.isAuthenticated()}>
                                <Nav.Link as={A} href="/">
                                    Channels
                                </Nav.Link>
                                <Nav.Link as={A} href="/history">
                                    History
                                </Nav.Link>
                                <NavDropdown title={auth.user()?.username || 'User'} id="user-dropdown">
                                    <NavDropdown.Item disabled>{auth.user()?.email}</NavDropdown.Item>
                                    <NavDropdown.Divider />
                                    <NavDropdown.Item onClick={() => auth.logout()}>Logout</NavDropdown.Item>
                                </NavDropdown>
                            </Show>
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
        <AuthProvider>
            <Router root={Layout}>
                <Route
                    path="/"
                    component={() => (
                        <ProtectedRoute>
                            <ChannelsPage />
                        </ProtectedRoute>
                    )}
                />
                <Route
                    path="/history"
                    component={() => (
                        <ProtectedRoute>
                            <SwapHistoryPage />
                        </ProtectedRoute>
                    )}
                />
            </Router>
            <Toaster position="bottom-right" />
        </AuthProvider>
    );
};

export default App;
