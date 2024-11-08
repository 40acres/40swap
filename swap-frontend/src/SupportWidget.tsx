import { Component } from 'solid-js';
import { Container } from 'solid-bootstrap';

export const SupportWidget: Component = () => <>
    <Container fluid class="support-widget" id="support">
        <h1 class="fw-bold">Ask support</h1>
        <span class="fs-5 fw-medium">
            If you encounter any issues with your swap, please reach out to us at <a href="mailto:support@40swap.com">support@40swap.com</a>
        </span>
    </Container>
</>;
