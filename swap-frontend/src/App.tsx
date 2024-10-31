import { Component, ParentComponent } from 'solid-js';
import { Container } from 'solid-bootstrap';
import './app.scss';
import { render } from 'solid-js/web';
import 'solid-devtools';
import { SwapInDetails } from './SwapInDetails.js';
import { SwapOutDetails } from './SwapOutDetails.js';
import { Route, Router, RouteSectionProps } from '@solidjs/router';
import { Toaster } from 'solid-toast';
import { History } from './History.js';
import { SwapForm } from './SwapForm.js';
import { Header } from './Header.js';
import { Footer } from './Footer.js';

const Layout: Component<RouteSectionProps> = (props) => {
    return <>
        <div id="main">
            <header>
                <Header />
            </header>
            {props.children}
        </div>
        <Footer />
        <Toaster toastOptions={{
            duration: 5000,
            position: 'bottom-right',
        }}/>
    </>;
};

const NarrowContainer: ParentComponent = (props) => {
    return <div style="max-width: 600px" class="mx-auto content">
        {props.children}
    </div>;
};

const WideContainer: ParentComponent = (props) => {
    return <Container class="content">
        {props.children}
    </Container>;
};

const App: Component = () => {
    return <Router root={Layout}>
        <Route path="/" component={() => <NarrowContainer><SwapForm /></NarrowContainer>} />
        <Route path="/swap/in/:id" component={() => <NarrowContainer><SwapInDetails /></NarrowContainer>} />
        <Route path="/swap/out/:id" component={() => <NarrowContainer><SwapOutDetails /></NarrowContainer>} />
        <Route path="/history" component={() => <WideContainer><History /></WideContainer>} />
        <Route path="/*" component={() => <WideContainer><h3 class="text-center">Page not found</h3></WideContainer>} />
    </Router>;
};

render(() => <App/>, document.getElementById('root') as HTMLElement);
