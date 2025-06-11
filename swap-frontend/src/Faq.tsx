import { Component, createSignal, For, JSX, ParentComponent, Show } from 'solid-js';
import { Container } from 'solid-bootstrap';
import Fa from 'solid-fa';
import { faChevronDown, faChevronUp } from '@fortawesome/free-solid-svg-icons';

const faqItems: { title: string; body: JSX.Element }[] = [
    {
        title: 'What is a trustless swap?',
        body: (
            <>
                <p>Swaps are used to exchange move your on-chain bitcoin to the lightning network, or viceversa.</p>
                <p>
                    Trustless swaps use the smart contract capabilities of bitcoin to make sure that neither 40swap or yourself can control all the funds at the
                    same time. Either both transactions in the exchange happen, or none.
                </p>
            </>
        ),
    },
    {
        title: 'Why do I need swaps?',
        body: (
            <>
                <p>
                    When you use your lightining node to make payments regularly, you’re channels will eventually run out of outbound liquidity, which means
                    that you won’t be able to pay. Instead of closing existing channels and opening new ones, you can keep a stable channel set by “topping up”
                    your outbound liquidity. You need a BTC→LN swap for that.
                </p>
                <p>
                    On the contrary, if you use your node to receive payments, you need inbound liquidity, which can’t be obtained just by opening channels. If
                    you need inbound liquidity, you can simply do a LN→BTC swap.
                </p>
            </>
        ),
    },
    {
        title: 'What are the fees?',
        body: (
            <>
                <p>40swap charges a fee percentage (shown before you create a swap) for swaps in either direction.</p>
                <p>On top of that, LN→BTC swaps need to pay:</p>
                <ol>
                    <li>A lightning network fee for the lightning payment you send.</li>
                    <li>An on-chain mining fee for the transaction that sweeps the bitcoin from the smart contract into your address.</li>
                </ol>
                <p>Both these fees are paid by you.</p>
            </>
        ),
    },
    {
        title: 'How do I recover my money if things go wrong?',
        body: (
            <>
                <p>
                    If there is any problem with your LN→BTC swap, your lightning node will make sure that your lightning payment is reverted back to you after
                    expiration.
                </p>
                <p>
                    If there is a problem with your BTC→LN swap, you’ll have to wait until the on-chain contract expires (up to 24 hours). Then open the swap
                    through the website and click on “Get refund”.
                </p>
            </>
        ),
    },
    {
        title: 'Why should I trust 40swap?',
        body: (
            <>
                <p>
                    You don’t have to trust us, the smart contracts that we use for swaps keep you always in control of your funds. The code that signs your
                    bitcoin transactions is available in github, so you can verify what it does.
                </p>
            </>
        ),
    },
    {
        title: 'There are no 40swap accounts, how do I make sure I have access to my swaps?',
        body: (
            <>
                <p>
                    Your swap data is stored in the device you are using, which means that you can’t access it from any other device. If you clean your browsing
                    data, or use a privacy-enhanced browser such as the tor browser, you will lose access to your swap history, and your ability to claim
                    refunds.
                </p>
                <p>
                    Before you clean your browser data or close your tor browser session, please use the “Export” functionality in the “History” tab. Save the
                    exported file in a safe location, and you’ll be able to restore it later in any device.
                </p>
            </>
        ),
    },
    {
        title: 'Can I open a channel to the 40swap lightning node?',
        body: (
            <>
                <p>
                    Yes, our node pub key is&nbsp;
                    <a href="https://amboss.space/node/03488712604abc514c04c6f8c148f820df74522383dae0c94b4b9afa89b83288c1">
                        03488712604abc514c04c6f8c148f820df74522383dae0c94b4b9afa89b83288c1
                    </a>
                </p>
                <p>
                    If you want to keep a big channel with good liquidity at all times, please contact us at{' '}
                    <a href="mailto:support@40swap.com">support@40acres.pro</a>
                </p>
            </>
        ),
    },
];

const FaqItem: ParentComponent<{ title: string }> = (props) => {
    const [expanded, setExpanded] = createSignal(false);

    function flip(): void {
        setExpanded(!expanded());
    }

    return (
        <div class="faq-item">
            <div class="fw-medium fs-5">
                <span onclick={flip}>
                    <Fa icon={expanded() ? faChevronUp : faChevronDown} />
                </span>
                <span class="ms-3">{props.title}</span>
            </div>
            <Show when={expanded()}>
                <div class="mt-2">{props.children}</div>
            </Show>
        </div>
    );
};

export const Faq: Component = () => {
    return (
        <Container id="faq">
            <h1 class="text-center fw-bold">Frequently Asked Questions</h1>

            <ul class="mt-5 mb-5">
                <For each={faqItems}>
                    {(item) => (
                        <>
                            <FaqItem title={item.title}>{item.body}</FaqItem>
                        </>
                    )}
                </For>
            </ul>
        </Container>
    );
};
