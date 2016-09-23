"use strict";

const Promise = require("bluebird");
const assert = require("assert");
const React = require("react");
const ReactDomServer = require("react-dom/server");
const ReactRouter = require("react-router");
const Provider = require("react-redux").Provider;

const THOUSAND = 1000.0;
const MILLION = 1000000.0;

class ReduxRouterEngine {
  constructor(options) {
    assert(options.routes, "Must provide react-router routes for redux-router-engine");
    assert(options.createReduxStore, "Must provide createReduxStore for redux-router-engine");

    this.options = options;

    this.options.withIds = !!options.withIds;

    this.options.profileRenderingTime = !!options.profileRenderingTime;

    if (!options.stringifyPreloadedState) {
      this.options.stringifyPreloadedState =
        (state) => `window.__PRELOADED_STATE__ = ${JSON.stringify(state)};`;
    }

    if (!this.options.logError) {
      this.options.logError = () => undefined;
    }

    if (this.options.renderToString) {
      this._renderToString = this.options.renderToString;
    }
  }

  render(req, options) {
    const location = req.path || (req.url && req.url.path);

    return this._matchRoute({routes: this.options.routes, location})
      .then((match) => {
        if (match.redirectLocation) {
          return {
            status: 302,
            path: `${match.redirectLocation.pathname}${match.redirectLocation.search}`
          };
        }

        if (!match.renderProps) {
          return {
            status: 404,
            message: `router-resolver: Path ${location} not found`
          };
        }

        return this._handleRender(req, match, options || {});
      })
      .catch((err) => {
        this.options.logError.call(this, req, err);
        return {
          status: err.status || 500, // eslint-disable-line
          message: err.message,
          path: err.path,
          _err: err
        };
      });
  }

  //
  // options: { routes, location: url_path }
  //
  _matchRoute(options) {
    return new Promise((resolve, reject) => {
      ReactRouter.match(options, (err, redirectLocation, renderProps) => {
        if (err) {
          reject(err);
        } else {
          resolve({redirectLocation, renderProps});
        }
      });
    });
  }

  _handleRender(req, match, options) {
    const withIds = options.withIds !== undefined ? options.withIds : this.options.withIds;
    const profileRenderingTime = options.profileRenderingTime !== undefined ?
      options.profileRenderingTime :
      this.options.profileRenderingTime;
    const filterState = this.options.filterState && typeof this.options.filterState === "function" ?
      this.options.filterState : null;

    const stringifyPreloadedState =
      options.stringifyPreloadedState || this.options.stringifyPreloadedState;

    return (options.createReduxStore || this.options.createReduxStore).call(this, req, match)
      .then((store) => {

        const startTime = profileRenderingTime && process.hrtime();
        const html = this._renderToString(req, store, match, withIds, startTime);

        if (profileRenderingTime) {
          const endTime = process.hrtime(startTime);
          const renderingTime = endTime[0] * THOUSAND + endTime[1] / MILLION;
          req.log(
            ["info", "logmon", "splunk", "perf"],
            {url: req.url.path, ssrtime: renderingTime}
          );
        }

        const storeState = filterState ? filterState(store.getState()) : store.getState();

        return {
          status: 200,
          html: html,
          prefetch: stringifyPreloadedState(storeState)
        };
      });

  }

  _renderToString(req, store, match, withIds) { // eslint-disable-line
    const element = React.createElement(
      Provider, {store},
      React.createElement(ReactRouter.RouterContext, match.renderProps)
    );


    return (withIds ? ReactDomServer.renderToString : ReactDomServer.renderToStaticMarkup)(
      this.options.componentWrapper && typeof this.options.componentWrapper === "function" ?
        this.options.componentWrapper(React.createElement, req, match.renderProps, element) :
        element
    );
  }
}

module.exports = ReduxRouterEngine;

