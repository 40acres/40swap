import { Component, ParentComponent, Show } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { useAuth } from '../services/AuthContext';
import { LoginPage } from './LoginPage';
import { Container, Spinner } from 'solid-bootstrap';

export const ProtectedRoute: ParentComponent = (props) => {
    const auth = useAuth();

    return (
        <Show
            when={!auth.isLoading()}
            fallback={
                <Container class="d-flex justify-content-center align-items-center" style={{ 'min-height': '60vh' }}>
                    <Spinner animation="border" role="status">
                        <span class="visually-hidden">Loading...</span>
                    </Spinner>
                </Container>
            }
        >
            <Show when={auth.isAuthenticated()} fallback={<LoginPage />}>
                {props.children}
            </Show>
        </Show>
    );
};
