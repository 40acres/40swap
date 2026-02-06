import { Component } from 'solid-js';
import { Container, Card, Button } from 'solid-bootstrap';
import { useAuth } from '../services/AuthContext';

export const LoginPage: Component = () => {
    const auth = useAuth();

    const handleLogin = (): void => {
        auth.login(window.location.pathname);
    };

    return (
        <Container class="d-flex justify-content-center align-items-center" style={{ 'min-height': '60vh' }}>
            <Card style={{ width: '400px' }}>
                <Card.Body>
                    <Card.Title class="text-center mb-4">
                        <h2>Lightning Liquidity Manager</h2>
                    </Card.Title>
                    <Card.Text class="text-center text-muted mb-4">Please sign in to continue</Card.Text>
                    <div class="d-grid">
                        <Button variant="primary" size="lg" onClick={handleLogin}>
                            Sign In with Keycloak
                        </Button>
                    </div>
                </Card.Body>
            </Card>
        </Container>
    );
};
