import { Component } from 'react';

// Catches a tab that failed to load. The usual cause is a connection that dropped while its code was being
// downloaded, or a new version going live while this page was open. Without this the whole app goes blank.
export default class PageBoundary extends Component {
  state = { failed: false };

  // Any error while this tab loads or renders switches to the fallback below
  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="rounded-3xl bg-lilac p-8">
        <p className="font-display text-xl font-medium">This page could not be loaded</p>
        <p className="note mt-1">Check your connection, then reload. Anything you scanned is still saved on this device.</p>
        {/* A page that failed to download is not retried by React, so the way out is a fresh load */}
        <button className="btn btn-primary mt-4" onClick={() => window.location.reload()}>Reload the app</button>
      </div>
    );
  }
}
