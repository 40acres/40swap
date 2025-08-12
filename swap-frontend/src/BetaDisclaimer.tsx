import { Button, Modal } from 'solid-bootstrap';
import { Component, createSignal } from 'solid-js';
import logoUrl from '/logo.svg?url';
import brandUrl from '/brand.svg?url';

export const BetaDisclaimer: Component = () => {
    const [isModalOpen, setIsModalOpen] = createSignal(false);

    const openModal = (): void => {
        setIsModalOpen(true);
    };
    const closeModal = (): void => {
        setIsModalOpen(false);
    };

    return (
        <>
            {/* Floating Beta pill */}
            <div style="position: fixed; left: 16px; bottom: 16px; z-index: 2000;">
                <Button
                    size="sm"
                    class="fw-semibold text-uppercase rounded-pill shadow border-0 d-flex align-items-center gap-2 px-3"
                    style="background: linear-gradient(#6C2DB8, #4D73D8);"
                    onClick={openModal}
                    title="Beta notice"
                >
                    <img src={logoUrl} height="16" alt="40Swap" class="beta-pill-logo" />
                    Beta
                </Button>
            </div>

            {/* Modal */}
            <Modal show={isModalOpen()} onHide={closeModal} centered>
                <Modal.Header closeButton>
                    <Modal.Title>Beta version</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <div class="text-center mb-3">
                        <img src={brandUrl} style="height: 34px" alt="40Swap" />
                    </div>
                    <p class="mb-2">
                        This application is currently in <strong>beta</strong>. You may encounter issues, bugs, or occasional failures while using it.
                    </p>
                    <p class="mb-2">
                        If something fails, please contact us at <a href="mailto:support@40swap.com">support@40swap.com</a>.
                    </p>
                    <p class="mb-0">You can also try reloading the page to continue.</p>
                </Modal.Body>
                <Modal.Footer>
                    <div class="d-flex gap-2">
                        <Button variant="secondary" onClick={closeModal}>
                            Close
                        </Button>
                        <Button variant="primary" onClick={closeModal}>
                            Accept
                        </Button>
                    </div>
                </Modal.Footer>
            </Modal>
        </>
    );
};
