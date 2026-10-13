import React, { Component, lazy, Suspense, useContext, useState, type ComponentType, type ReactNode } from 'react';

import { PageLoading } from './PageLoading';
import { PageDataContext, PageDataGate } from './PageDataGate';

export class PageErrorBoundary extends Component<{
  children: ReactNode;
  onRetry: () => void;
}, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() { return { failed: true }; }

  render() {
    if (this.state.failed) {
      return <div role="alert" className="flex flex-col items-center gap-3 py-16 text-slate-700">
        <p>This page could not be loaded. Check your connection and try again.</p>
        <button className="rounded bg-blue-800 px-4 py-2 text-white" onClick={this.props.onRetry}>Try again</button>
        <button className="text-blue-800 underline" onClick={() => window.location.reload()}>Reload application</button>
      </div>;
    }
    return this.props.children;
  }
}

/** Recreate React.lazy after a rejection; resetting an error boundary alone
 * would keep throwing the rejected promise cached by React.lazy. */
export function lazyPage<P extends object>(load: () => Promise<{ default: ComponentType<P> }>, options: { gateData?: boolean } = {}): ComponentType<P> {
  const loadWithDataGate = async () => {
    const module = await load();
    return { default: function LoadedPage(props: P) {
      const state = useContext(PageDataContext);
      const Page = module.default;
      return state && options.gateData !== false ? <PageDataGate {...state}><Page {...props} /></PageDataGate> : <Page {...props} />;
    } };
  };
  return function LazyPage(props: P) {
    const [attempt, setAttempt] = useState(() => ({ number: 0, Page: lazy(loadWithDataGate) }));
    const Page = attempt.Page;
    return <PageErrorBoundary key={attempt.number} onRetry={() => setAttempt(previous => ({ number: previous.number + 1, Page: lazy(loadWithDataGate) }))}>
      <Suspense fallback={<PageLoading />}><Page {...props} /></Suspense>
    </PageErrorBoundary>;
  };
}
