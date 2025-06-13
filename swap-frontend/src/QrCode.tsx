import { Component, createEffect } from 'solid-js';
import QRCodeStyling from 'qr-code-styling';

interface Props {
    data: string;
    image?: string;
    class?: string;
}

export const QrCode: Component<Props> = (props) => {
    let div: HTMLDivElement | undefined;

    createEffect(() => {
        const qr = new QRCodeStyling({
            width: 240,
            height: 240,
            data: props.data,
            margin: 0,
            qrOptions: {
                typeNumber: 0,
                mode: 'Byte',
                errorCorrectionLevel: 'Q',
            },
            dotsOptions: {
                type: 'square',
                color: '#000000',
            },
            cornersSquareOptions: {
                type: 'square',
                color: '#000000',
            },
            image: props.image,
            imageOptions: {
                margin: 0,
                imageSize: 0.2,
            },
            type: 'svg',
        });
        div?.replaceChildren();
        qr.append(div);
    });

    return <div ref={div} class={props.class}></div>;
};
