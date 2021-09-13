import type * as Express from "express";

import path from "path";
import * as PathToRegexp from "path-to-regexp";

const shorthandReg = /^(?:((?:(?:^|,\s*)[A-Z]+)+)\s*)?(.+?)(?:\s*=>\s*(.+))?$/;
const moduleReg = /^(.+?)(?:#(.+))?$/;
const commaReg = /\s*,\s*/g;
const routeLookup = new WeakMap<MatchedRoute, Route>();

export interface RouteConfig {
  path?: string;
  route?: string;
  method?: string;
  methods?: string[];
  handler?: string;
  matchOptions?: PathToRegexp.TokensToRegexpOptions & PathToRegexp.ParseOptions;
  [x: string]: unknown;
}

export interface LoadModule {
  (id: string): unknown;
}

export interface MatchedRoute {
  path: string;
  params: Record<string | number, string[] | string | undefined>;
  config: Route["config"];
}

interface Route {
  path: string;
  test: RegExp;
  keys: PathToRegexp.Key[];
  methods: Set<string> | undefined;
  moduleId: string;
  moduleMethod: string | undefined;
  loading: Promise<void> | undefined;
  handler: Express.Handler | undefined;
  config: Record<string, unknown>;
}

const defaultLoader =
  typeof require === "function"
    ? (id: string) => require(path.resolve(id))
    : (id: string) => import(path.resolve(id));

const { configure, getMatch, match, invoke } = create();
export { configure, getMatch, match, invoke, create };

function create() {
  let activeRoutes: Route[] | undefined;
  let activeLoader: LoadModule | undefined;

  return {
    /**
     * @param routes A list of route configs with their metadata.
     * @param loader An optional function to override how route handlers are loaded.
     * @description
     * Sets the current routes for the middleware to match against.
     */
    configure(opts: { routes: (string | RouteConfig)[]; load?: LoadModule }) {
      activeRoutes = buildRoutes(opts.routes);
      activeLoader = opts.load || defaultLoader;
    },
    /**
     * @param req A request like object
     * @description
     * Returns a route match object.
     */
    getMatch(req: { path: string; method: string } | Express.Request) {
      if (!activeRoutes) {
        throw new Error(
          "meta-router: you must first call init() with the route config before calling getMatch()"
        );
      }
      return getMatchForRequest(req as Express.Request, activeRoutes);
    },
    /**
     * @description
     * Returns a middleware which will match one of the current routes.
     */
    match() {
      return (
        req: Express.Request,
        _res: Express.Response,
        next: Express.NextFunction
      ) => {
        if (!(activeRoutes && activeLoader)) {
          return next(
            new Error(
              "meta-router: you must first call init() with the route config before the match middleware runs"
            )
          );
        }

        const match = getMatchForRequest(req, activeRoutes);
        if (match) {
          const route = routeLookup.get((req.route = match))!;

          if (!(route.handler || route.loading)) {
            try {
              const mod = activeLoader(route.moduleId);
              if (isPromise(mod)) {
                route.loading = mod.then(
                  (mod) => setHandler(route, mod),
                  (err) => errorWhenInvoked(route, err)
                );
              } else {
                setHandler(route, mod);
              }
            } catch (err) {
              errorWhenInvoked(route, err as Error);
            }
          }
        }

        next();
      };
    },
    /**
     * @description
     * Returns a middleware which will execute the currently matched route handler.
     */
    invoke() {
      return (
        req: Express.Request,
        res: Express.Response,
        next: Express.NextFunction
      ) => {
        const route = req.route
          ? routeLookup.get(req.route as MatchedRoute)
          : undefined;
        if (route) {
          if (route.handler) {
            route.handler(req, res, next);
          } else {
            route.loading!.then(() => {
              route.handler!(req, res, next);
            });
          }
        } else {
          next();
        }
      };
    },
  };
}

function buildRoutes(routeConfigs: (string | RouteConfig)[]): Route[] {
  const routes: Route[] = [];
  for (const routeConfig of routeConfigs) {
    const config: Route["config"] = {};
    let route: string | undefined;

    if (typeof routeConfig === "string") {
      route = routeConfig;
    } else {
      route = routeConfig.route || routeConfig.path;

      for (const key in routeConfig) {
        switch (key) {
          case "path":
          case "route":
          case "method":
          case "methods":
          case "handler":
          case "matchOptions":
            break;
          default:
            config[key] = routeConfig[key];
        }
      }
    }

    if (!route) {
      throw new Error("meta-router: a route path is required.");
    }

    const match = shorthandReg.exec(route)!;
    const rawMethods = match[1]
      ? match[1].split(commaReg)
      : (routeConfig as RouteConfig).method
      ? [(routeConfig as RouteConfig).method!]
      : (routeConfig as RouteConfig).methods;
    const methods =
      rawMethods && !rawMethods.includes("ALL")
        ? new Set(rawMethods)
        : undefined;
    const [, , path, rawModule = (routeConfig as RouteConfig).handler] = match;

    if (!rawModule) {
      throw new Error("meta-router: a route handler is required.");
    }

    const [, moduleId, moduleMethod] = moduleReg.exec(rawModule)!;
    const keys: Route["keys"] = [];

    try {
      const test = PathToRegexp.pathToRegexp(
        path,
        keys,
        (routeConfig as RouteConfig).matchOptions
      );

      routes.push({
        path,
        test,
        keys,
        methods,
        moduleId,
        moduleMethod,
        loading: undefined,
        handler: undefined,
        config,
      });
    } catch (err) {
      (err as Error).message += ` (while parsing "${path}" in "${route}")`;
      throw err;
    }
  }

  return routes;
}

function getMatchForRequest(req: Express.Request, routes: Route[]) {
  for (const route of routes) {
    if (route.methods && !route.methods.has(req.method)) {
      continue;
    }

    const match = route.test.exec(req.path);

    if (!match) {
      continue;
    }

    const [path] = match;
    const params: MatchedRoute["params"] = {};

    for (let i = route.keys.length; i--; ) {
      const key = route.keys[i];
      let val: undefined | string | string[] = match[i + 1];

      if (val !== undefined) {
        if (key.modifier === "*" || key.modifier === "+") {
          val = val.split("/").map(decodeURIComponent);
        } else {
          val = decodeURIComponent(val);
        }
      }

      params[key.name] = val;
    }

    const result: MatchedRoute = {
      path,
      params,
      config: route.config,
    };

    routeLookup.set(result, route);
    return result;
  }
}

function setHandler(route: Route, val: unknown) {
  const fn =
    val &&
    (route.moduleMethod
      ? (val as Record<string, unknown>)[route.moduleMethod]
      : (val as Record<string, unknown>).default || val);

  if (typeof fn !== "function") {
    throw new Error(
      `meta-router: unable to load module "${route.moduleId}"${
        route.moduleMethod ? ` with method "${route.moduleMethod}"` : ""
      }`
    );
  }

  route.loading = undefined;
  route.handler = fn as Express.Handler;
}

function errorWhenInvoked(route: Route, err: Error) {
  route.handler = () => {
    throw err;
  };
}

function isPromise(val: unknown): val is Promise<unknown> {
  return val ? typeof (val as Promise<unknown>).then === "function" : false;
}
