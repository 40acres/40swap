import { Component, createSignal } from 'solid-js';
import { Button, ButtonProps, Spinner } from 'solid-bootstrap';
import { Show } from 'solid-js/web';
import { BsPrefixProps, ReplaceProps } from 'solid-bootstrap/src/helpers.js';

type ActionButtonProps = Omit<ButtonProps & { action: () => Promise<void> }, 'onClick'|'onclick'>;
type AllProps = Omit<ReplaceProps<'button', BsPrefixProps<'button'> & ActionButtonProps>, 'onclick'|'onClick'>;

export const ActionButton: Component<AllProps> = (props) => {
    const [waiting, setWaiting] = createSignal(false);

    async function onClick(): Promise<void> {
        setWaiting(true);
        await props.action();
        setWaiting(false);
    }

    return <Button {...props} onClick={onClick} disabled={props.disabled || waiting()}>
        <Show when={waiting()}>
            <Spinner animation="border" size="sm" />&nbsp;
        </Show>
        {props.children}
    </Button>;

};
