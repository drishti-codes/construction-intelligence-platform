import React from "react";

// Last line of defence: if any component throws while rendering, show a message instead of a blank page.
export default class ErrorBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidUpdate(prev) {
    if (prev.resetKey !== this.props.resetKey && this.state.failed) this.setState({ failed: false });
  }
  render() {
    if (this.state.failed) {
      return (
        <div className="panel">
          <div className="error" role="alert">Something unexpected happened while showing this screen. Switch tabs or reload the page and try again.</div>
        </div>
      );
    }
    return this.props.children;
  }
}
