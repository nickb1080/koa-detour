const urlgrey = require("urlgrey");

const methods = new Set(require("methods")
    .map(m => m.toUpperCase()));

const Route = require("./route");

class Detour {

  constructor (options = {}) {
    this._middleware = [];
    this._routes = [];
    this._handlers = Object.create(defaultHandlers);
    this._handleOk = rereturn;
    this._handleErr = rethrow;
    this._routeOptions = {
      strict: options.strict,
      sensitive: options.caseSensitive,
    };
  }

  middleware () {
    return (ctx, next) => this._dispatch(ctx, next);
  }

  _dispatch (ctx, next) {
    const path = urlgrey(ctx.req.url).path();
    const route = this._routes.find(r => r.match(path));

    if (route == null) return next();

    ctx.resource = route.resource;
    ctx.params = route.params(path);

    const method = ctx.req.method.toUpperCase();

    if (ctx.resource[method] == null) {
      if (method === "HEAD" && this._handlers.HEAD) {
        return this._handlers.HEAD(ctx, next, this);
      }

      if (method === "OPTIONS" && this._handlers.OPTIONS) {
        return this._handlers.OPTIONS(ctx);
      }

      return this._handlers.methodNotAllowed(ctx);
    }

    return pipeCtx(ctx, this._middleware)
      .then(() => ctx.resource[method](ctx))
      .then(result => this._handleOk(ctx, result))
      .catch(err => this._handleErr(ctx, err))
  }

  // to special-handle rejections
  handleError (fn) { this._handleErr = fn; return this; }

  // to special-handle resolutions
  handleSuccess (fn) { this._handleOk = fn; return this; }

  // add a general middleware
  use (fn) { this._middleware.push(fn); return this; }

  // tiny helper for plugins that want to call several methods on router
  apply (fn) { fn(this); return this; }

  route (path, resource) {
    validatePath(path);
    validateResource(resource);

    const route = new Route(path, resource, this._routeOptions);

    this._routes.push(route);
    return this;
  }

  handle (type, handler) {
    if (!defaultHandlers.hasOwnProperty(type)) {
      throw new Error(`Invalid \`type\` argument to \`handle()\`: ${type}`)
    }

    if (typeof handler !== "function") {
      throw new Error("Handler must be a function");
    }

    this._handlers[type] = handler;
    return this;
  }

  collection (path, pairObj) {
    if (pairObj.collection == null) {
      throw new Error("Detour.collection() requires an object with a `collection` property.  Path was: " + path);
    }

    if (pairObj.member) {
      this.route(path, pairObj.member);
    }

    this.route(parentPath(path), pairObj.collection);
    return this;
  }
}


const defaultHandlers = {
  methodNotAllowed (ctx) {
    const header = getMethods(ctx.resource).join(",");
    ctx.set("Allow", header)
    ctx.status = 405;
    ctx.body = "Method Not Allowed";
  },

  OPTIONS (ctx) {
    const header = getMethods(ctx.resource).join(",");
    ctx.set("Allow", header);
    ctx.status = 200;
    ctx.body = `Allow: ${header}`;
  },

  HEAD (ctx, next, router) {
    const {resource} = ctx;

    if (resource.GET == null) {
      return router._handlers.methodNotAllowed(ctx);
    }

    ctx.req.method = "GET";
    return router._dispatch(ctx, next);
  },
}


function pipeCtx (ctx, fns) {
  return fns.reduce(function (prms, fn) {
    return prms.then(() => fn(ctx));
  }, Promise.resolve());
}

function parentPath (path){
  const pieces = path.split("/");
  const last = pieces.pop();
  if (!last) {
    pieces.pop();
  }
  return pieces.join("/");
}

function validateResource (resource) {
  if (!Object.keys(resource).some(k => methods.has(k))) {
    throw new Error("Resource should have at least one key with a valid HTTP verb");
  }
}

function validatePath (path) {
  if (typeof path === "string") return;
  if (Array.isArray(path)) return;
  if (({}).toString.call(path) === "[object RegExp]") return;
  throw new Error(`Invalid path: ${path}`);
}

function getMethods (resource) {
  return Object.keys(resource)
    .filter(key => methods.has(key));
}

function rethrow (ctx, err) { throw err; }
function rereturn (ctx, value) { return value; }

module.exports = Detour;