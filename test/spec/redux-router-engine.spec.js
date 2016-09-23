"use strict";

const Promise = require("bluebird");
const React = require("react");

const ReduxRouterEngine = require("../..");

const expect = require("chai").expect;
const sinon = require("sinon");

require("babel-register");

const createStore = require("redux").createStore;

const routes = require("../routes.jsx").default;
const badRoutes = require("../bad-routes.jsx").default;
const errorRoutes = require("../error-routes.jsx").default;
const RedirectRoute = require("../error-routes.jsx").RedirectRoute;
const getIndexRoutes = require("../get-index-routes.jsx").default;
const ErrorRoute = require("../get-index-routes.jsx").ErrorRoute;

const createReduxStore = () => Promise.resolve(createStore((state) => state, ["Use Redux"]));

describe("redux-router-engine", function () {

  let testReq;
  let sandbox;

  beforeEach(() => {
    testReq = {
      log: () => {
      },
      app: {},
      url: {}
    };

    sandbox = sinon.sandbox.create();
  });

  afterEach(() => {
    sandbox.restore();
  });

  it("should return 404 for unknown index route", () => {
    const engine = new ReduxRouterEngine({routes, createReduxStore});
    testReq.url.path = "/test/blah";

    return engine.render(testReq).then((result) => {
      expect(result.status).to.equal(404);
    });
  });

  it("should return string error", () => {
    const engine = new ReduxRouterEngine({routes: getIndexRoutes, createReduxStore});
    testReq.url.path = "/test";

    return engine.render(testReq).then((result) => {
      expect(result.status).to.equal(500);
      expect(result._err).to.equal("failed");
    });
  });


  it("should return Error error", () => {
    const engine = new ReduxRouterEngine({routes: ErrorRoute, createReduxStore});
    testReq.url.path = "/test";

    return engine.render(testReq).then((result) => {
      expect(result.status).to.equal(500);
      expect(result._err.message).to.equal("failed error");
    });
  });


  it("should resolve index route", () => {
    const engine = new ReduxRouterEngine({routes, createReduxStore});
    testReq.url.path = "/test";

    return engine.render(testReq).then((result) => {
      expect(result.status).to.equal(200);
    });
  });

  it("should bootstrap a redux store if redux option is passed in", () => {
    const engine = new ReduxRouterEngine({routes, createReduxStore});
    testReq.url.path = "/test";

    return engine.render(testReq).then((result) => {
      expect(result.prefetch).to.contain(`window.__PRELOADED_STATE__ = ["Use Redux"];`);
    });
  });

  it("should bootstrap a redux store with a custom stringify method", () => {
    const stringifyPreloadedState = (storeState) => {
      return `window.__REDUX_INITIAL_STATE__ = ${JSON.stringify(storeState)};`;
    };
    const engine = new ReduxRouterEngine({routes, createReduxStore, stringifyPreloadedState });
    testReq.url.path = "/test";

    return engine.render(testReq).then((result) => {
      expect(result.prefetch).to.contain(`window.__REDUX_INITIAL_STATE__ = ["Use Redux"];`);
    });
  });

  it("should redirect redirect route", () => {
    const engine = new ReduxRouterEngine({routes, createReduxStore});
    testReq.url.path = "/test/source";

    return engine.render(testReq).then((result) => {
      expect(result.status).to.equal(302);
      expect(result.path).to.equal("/test/target");
    });
  });

  it("should return 500 for invalid component", () => {
    const engine = new ReduxRouterEngine({routes: badRoutes, createReduxStore});
    testReq.url.path = "/test";

    return engine.render(testReq).then((result) => {
      expect(result.status).to.equal(500);
      expect(result._err.message)
        .to.contain("Page.render(): A valid React element (or null) must be returned");
    });
  });

  it("should return 404 if component throws 404", () => {
    const engine = new ReduxRouterEngine({routes: errorRoutes, createReduxStore});
    testReq.url.path = "/";

    return engine.render(testReq).then((result) => {
      expect(result.status).to.equal(404);
      expect(result._err).to.be.ok;
    });
  });

  it("should return 302 and redirect path if component throws related error", () => {
    const engine = new ReduxRouterEngine({routes: RedirectRoute, createReduxStore});
    testReq.url.path = "/redirect";

    return engine.render(testReq).then((result) => {
      expect(result.status).to.equal(302);
      expect(result.path).to.equal("/new/location");
      expect(result._err).to.be.ok;
    });
  });

  it("should populate react-id when requested", () => {
    const engine = new ReduxRouterEngine({routes, createReduxStore, withIds: true});
    testReq.url.path = "/test";

    return engine.render(testReq).then((result) => {
      expect(result.html).to.contain("data-reactid");
    });
  });

  it("should not populate react-id by default", () => {
    const engine = new ReduxRouterEngine({routes, createReduxStore});
    testReq.url.path = "/test";

    return engine.render(testReq).then((result) => {
      expect(result.html).to.not.contain("data-reactid");
    });
  });

  it("should use optional callbacks", () => {
    let error;
    const engine = new ReduxRouterEngine({
      routes,
      createReduxStore,
      stringifyPreloadedState: () => `window.__TEST_STATE__`,
      renderToString: () => "test"
    });
    testReq.url.path = "/test";

    return engine.render(testReq)
      .then((result) => {
        expect(result.prefetch).to.equal(`window.__TEST_STATE__`);
        expect(result.html).to.equal("test");
        return new ReduxRouterEngine({
          routes: badRoutes,
          createReduxStore,
          logError: (req, err) => {
            error = err;
          }
        }).render(testReq);
      })
      .then((result) => {
        expect(result.status).to.equal(500);
        expect(error).to.not.equal(undefined);
      });
  });

  it("should override constructor prop with render prop", () => {
    const engine = new ReduxRouterEngine({routes, createReduxStore, withIds: true});
    testReq.url.path = "/test";

    return engine.render(testReq, {withIds: false}).then((result) => {
      expect(result.html).to.not.contain("data-reactid");
    });
  });

  it("should log rendering time when profileRenderingTime is true", () => {
    const spy = sandbox.spy();
    const engine = new ReduxRouterEngine({
      routes, createReduxStore, profileRenderingTime: true
    });
    testReq.url.path = "/test";
    testReq.log = spy;

    return engine.render(testReq).then((result) => {
      const spyArgs = spy.args[0];

      expect(result).to.have.property("status", 200);
      expect(spy).to.be.calledOnce;
      expect(spyArgs[0]).to.deep.equal(["info", "logmon", "splunk", "perf"]);
      expect(spyArgs[1]).to.have.property("url", testReq.url.path);
      expect(spyArgs[1]).to.have.property("ssrtime").that.is.a("number");
    });
  });

  it("should filter the store state when filterState method is passed", () => {
    const reduxStore = () => Promise.resolve(createStore((state) => state, {
      a: "a",
      b: "b",
      c: {
        d: "d"
      }
    }));

    const filterState = (state) => {
      // we want to filter c from the state and return only a,b properties
      const newState = Object.assign({}, state);
      delete newState.c;
      return newState;
    };

    const engine = new ReduxRouterEngine({
      routes, createReduxStore: reduxStore, filterState
    });
    testReq.url.path = "/test";

    return engine.render(testReq).then((result) => {
      expect(result.prefetch).to.contain(`window.__PRELOADED_STATE__ = {"a":"a","b":"b"};`);
    });
  });

  it("should apply a passed componentWrapper", () => {
    class TestComponentWrapper extends React.Component {
      render() {
        return React.createElement(
          "div",
          {
            id: this.props.testId
          },
          this.props.children
        );
      }
    }

    TestComponentWrapper.propTypes = {
      testId: React.PropTypes.string
    };

    const componentWrapper = (createElement, req, renderProps, element) => { // eslint-disable-line
      return createElement(
        TestComponentWrapper,
        {
          testId: "test-wrap"
        },
        element
      );
    };

    const engine = new ReduxRouterEngine({routes, createReduxStore, componentWrapper});
    testReq.url.path = "/test";

    return engine.render(testReq).then((result) => {
      expect(result.html).to.contain(`id="test-wrap"`);
    });
  });

});
