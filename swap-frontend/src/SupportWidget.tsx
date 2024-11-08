import { Component } from 'solid-js';
import { Container } from 'solid-bootstrap';

export const SupportWidget: Component = () => <>
    <Container fluid class="support-widget">
        <h1 class="fw-semibold">Ask support</h1>
        <span class="fs-5">
            If you encounter any issues with your swap, please reach out to us at <a href="mailto:support@40swap.com">support@40swap.com</a>
        </span>
    </Container>
</>;
