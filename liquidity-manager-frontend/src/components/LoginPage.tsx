import { Component } from 'solid-js';
import { Container, Card, Button } from 'solid-bootstrap';
import { useAuth } from '../services/AuthContext';

export const LoginPage: Component = () => {
    const auth = useAuth();

    const handleLogin = () => {
        auth.login(window.location.pathname);
    };

    return (
        <Container class="d-flex justify-content-center align-items-center" style={{ 'min-height': '60vh' }}>
            <Card style={{ width: '400px' }}>
                <Card.Body>
                    <Card.Title class="text-center mb-4">
                        <h2>Lightning Liquidity Manager</h2>
                    </Card.Title>
                    <Card.Text class="text-center text-muted mb-4">
                        Please sign in to continue
                    </Card.Text>
                    <div class="d-grid">
                        <Button variant="primary" size="lg" onClick={handleLogin}>
                            Sign In with Keycloak
                        </Button>
                    </div>
                    <div class="text-center mt-3">
                        <small class="text-muted">
                            Test credentials:<br />
                            admin / admin123<br />
                            user1 / user123<br />
                            user2 / user123
                        </small>
                    </div>
                </Card.Body>
            </Card>
        </Container>
    );
};
