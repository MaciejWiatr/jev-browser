var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// node_modules/ms/index.js
var require_ms = __commonJS({
  "node_modules/ms/index.js"(exports2, module2) {
    var s = 1e3;
    var m = s * 60;
    var h = m * 60;
    var d = h * 24;
    var w = d * 7;
    var y = d * 365.25;
    module2.exports = function(val, options) {
      options = options || {};
      var type = typeof val;
      if (type === "string" && val.length > 0) {
        return parse(val);
      } else if (type === "number" && isFinite(val)) {
        return options.long ? fmtLong(val) : fmtShort(val);
      }
      throw new Error(
        "val is not a non-empty string or a valid number. val=" + JSON.stringify(val)
      );
    };
    function parse(str) {
      str = String(str);
      if (str.length > 100) {
        return;
      }
      var match = /^(-?(?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)?$/i.exec(
        str
      );
      if (!match) {
        return;
      }
      var n = parseFloat(match[1]);
      var type = (match[2] || "ms").toLowerCase();
      switch (type) {
        case "years":
        case "year":
        case "yrs":
        case "yr":
        case "y":
          return n * y;
        case "weeks":
        case "week":
        case "w":
          return n * w;
        case "days":
        case "day":
        case "d":
          return n * d;
        case "hours":
        case "hour":
        case "hrs":
        case "hr":
        case "h":
          return n * h;
        case "minutes":
        case "minute":
        case "mins":
        case "min":
        case "m":
          return n * m;
        case "seconds":
        case "second":
        case "secs":
        case "sec":
        case "s":
          return n * s;
        case "milliseconds":
        case "millisecond":
        case "msecs":
        case "msec":
        case "ms":
          return n;
        default:
          return void 0;
      }
    }
    function fmtShort(ms) {
      var msAbs = Math.abs(ms);
      if (msAbs >= d) {
        return Math.round(ms / d) + "d";
      }
      if (msAbs >= h) {
        return Math.round(ms / h) + "h";
      }
      if (msAbs >= m) {
        return Math.round(ms / m) + "m";
      }
      if (msAbs >= s) {
        return Math.round(ms / s) + "s";
      }
      return ms + "ms";
    }
    function fmtLong(ms) {
      var msAbs = Math.abs(ms);
      if (msAbs >= d) {
        return plural(ms, msAbs, d, "day");
      }
      if (msAbs >= h) {
        return plural(ms, msAbs, h, "hour");
      }
      if (msAbs >= m) {
        return plural(ms, msAbs, m, "minute");
      }
      if (msAbs >= s) {
        return plural(ms, msAbs, s, "second");
      }
      return ms + " ms";
    }
    function plural(ms, msAbs, n, name) {
      var isPlural = msAbs >= n * 1.5;
      return Math.round(ms / n) + " " + name + (isPlural ? "s" : "");
    }
  }
});

// node_modules/debug/src/common.js
var require_common = __commonJS({
  "node_modules/debug/src/common.js"(exports2, module2) {
    function setup(env) {
      createDebug.debug = createDebug;
      createDebug.default = createDebug;
      createDebug.coerce = coerce;
      createDebug.disable = disable;
      createDebug.enable = enable;
      createDebug.enabled = enabled;
      createDebug.humanize = require_ms();
      createDebug.destroy = destroy;
      Object.keys(env).forEach((key) => {
        createDebug[key] = env[key];
      });
      createDebug.names = [];
      createDebug.skips = [];
      createDebug.formatters = {};
      function selectColor(namespace) {
        let hash = 0;
        for (let i = 0; i < namespace.length; i++) {
          hash = (hash << 5) - hash + namespace.charCodeAt(i);
          hash |= 0;
        }
        return createDebug.colors[Math.abs(hash) % createDebug.colors.length];
      }
      createDebug.selectColor = selectColor;
      function createDebug(namespace) {
        let prevTime;
        let enableOverride = null;
        let namespacesCache;
        let enabledCache;
        function debug(...args) {
          if (!debug.enabled) {
            return;
          }
          const self = debug;
          const curr = Number(/* @__PURE__ */ new Date());
          const ms = curr - (prevTime || curr);
          self.diff = ms;
          self.prev = prevTime;
          self.curr = curr;
          prevTime = curr;
          args[0] = createDebug.coerce(args[0]);
          if (typeof args[0] !== "string") {
            args.unshift("%O");
          }
          let index = 0;
          args[0] = args[0].replace(/%([a-zA-Z%])/g, (match, format) => {
            if (match === "%%") {
              return "%";
            }
            index++;
            const formatter = createDebug.formatters[format];
            if (typeof formatter === "function") {
              const val = args[index];
              match = formatter.call(self, val);
              args.splice(index, 1);
              index--;
            }
            return match;
          });
          createDebug.formatArgs.call(self, args);
          const logFn = self.log || createDebug.log;
          logFn.apply(self, args);
        }
        debug.namespace = namespace;
        debug.useColors = createDebug.useColors();
        debug.color = createDebug.selectColor(namespace);
        debug.extend = extend;
        debug.destroy = createDebug.destroy;
        Object.defineProperty(debug, "enabled", {
          enumerable: true,
          configurable: false,
          get: () => {
            if (enableOverride !== null) {
              return enableOverride;
            }
            if (namespacesCache !== createDebug.namespaces) {
              namespacesCache = createDebug.namespaces;
              enabledCache = createDebug.enabled(namespace);
            }
            return enabledCache;
          },
          set: (v) => {
            enableOverride = v;
          }
        });
        if (typeof createDebug.init === "function") {
          createDebug.init(debug);
        }
        return debug;
      }
      function extend(namespace, delimiter) {
        const newDebug = createDebug(this.namespace + (typeof delimiter === "undefined" ? ":" : delimiter) + namespace);
        newDebug.log = this.log;
        return newDebug;
      }
      function enable(namespaces) {
        createDebug.save(namespaces);
        createDebug.namespaces = namespaces;
        createDebug.names = [];
        createDebug.skips = [];
        const split = (typeof namespaces === "string" ? namespaces : "").trim().replace(/\s+/g, ",").split(",").filter(Boolean);
        for (const ns of split) {
          if (ns[0] === "-") {
            createDebug.skips.push(ns.slice(1));
          } else {
            createDebug.names.push(ns);
          }
        }
      }
      function matchesTemplate(search, template) {
        let searchIndex = 0;
        let templateIndex = 0;
        let starIndex = -1;
        let matchIndex = 0;
        while (searchIndex < search.length) {
          if (templateIndex < template.length && (template[templateIndex] === search[searchIndex] || template[templateIndex] === "*")) {
            if (template[templateIndex] === "*") {
              starIndex = templateIndex;
              matchIndex = searchIndex;
              templateIndex++;
            } else {
              searchIndex++;
              templateIndex++;
            }
          } else if (starIndex !== -1) {
            templateIndex = starIndex + 1;
            matchIndex++;
            searchIndex = matchIndex;
          } else {
            return false;
          }
        }
        while (templateIndex < template.length && template[templateIndex] === "*") {
          templateIndex++;
        }
        return templateIndex === template.length;
      }
      function disable() {
        const namespaces = [
          ...createDebug.names,
          ...createDebug.skips.map((namespace) => "-" + namespace)
        ].join(",");
        createDebug.enable("");
        return namespaces;
      }
      function enabled(name) {
        for (const skip of createDebug.skips) {
          if (matchesTemplate(name, skip)) {
            return false;
          }
        }
        for (const ns of createDebug.names) {
          if (matchesTemplate(name, ns)) {
            return true;
          }
        }
        return false;
      }
      function coerce(val) {
        if (val instanceof Error) {
          return val.stack || val.message;
        }
        return val;
      }
      function destroy() {
        console.warn("Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`.");
      }
      createDebug.enable(createDebug.load());
      return createDebug;
    }
    module2.exports = setup;
  }
});

// node_modules/debug/src/browser.js
var require_browser = __commonJS({
  "node_modules/debug/src/browser.js"(exports2, module2) {
    exports2.formatArgs = formatArgs;
    exports2.save = save;
    exports2.load = load;
    exports2.useColors = useColors;
    exports2.storage = localstorage();
    exports2.destroy = /* @__PURE__ */ (() => {
      let warned = false;
      return () => {
        if (!warned) {
          warned = true;
          console.warn("Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`.");
        }
      };
    })();
    exports2.colors = [
      "#0000CC",
      "#0000FF",
      "#0033CC",
      "#0033FF",
      "#0066CC",
      "#0066FF",
      "#0099CC",
      "#0099FF",
      "#00CC00",
      "#00CC33",
      "#00CC66",
      "#00CC99",
      "#00CCCC",
      "#00CCFF",
      "#3300CC",
      "#3300FF",
      "#3333CC",
      "#3333FF",
      "#3366CC",
      "#3366FF",
      "#3399CC",
      "#3399FF",
      "#33CC00",
      "#33CC33",
      "#33CC66",
      "#33CC99",
      "#33CCCC",
      "#33CCFF",
      "#6600CC",
      "#6600FF",
      "#6633CC",
      "#6633FF",
      "#66CC00",
      "#66CC33",
      "#9900CC",
      "#9900FF",
      "#9933CC",
      "#9933FF",
      "#99CC00",
      "#99CC33",
      "#CC0000",
      "#CC0033",
      "#CC0066",
      "#CC0099",
      "#CC00CC",
      "#CC00FF",
      "#CC3300",
      "#CC3333",
      "#CC3366",
      "#CC3399",
      "#CC33CC",
      "#CC33FF",
      "#CC6600",
      "#CC6633",
      "#CC9900",
      "#CC9933",
      "#CCCC00",
      "#CCCC33",
      "#FF0000",
      "#FF0033",
      "#FF0066",
      "#FF0099",
      "#FF00CC",
      "#FF00FF",
      "#FF3300",
      "#FF3333",
      "#FF3366",
      "#FF3399",
      "#FF33CC",
      "#FF33FF",
      "#FF6600",
      "#FF6633",
      "#FF9900",
      "#FF9933",
      "#FFCC00",
      "#FFCC33"
    ];
    function useColors() {
      if (typeof window !== "undefined" && window.process && (window.process.type === "renderer" || window.process.__nwjs)) {
        return true;
      }
      if (typeof navigator !== "undefined" && navigator.userAgent && navigator.userAgent.toLowerCase().match(/(edge|trident)\/(\d+)/)) {
        return false;
      }
      let m;
      return typeof document !== "undefined" && document.documentElement && document.documentElement.style && document.documentElement.style.WebkitAppearance || // Is firebug? http://stackoverflow.com/a/398120/376773
      typeof window !== "undefined" && window.console && (window.console.firebug || window.console.exception && window.console.table) || // Is firefox >= v31?
      // https://developer.mozilla.org/en-US/docs/Tools/Web_Console#Styling_messages
      typeof navigator !== "undefined" && navigator.userAgent && (m = navigator.userAgent.toLowerCase().match(/firefox\/(\d+)/)) && parseInt(m[1], 10) >= 31 || // Double check webkit in userAgent just in case we are in a worker
      typeof navigator !== "undefined" && navigator.userAgent && navigator.userAgent.toLowerCase().match(/applewebkit\/(\d+)/);
    }
    function formatArgs(args) {
      args[0] = (this.useColors ? "%c" : "") + this.namespace + (this.useColors ? " %c" : " ") + args[0] + (this.useColors ? "%c " : " ") + "+" + module2.exports.humanize(this.diff);
      if (!this.useColors) {
        return;
      }
      const c = "color: " + this.color;
      args.splice(1, 0, c, "color: inherit");
      let index = 0;
      let lastC = 0;
      args[0].replace(/%[a-zA-Z%]/g, (match) => {
        if (match === "%%") {
          return;
        }
        index++;
        if (match === "%c") {
          lastC = index;
        }
      });
      args.splice(lastC, 0, c);
    }
    exports2.log = console.debug || console.log || (() => {
    });
    function save(namespaces) {
      try {
        if (namespaces) {
          exports2.storage.setItem("debug", namespaces);
        } else {
          exports2.storage.removeItem("debug");
        }
      } catch (error) {
      }
    }
    function load() {
      let r;
      try {
        r = exports2.storage.getItem("debug") || exports2.storage.getItem("DEBUG");
      } catch (error) {
      }
      if (!r && typeof process !== "undefined" && "env" in process) {
        r = process.env.DEBUG;
      }
      return r;
    }
    function localstorage() {
      try {
        return localStorage;
      } catch (error) {
      }
    }
    module2.exports = require_common()(exports2);
    var { formatters } = module2.exports;
    formatters.j = function(v) {
      try {
        return JSON.stringify(v);
      } catch (error) {
        return "[UnexpectedJSONParseError]: " + error.message;
      }
    };
  }
});

// node_modules/debug/src/node.js
var require_node = __commonJS({
  "node_modules/debug/src/node.js"(exports2, module2) {
    var tty = require("tty");
    var util = require("util");
    exports2.init = init;
    exports2.log = log;
    exports2.formatArgs = formatArgs;
    exports2.save = save;
    exports2.load = load;
    exports2.useColors = useColors;
    exports2.destroy = util.deprecate(
      () => {
      },
      "Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`."
    );
    exports2.colors = [6, 2, 3, 4, 5, 1];
    try {
      const supportsColor = require("supports-color");
      if (supportsColor && (supportsColor.stderr || supportsColor).level >= 2) {
        exports2.colors = [
          20,
          21,
          26,
          27,
          32,
          33,
          38,
          39,
          40,
          41,
          42,
          43,
          44,
          45,
          56,
          57,
          62,
          63,
          68,
          69,
          74,
          75,
          76,
          77,
          78,
          79,
          80,
          81,
          92,
          93,
          98,
          99,
          112,
          113,
          128,
          129,
          134,
          135,
          148,
          149,
          160,
          161,
          162,
          163,
          164,
          165,
          166,
          167,
          168,
          169,
          170,
          171,
          172,
          173,
          178,
          179,
          184,
          185,
          196,
          197,
          198,
          199,
          200,
          201,
          202,
          203,
          204,
          205,
          206,
          207,
          208,
          209,
          214,
          215,
          220,
          221
        ];
      }
    } catch (error) {
    }
    exports2.inspectOpts = Object.keys(process.env).filter((key) => {
      return /^debug_/i.test(key);
    }).reduce((obj, key) => {
      const prop = key.substring(6).toLowerCase().replace(/_([a-z])/g, (_, k) => {
        return k.toUpperCase();
      });
      let val = process.env[key];
      if (/^(yes|on|true|enabled)$/i.test(val)) {
        val = true;
      } else if (/^(no|off|false|disabled)$/i.test(val)) {
        val = false;
      } else if (val === "null") {
        val = null;
      } else {
        val = Number(val);
      }
      obj[prop] = val;
      return obj;
    }, {});
    function useColors() {
      return "colors" in exports2.inspectOpts ? Boolean(exports2.inspectOpts.colors) : tty.isatty(process.stderr.fd);
    }
    function formatArgs(args) {
      const { namespace: name, useColors: useColors2 } = this;
      if (useColors2) {
        const c = this.color;
        const colorCode = "\x1B[3" + (c < 8 ? c : "8;5;" + c);
        const prefix = `  ${colorCode};1m${name} \x1B[0m`;
        args[0] = prefix + args[0].split("\n").join("\n" + prefix);
        args.push(colorCode + "m+" + module2.exports.humanize(this.diff) + "\x1B[0m");
      } else {
        args[0] = getDate() + name + " " + args[0];
      }
    }
    function getDate() {
      if (exports2.inspectOpts.hideDate) {
        return "";
      }
      return (/* @__PURE__ */ new Date()).toISOString() + " ";
    }
    function log(...args) {
      return process.stderr.write(util.formatWithOptions(exports2.inspectOpts, ...args) + "\n");
    }
    function save(namespaces) {
      if (namespaces) {
        process.env.DEBUG = namespaces;
      } else {
        delete process.env.DEBUG;
      }
    }
    function load() {
      return process.env.DEBUG;
    }
    function init(debug) {
      debug.inspectOpts = {};
      const keys = Object.keys(exports2.inspectOpts);
      for (let i = 0; i < keys.length; i++) {
        debug.inspectOpts[keys[i]] = exports2.inspectOpts[keys[i]];
      }
    }
    module2.exports = require_common()(exports2);
    var { formatters } = module2.exports;
    formatters.o = function(v) {
      this.inspectOpts.colors = this.useColors;
      return util.inspect(v, this.inspectOpts).split("\n").map((str) => str.trim()).join(" ");
    };
    formatters.O = function(v) {
      this.inspectOpts.colors = this.useColors;
      return util.inspect(v, this.inspectOpts);
    };
  }
});

// node_modules/debug/src/index.js
var require_src = __commonJS({
  "node_modules/debug/src/index.js"(exports2, module2) {
    if (typeof process === "undefined" || process.type === "renderer" || process.browser === true || process.__nwjs) {
      module2.exports = require_browser();
    } else {
      module2.exports = require_node();
    }
  }
});

// node_modules/bezier-js/dist/bezier.cjs
var require_bezier = __commonJS({
  "node_modules/bezier-js/dist/bezier.cjs"(exports2, module2) {
    var __defProp = Object.defineProperty;
    var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
    var __getOwnPropNames2 = Object.getOwnPropertyNames;
    var __hasOwnProp = Object.prototype.hasOwnProperty;
    var __markAsModule = (target) => __defProp(target, "__esModule", { value: true });
    var __export = (target, all) => {
      for (var name in all)
        __defProp(target, name, { get: all[name], enumerable: true });
    };
    var __reExport = (target, module22, copyDefault, desc) => {
      if (module22 && typeof module22 === "object" || typeof module22 === "function") {
        for (let key of __getOwnPropNames2(module22))
          if (!__hasOwnProp.call(target, key) && (copyDefault || key !== "default"))
            __defProp(target, key, { get: () => module22[key], enumerable: !(desc = __getOwnPropDesc(module22, key)) || desc.enumerable });
      }
      return target;
    };
    var __toCommonJS = /* @__PURE__ */ ((cache) => {
      return (module22, temp) => {
        return cache && cache.get(module22) || (temp = __reExport(__markAsModule({}), module22, 1), cache && cache.set(module22, temp), temp);
      };
    })(typeof WeakMap !== "undefined" ? /* @__PURE__ */ new WeakMap() : 0);
    var bezier_exports = {};
    __export(bezier_exports, {
      Bezier: () => Bezier
    });
    var { abs, cos, sin, acos, atan2, sqrt, pow } = Math;
    function crt(v) {
      return v < 0 ? -pow(-v, 1 / 3) : pow(v, 1 / 3);
    }
    var pi = Math.PI;
    var tau = 2 * pi;
    var quart = pi / 2;
    var epsilon = 1e-6;
    var nMax = Number.MAX_SAFE_INTEGER || 9007199254740991;
    var nMin = Number.MIN_SAFE_INTEGER || -9007199254740991;
    var ZERO = { x: 0, y: 0, z: 0 };
    var utils = {
      Tvalues: [
        -0.06405689286260563,
        0.06405689286260563,
        -0.1911188674736163,
        0.1911188674736163,
        -0.3150426796961634,
        0.3150426796961634,
        -0.4337935076260451,
        0.4337935076260451,
        -0.5454214713888396,
        0.5454214713888396,
        -0.6480936519369755,
        0.6480936519369755,
        -0.7401241915785544,
        0.7401241915785544,
        -0.820001985973903,
        0.820001985973903,
        -0.8864155270044011,
        0.8864155270044011,
        -0.9382745520027328,
        0.9382745520027328,
        -0.9747285559713095,
        0.9747285559713095,
        -0.9951872199970213,
        0.9951872199970213
      ],
      Cvalues: [
        0.12793819534675216,
        0.12793819534675216,
        0.1258374563468283,
        0.1258374563468283,
        0.12167047292780339,
        0.12167047292780339,
        0.1155056680537256,
        0.1155056680537256,
        0.10744427011596563,
        0.10744427011596563,
        0.09761865210411388,
        0.09761865210411388,
        0.08619016153195327,
        0.08619016153195327,
        0.0733464814110803,
        0.0733464814110803,
        0.05929858491543678,
        0.05929858491543678,
        0.04427743881741981,
        0.04427743881741981,
        0.028531388628933663,
        0.028531388628933663,
        0.0123412297999872,
        0.0123412297999872
      ],
      arcfn: function(t2, derivativeFn) {
        const d = derivativeFn(t2);
        let l = d.x * d.x + d.y * d.y;
        if (typeof d.z !== "undefined") {
          l += d.z * d.z;
        }
        return sqrt(l);
      },
      compute: function(t2, points, _3d) {
        if (t2 === 0) {
          points[0].t = 0;
          return points[0];
        }
        const order = points.length - 1;
        if (t2 === 1) {
          points[order].t = 1;
          return points[order];
        }
        const mt = 1 - t2;
        let p = points;
        if (order === 0) {
          points[0].t = t2;
          return points[0];
        }
        if (order === 1) {
          const ret = {
            x: mt * p[0].x + t2 * p[1].x,
            y: mt * p[0].y + t2 * p[1].y,
            t: t2
          };
          if (_3d) {
            ret.z = mt * p[0].z + t2 * p[1].z;
          }
          return ret;
        }
        if (order < 4) {
          let mt2 = mt * mt, t22 = t2 * t2, a, b, c, d = 0;
          if (order === 2) {
            p = [p[0], p[1], p[2], ZERO];
            a = mt2;
            b = mt * t2 * 2;
            c = t22;
          } else if (order === 3) {
            a = mt2 * mt;
            b = mt2 * t2 * 3;
            c = mt * t22 * 3;
            d = t2 * t22;
          }
          const ret = {
            x: a * p[0].x + b * p[1].x + c * p[2].x + d * p[3].x,
            y: a * p[0].y + b * p[1].y + c * p[2].y + d * p[3].y,
            t: t2
          };
          if (_3d) {
            ret.z = a * p[0].z + b * p[1].z + c * p[2].z + d * p[3].z;
          }
          return ret;
        }
        const dCpts = JSON.parse(JSON.stringify(points));
        while (dCpts.length > 1) {
          for (let i = 0; i < dCpts.length - 1; i++) {
            dCpts[i] = {
              x: dCpts[i].x + (dCpts[i + 1].x - dCpts[i].x) * t2,
              y: dCpts[i].y + (dCpts[i + 1].y - dCpts[i].y) * t2
            };
            if (typeof dCpts[i].z !== "undefined") {
              dCpts[i].z = dCpts[i].z + (dCpts[i + 1].z - dCpts[i].z) * t2;
            }
          }
          dCpts.splice(dCpts.length - 1, 1);
        }
        dCpts[0].t = t2;
        return dCpts[0];
      },
      computeWithRatios: function(t2, points, ratios, _3d) {
        const mt = 1 - t2, r = ratios, p = points;
        let f1 = r[0], f2 = r[1], f3 = r[2], f4 = r[3], d;
        f1 *= mt;
        f2 *= t2;
        if (p.length === 2) {
          d = f1 + f2;
          return {
            x: (f1 * p[0].x + f2 * p[1].x) / d,
            y: (f1 * p[0].y + f2 * p[1].y) / d,
            z: !_3d ? false : (f1 * p[0].z + f2 * p[1].z) / d,
            t: t2
          };
        }
        f1 *= mt;
        f2 *= 2 * mt;
        f3 *= t2 * t2;
        if (p.length === 3) {
          d = f1 + f2 + f3;
          return {
            x: (f1 * p[0].x + f2 * p[1].x + f3 * p[2].x) / d,
            y: (f1 * p[0].y + f2 * p[1].y + f3 * p[2].y) / d,
            z: !_3d ? false : (f1 * p[0].z + f2 * p[1].z + f3 * p[2].z) / d,
            t: t2
          };
        }
        f1 *= mt;
        f2 *= 1.5 * mt;
        f3 *= 3 * mt;
        f4 *= t2 * t2 * t2;
        if (p.length === 4) {
          d = f1 + f2 + f3 + f4;
          return {
            x: (f1 * p[0].x + f2 * p[1].x + f3 * p[2].x + f4 * p[3].x) / d,
            y: (f1 * p[0].y + f2 * p[1].y + f3 * p[2].y + f4 * p[3].y) / d,
            z: !_3d ? false : (f1 * p[0].z + f2 * p[1].z + f3 * p[2].z + f4 * p[3].z) / d,
            t: t2
          };
        }
      },
      derive: function(points, _3d) {
        const dpoints = [];
        for (let p = points, d = p.length, c = d - 1; d > 1; d--, c--) {
          const list = [];
          for (let j = 0, dpt; j < c; j++) {
            dpt = {
              x: c * (p[j + 1].x - p[j].x),
              y: c * (p[j + 1].y - p[j].y)
            };
            if (_3d) {
              dpt.z = c * (p[j + 1].z - p[j].z);
            }
            list.push(dpt);
          }
          dpoints.push(list);
          p = list;
        }
        return dpoints;
      },
      between: function(v, m, M) {
        return m <= v && v <= M || utils.approximately(v, m) || utils.approximately(v, M);
      },
      approximately: function(a, b, precision) {
        return abs(a - b) <= (precision || epsilon);
      },
      length: function(derivativeFn) {
        const z = 0.5, len = utils.Tvalues.length;
        let sum = 0;
        for (let i = 0, t2; i < len; i++) {
          t2 = z * utils.Tvalues[i] + z;
          sum += utils.Cvalues[i] * utils.arcfn(t2, derivativeFn);
        }
        return z * sum;
      },
      map: function(v, ds, de, ts, te) {
        const d1 = de - ds, d2 = te - ts, v2 = v - ds, r = v2 / d1;
        return ts + d2 * r;
      },
      lerp: function(r, v1, v2) {
        const ret = {
          x: v1.x + r * (v2.x - v1.x),
          y: v1.y + r * (v2.y - v1.y)
        };
        if (v1.z !== void 0 && v2.z !== void 0) {
          ret.z = v1.z + r * (v2.z - v1.z);
        }
        return ret;
      },
      pointToString: function(p) {
        let s = p.x + "/" + p.y;
        if (typeof p.z !== "undefined") {
          s += "/" + p.z;
        }
        return s;
      },
      pointsToString: function(points) {
        return "[" + points.map(utils.pointToString).join(", ") + "]";
      },
      copy: function(obj) {
        return JSON.parse(JSON.stringify(obj));
      },
      angle: function(o, v1, v2) {
        const dx1 = v1.x - o.x, dy1 = v1.y - o.y, dx2 = v2.x - o.x, dy2 = v2.y - o.y, cross = dx1 * dy2 - dy1 * dx2, dot = dx1 * dx2 + dy1 * dy2;
        return atan2(cross, dot);
      },
      round: function(v, d) {
        const s = "" + v;
        const pos = s.indexOf(".");
        return parseFloat(s.substring(0, pos + 1 + d));
      },
      dist: function(p1, p2) {
        const dx = p1.x - p2.x, dy = p1.y - p2.y;
        return sqrt(dx * dx + dy * dy);
      },
      closest: function(LUT, point) {
        let mdist = pow(2, 63), mpos, d;
        LUT.forEach(function(p, idx) {
          d = utils.dist(point, p);
          if (d < mdist) {
            mdist = d;
            mpos = idx;
          }
        });
        return { mdist, mpos };
      },
      abcratio: function(t2, n) {
        if (n !== 2 && n !== 3) {
          return false;
        }
        if (typeof t2 === "undefined") {
          t2 = 0.5;
        } else if (t2 === 0 || t2 === 1) {
          return t2;
        }
        const bottom = pow(t2, n) + pow(1 - t2, n), top = bottom - 1;
        return abs(top / bottom);
      },
      projectionratio: function(t2, n) {
        if (n !== 2 && n !== 3) {
          return false;
        }
        if (typeof t2 === "undefined") {
          t2 = 0.5;
        } else if (t2 === 0 || t2 === 1) {
          return t2;
        }
        const top = pow(1 - t2, n), bottom = pow(t2, n) + top;
        return top / bottom;
      },
      lli8: function(x1, y1, x2, y2, x3, y3, x4, y4) {
        const nx = (x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4), ny = (x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4), d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
        if (d == 0) {
          return false;
        }
        return { x: nx / d, y: ny / d };
      },
      lli4: function(p1, p2, p3, p4) {
        const x1 = p1.x, y1 = p1.y, x2 = p2.x, y2 = p2.y, x3 = p3.x, y3 = p3.y, x4 = p4.x, y4 = p4.y;
        return utils.lli8(x1, y1, x2, y2, x3, y3, x4, y4);
      },
      lli: function(v1, v2) {
        return utils.lli4(v1, v1.c, v2, v2.c);
      },
      makeline: function(p1, p2) {
        return new Bezier(p1.x, p1.y, (p1.x + p2.x) / 2, (p1.y + p2.y) / 2, p2.x, p2.y);
      },
      findbbox: function(sections) {
        let mx = nMax, my = nMax, MX = nMin, MY = nMin;
        sections.forEach(function(s) {
          const bbox = s.bbox();
          if (mx > bbox.x.min)
            mx = bbox.x.min;
          if (my > bbox.y.min)
            my = bbox.y.min;
          if (MX < bbox.x.max)
            MX = bbox.x.max;
          if (MY < bbox.y.max)
            MY = bbox.y.max;
        });
        return {
          x: { min: mx, mid: (mx + MX) / 2, max: MX, size: MX - mx },
          y: { min: my, mid: (my + MY) / 2, max: MY, size: MY - my }
        };
      },
      shapeintersections: function(s1, bbox1, s2, bbox2, curveIntersectionThreshold) {
        if (!utils.bboxoverlap(bbox1, bbox2))
          return [];
        const intersections = [];
        const a1 = [s1.startcap, s1.forward, s1.back, s1.endcap];
        const a2 = [s2.startcap, s2.forward, s2.back, s2.endcap];
        a1.forEach(function(l1) {
          if (l1.virtual)
            return;
          a2.forEach(function(l2) {
            if (l2.virtual)
              return;
            const iss = l1.intersects(l2, curveIntersectionThreshold);
            if (iss.length > 0) {
              iss.c1 = l1;
              iss.c2 = l2;
              iss.s1 = s1;
              iss.s2 = s2;
              intersections.push(iss);
            }
          });
        });
        return intersections;
      },
      makeshape: function(forward, back, curveIntersectionThreshold) {
        const bpl = back.points.length;
        const fpl = forward.points.length;
        const start = utils.makeline(back.points[bpl - 1], forward.points[0]);
        const end = utils.makeline(forward.points[fpl - 1], back.points[0]);
        const shape = {
          startcap: start,
          forward,
          back,
          endcap: end,
          bbox: utils.findbbox([start, forward, back, end])
        };
        shape.intersections = function(s2) {
          return utils.shapeintersections(shape, shape.bbox, s2, s2.bbox, curveIntersectionThreshold);
        };
        return shape;
      },
      getminmax: function(curve, d, list) {
        if (!list)
          return { min: 0, max: 0 };
        let min2 = nMax, max2 = nMin, t2, c;
        if (list.indexOf(0) === -1) {
          list = [0].concat(list);
        }
        if (list.indexOf(1) === -1) {
          list.push(1);
        }
        for (let i = 0, len = list.length; i < len; i++) {
          t2 = list[i];
          c = curve.get(t2);
          if (c[d] < min2) {
            min2 = c[d];
          }
          if (c[d] > max2) {
            max2 = c[d];
          }
        }
        return { min: min2, mid: (min2 + max2) / 2, max: max2, size: max2 - min2 };
      },
      align: function(points, line) {
        const tx = line.p1.x, ty = line.p1.y, a = -atan2(line.p2.y - ty, line.p2.x - tx), d = function(v) {
          return {
            x: (v.x - tx) * cos(a) - (v.y - ty) * sin(a),
            y: (v.x - tx) * sin(a) + (v.y - ty) * cos(a)
          };
        };
        return points.map(d);
      },
      roots: function(points, line) {
        line = line || { p1: { x: 0, y: 0 }, p2: { x: 1, y: 0 } };
        const order = points.length - 1;
        const aligned = utils.align(points, line);
        const reduce = function(t2) {
          return 0 <= t2 && t2 <= 1;
        };
        if (order === 2) {
          const a2 = aligned[0].y, b2 = aligned[1].y, c2 = aligned[2].y, d2 = a2 - 2 * b2 + c2;
          if (d2 !== 0) {
            const m1 = -sqrt(b2 * b2 - a2 * c2), m2 = -a2 + b2, v12 = -(m1 + m2) / d2, v2 = -(-m1 + m2) / d2;
            return [v12, v2].filter(reduce);
          } else if (b2 !== c2 && d2 === 0) {
            return [(2 * b2 - c2) / (2 * b2 - 2 * c2)].filter(reduce);
          }
          return [];
        }
        const pa = aligned[0].y, pb = aligned[1].y, pc = aligned[2].y, pd = aligned[3].y;
        let d = -pa + 3 * pb - 3 * pc + pd, a = 3 * pa - 6 * pb + 3 * pc, b = -3 * pa + 3 * pb, c = pa;
        if (utils.approximately(d, 0)) {
          if (utils.approximately(a, 0)) {
            if (utils.approximately(b, 0)) {
              return [];
            }
            return [-c / b].filter(reduce);
          }
          const q3 = sqrt(b * b - 4 * a * c), a2 = 2 * a;
          return [(q3 - b) / a2, (-b - q3) / a2].filter(reduce);
        }
        a /= d;
        b /= d;
        c /= d;
        const p = (3 * b - a * a) / 3, p3 = p / 3, q = (2 * a * a * a - 9 * a * b + 27 * c) / 27, q2 = q / 2, discriminant = q2 * q2 + p3 * p3 * p3;
        let u1, v1, x1, x2, x3;
        if (discriminant < 0) {
          const mp3 = -p / 3, mp33 = mp3 * mp3 * mp3, r = sqrt(mp33), t2 = -q / (2 * r), cosphi = t2 < -1 ? -1 : t2 > 1 ? 1 : t2, phi = acos(cosphi), crtr = crt(r), t1 = 2 * crtr;
          x1 = t1 * cos(phi / 3) - a / 3;
          x2 = t1 * cos((phi + tau) / 3) - a / 3;
          x3 = t1 * cos((phi + 2 * tau) / 3) - a / 3;
          return [x1, x2, x3].filter(reduce);
        } else if (discriminant === 0) {
          u1 = q2 < 0 ? crt(-q2) : -crt(q2);
          x1 = 2 * u1 - a / 3;
          x2 = -u1 - a / 3;
          return [x1, x2].filter(reduce);
        } else {
          const sd = sqrt(discriminant);
          u1 = crt(-q2 + sd);
          v1 = crt(q2 + sd);
          return [u1 - v1 - a / 3].filter(reduce);
        }
      },
      droots: function(p) {
        if (p.length === 3) {
          const a = p[0], b = p[1], c = p[2], d = a - 2 * b + c;
          if (d !== 0) {
            const m1 = -sqrt(b * b - a * c), m2 = -a + b, v1 = -(m1 + m2) / d, v2 = -(-m1 + m2) / d;
            return [v1, v2];
          } else if (b !== c && d === 0) {
            return [(2 * b - c) / (2 * (b - c))];
          }
          return [];
        }
        if (p.length === 2) {
          const a = p[0], b = p[1];
          if (a !== b) {
            return [a / (a - b)];
          }
          return [];
        }
        return [];
      },
      curvature: function(t2, d1, d2, _3d, kOnly) {
        let num, dnm, adk, dk, k = 0, r = 0;
        const d = utils.compute(t2, d1);
        const dd = utils.compute(t2, d2);
        const qdsum = d.x * d.x + d.y * d.y;
        if (_3d) {
          num = sqrt(pow(d.y * dd.z - dd.y * d.z, 2) + pow(d.z * dd.x - dd.z * d.x, 2) + pow(d.x * dd.y - dd.x * d.y, 2));
          dnm = pow(qdsum + d.z * d.z, 3 / 2);
        } else {
          num = d.x * dd.y - d.y * dd.x;
          dnm = pow(qdsum, 3 / 2);
        }
        if (num === 0 || dnm === 0) {
          return { k: 0, r: 0 };
        }
        k = num / dnm;
        r = dnm / num;
        if (!kOnly) {
          const pk = utils.curvature(t2 - 1e-3, d1, d2, _3d, true).k;
          const nk = utils.curvature(t2 + 1e-3, d1, d2, _3d, true).k;
          dk = (nk - k + (k - pk)) / 2;
          adk = (abs(nk - k) + abs(k - pk)) / 2;
        }
        return { k, r, dk, adk };
      },
      inflections: function(points) {
        if (points.length < 4)
          return [];
        const p = utils.align(points, { p1: points[0], p2: points.slice(-1)[0] }), a = p[2].x * p[1].y, b = p[3].x * p[1].y, c = p[1].x * p[2].y, d = p[3].x * p[2].y, v1 = 18 * (-3 * a + 2 * b + 3 * c - d), v2 = 18 * (3 * a - b - 3 * c), v3 = 18 * (c - a);
        if (utils.approximately(v1, 0)) {
          if (!utils.approximately(v2, 0)) {
            let t2 = -v3 / v2;
            if (0 <= t2 && t2 <= 1)
              return [t2];
          }
          return [];
        }
        const d2 = 2 * v1;
        if (utils.approximately(d2, 0))
          return [];
        const trm = v2 * v2 - 4 * v1 * v3;
        if (trm < 0)
          return [];
        const sq = Math.sqrt(trm);
        return [(sq - v2) / d2, -(v2 + sq) / d2].filter(function(r) {
          return 0 <= r && r <= 1;
        });
      },
      bboxoverlap: function(b1, b2) {
        const dims = ["x", "y"], len = dims.length;
        for (let i = 0, dim, l, t2, d; i < len; i++) {
          dim = dims[i];
          l = b1[dim].mid;
          t2 = b2[dim].mid;
          d = (b1[dim].size + b2[dim].size) / 2;
          if (abs(l - t2) >= d)
            return false;
        }
        return true;
      },
      expandbox: function(bbox, _bbox) {
        if (_bbox.x.min < bbox.x.min) {
          bbox.x.min = _bbox.x.min;
        }
        if (_bbox.y.min < bbox.y.min) {
          bbox.y.min = _bbox.y.min;
        }
        if (_bbox.z && _bbox.z.min < bbox.z.min) {
          bbox.z.min = _bbox.z.min;
        }
        if (_bbox.x.max > bbox.x.max) {
          bbox.x.max = _bbox.x.max;
        }
        if (_bbox.y.max > bbox.y.max) {
          bbox.y.max = _bbox.y.max;
        }
        if (_bbox.z && _bbox.z.max > bbox.z.max) {
          bbox.z.max = _bbox.z.max;
        }
        bbox.x.mid = (bbox.x.min + bbox.x.max) / 2;
        bbox.y.mid = (bbox.y.min + bbox.y.max) / 2;
        if (bbox.z) {
          bbox.z.mid = (bbox.z.min + bbox.z.max) / 2;
        }
        bbox.x.size = bbox.x.max - bbox.x.min;
        bbox.y.size = bbox.y.max - bbox.y.min;
        if (bbox.z) {
          bbox.z.size = bbox.z.max - bbox.z.min;
        }
      },
      pairiteration: function(c1, c2, curveIntersectionThreshold) {
        const c1b = c1.bbox(), c2b = c2.bbox(), r = 1e5, threshold = curveIntersectionThreshold || 0.5;
        if (c1b.x.size + c1b.y.size < threshold && c2b.x.size + c2b.y.size < threshold) {
          return [
            (r * (c1._t1 + c1._t2) / 2 | 0) / r + "/" + (r * (c2._t1 + c2._t2) / 2 | 0) / r
          ];
        }
        let cc1 = c1.split(0.5), cc2 = c2.split(0.5), pairs = [
          { left: cc1.left, right: cc2.left },
          { left: cc1.left, right: cc2.right },
          { left: cc1.right, right: cc2.right },
          { left: cc1.right, right: cc2.left }
        ];
        pairs = pairs.filter(function(pair) {
          return utils.bboxoverlap(pair.left.bbox(), pair.right.bbox());
        });
        let results = [];
        if (pairs.length === 0)
          return results;
        pairs.forEach(function(pair) {
          results = results.concat(utils.pairiteration(pair.left, pair.right, threshold));
        });
        results = results.filter(function(v, i) {
          return results.indexOf(v) === i;
        });
        return results;
      },
      getccenter: function(p1, p2, p3) {
        const dx1 = p2.x - p1.x, dy1 = p2.y - p1.y, dx2 = p3.x - p2.x, dy2 = p3.y - p2.y, dx1p = dx1 * cos(quart) - dy1 * sin(quart), dy1p = dx1 * sin(quart) + dy1 * cos(quart), dx2p = dx2 * cos(quart) - dy2 * sin(quart), dy2p = dx2 * sin(quart) + dy2 * cos(quart), mx1 = (p1.x + p2.x) / 2, my1 = (p1.y + p2.y) / 2, mx2 = (p2.x + p3.x) / 2, my2 = (p2.y + p3.y) / 2, mx1n = mx1 + dx1p, my1n = my1 + dy1p, mx2n = mx2 + dx2p, my2n = my2 + dy2p, arc = utils.lli8(mx1, my1, mx1n, my1n, mx2, my2, mx2n, my2n), r = utils.dist(arc, p1);
        let s = atan2(p1.y - arc.y, p1.x - arc.x), m = atan2(p2.y - arc.y, p2.x - arc.x), e = atan2(p3.y - arc.y, p3.x - arc.x), _;
        if (s < e) {
          if (s > m || m > e) {
            s += tau;
          }
          if (s > e) {
            _ = e;
            e = s;
            s = _;
          }
        } else {
          if (e < m && m < s) {
            _ = e;
            e = s;
            s = _;
          } else {
            e += tau;
          }
        }
        arc.s = s;
        arc.e = e;
        arc.r = r;
        return arc;
      },
      numberSort: function(a, b) {
        return a - b;
      }
    };
    var PolyBezier = class {
      constructor(curves) {
        this.curves = [];
        this._3d = false;
        if (!!curves) {
          this.curves = curves;
          this._3d = this.curves[0]._3d;
        }
      }
      valueOf() {
        return this.toString();
      }
      toString() {
        return "[" + this.curves.map(function(curve) {
          return utils.pointsToString(curve.points);
        }).join(", ") + "]";
      }
      addCurve(curve) {
        this.curves.push(curve);
        this._3d = this._3d || curve._3d;
      }
      length() {
        return this.curves.map(function(v) {
          return v.length();
        }).reduce(function(a, b) {
          return a + b;
        });
      }
      curve(idx) {
        return this.curves[idx];
      }
      bbox() {
        const c = this.curves;
        var bbox = c[0].bbox();
        for (var i = 1; i < c.length; i++) {
          utils.expandbox(bbox, c[i].bbox());
        }
        return bbox;
      }
      offset(d) {
        const offset = [];
        this.curves.forEach(function(v) {
          offset.push(...v.offset(d));
        });
        return new PolyBezier(offset);
      }
    };
    var { abs: abs2, min, max, cos: cos2, sin: sin2, acos: acos2, sqrt: sqrt2 } = Math;
    var pi2 = Math.PI;
    var Bezier = class {
      constructor(coords) {
        let args = coords && coords.forEach ? coords : Array.from(arguments).slice();
        let coordlen = false;
        if (typeof args[0] === "object") {
          coordlen = args.length;
          const newargs = [];
          args.forEach(function(point2) {
            ["x", "y", "z"].forEach(function(d) {
              if (typeof point2[d] !== "undefined") {
                newargs.push(point2[d]);
              }
            });
          });
          args = newargs;
        }
        let higher = false;
        const len = args.length;
        if (coordlen) {
          if (coordlen > 4) {
            if (arguments.length !== 1) {
              throw new Error("Only new Bezier(point[]) is accepted for 4th and higher order curves");
            }
            higher = true;
          }
        } else {
          if (len !== 6 && len !== 8 && len !== 9 && len !== 12) {
            if (arguments.length !== 1) {
              throw new Error("Only new Bezier(point[]) is accepted for 4th and higher order curves");
            }
          }
        }
        const _3d = this._3d = !higher && (len === 9 || len === 12) || coords && coords[0] && typeof coords[0].z !== "undefined";
        const points = this.points = [];
        for (let idx = 0, step = _3d ? 3 : 2; idx < len; idx += step) {
          var point = {
            x: args[idx],
            y: args[idx + 1]
          };
          if (_3d) {
            point.z = args[idx + 2];
          }
          points.push(point);
        }
        const order = this.order = points.length - 1;
        const dims = this.dims = ["x", "y"];
        if (_3d)
          dims.push("z");
        this.dimlen = dims.length;
        const aligned = utils.align(points, { p1: points[0], p2: points[order] });
        const baselength = utils.dist(points[0], points[order]);
        this._linear = aligned.reduce((t2, p) => t2 + abs2(p.y), 0) < baselength / 50;
        this._lut = [];
        this._t1 = 0;
        this._t2 = 1;
        this.update();
      }
      static quadraticFromPoints(p1, p2, p3, t2) {
        if (typeof t2 === "undefined") {
          t2 = 0.5;
        }
        if (t2 === 0) {
          return new Bezier(p2, p2, p3);
        }
        if (t2 === 1) {
          return new Bezier(p1, p2, p2);
        }
        const abc = Bezier.getABC(2, p1, p2, p3, t2);
        return new Bezier(p1, abc.A, p3);
      }
      static cubicFromPoints(S, B, E, t2, d1) {
        if (typeof t2 === "undefined") {
          t2 = 0.5;
        }
        const abc = Bezier.getABC(3, S, B, E, t2);
        if (typeof d1 === "undefined") {
          d1 = utils.dist(B, abc.C);
        }
        const d2 = d1 * (1 - t2) / t2;
        const selen = utils.dist(S, E), lx = (E.x - S.x) / selen, ly = (E.y - S.y) / selen, bx1 = d1 * lx, by1 = d1 * ly, bx2 = d2 * lx, by2 = d2 * ly;
        const e1 = { x: B.x - bx1, y: B.y - by1 }, e2 = { x: B.x + bx2, y: B.y + by2 }, A = abc.A, v1 = { x: A.x + (e1.x - A.x) / (1 - t2), y: A.y + (e1.y - A.y) / (1 - t2) }, v2 = { x: A.x + (e2.x - A.x) / t2, y: A.y + (e2.y - A.y) / t2 }, nc1 = { x: S.x + (v1.x - S.x) / t2, y: S.y + (v1.y - S.y) / t2 }, nc2 = {
          x: E.x + (v2.x - E.x) / (1 - t2),
          y: E.y + (v2.y - E.y) / (1 - t2)
        };
        return new Bezier(S, nc1, nc2, E);
      }
      static getUtils() {
        return utils;
      }
      getUtils() {
        return Bezier.getUtils();
      }
      static get PolyBezier() {
        return PolyBezier;
      }
      valueOf() {
        return this.toString();
      }
      toString() {
        return utils.pointsToString(this.points);
      }
      toSVG() {
        if (this._3d)
          return false;
        const p = this.points, x = p[0].x, y = p[0].y, s = ["M", x, y, this.order === 2 ? "Q" : "C"];
        for (let i = 1, last = p.length; i < last; i++) {
          s.push(p[i].x);
          s.push(p[i].y);
        }
        return s.join(" ");
      }
      setRatios(ratios) {
        if (ratios.length !== this.points.length) {
          throw new Error("incorrect number of ratio values");
        }
        this.ratios = ratios;
        this._lut = [];
      }
      verify() {
        const print = this.coordDigest();
        if (print !== this._print) {
          this._print = print;
          this.update();
        }
      }
      coordDigest() {
        return this.points.map(function(c, pos) {
          return "" + pos + c.x + c.y + (c.z ? c.z : 0);
        }).join("");
      }
      update() {
        this._lut = [];
        this.dpoints = utils.derive(this.points, this._3d);
        this.computedirection();
      }
      computedirection() {
        const points = this.points;
        const angle = utils.angle(points[0], points[this.order], points[1]);
        this.clockwise = angle > 0;
      }
      length() {
        return utils.length(this.derivative.bind(this));
      }
      static getABC(order = 2, S, B, E, t2 = 0.5) {
        const u = utils.projectionratio(t2, order), um = 1 - u, C = {
          x: u * S.x + um * E.x,
          y: u * S.y + um * E.y
        }, s = utils.abcratio(t2, order), A = {
          x: B.x + (B.x - C.x) / s,
          y: B.y + (B.y - C.y) / s
        };
        return { A, B, C, S, E };
      }
      getABC(t2, B) {
        B = B || this.get(t2);
        let S = this.points[0];
        let E = this.points[this.order];
        return Bezier.getABC(this.order, S, B, E, t2);
      }
      getLUT(steps) {
        this.verify();
        steps = steps || 100;
        if (this._lut.length === steps + 1) {
          return this._lut;
        }
        this._lut = [];
        steps++;
        this._lut = [];
        for (let i = 0, p, t2; i < steps; i++) {
          t2 = i / (steps - 1);
          p = this.compute(t2);
          p.t = t2;
          this._lut.push(p);
        }
        return this._lut;
      }
      on(point, error) {
        error = error || 5;
        const lut = this.getLUT(), hits = [];
        for (let i = 0, c, t2 = 0; i < lut.length; i++) {
          c = lut[i];
          if (utils.dist(c, point) < error) {
            hits.push(c);
            t2 += i / lut.length;
          }
        }
        if (!hits.length)
          return false;
        return t /= hits.length;
      }
      project(point) {
        const LUT = this.getLUT(), l = LUT.length - 1, closest = utils.closest(LUT, point), mpos = closest.mpos, t1 = (mpos - 1) / l, t2 = (mpos + 1) / l, step = 0.1 / l;
        let mdist = closest.mdist, t3 = t1, ft = t3, p;
        mdist += 1;
        for (let d; t3 < t2 + step; t3 += step) {
          p = this.compute(t3);
          d = utils.dist(point, p);
          if (d < mdist) {
            mdist = d;
            ft = t3;
          }
        }
        ft = ft < 0 ? 0 : ft > 1 ? 1 : ft;
        p = this.compute(ft);
        p.t = ft;
        p.d = mdist;
        return p;
      }
      get(t2) {
        return this.compute(t2);
      }
      point(idx) {
        return this.points[idx];
      }
      compute(t2) {
        if (this.ratios) {
          return utils.computeWithRatios(t2, this.points, this.ratios, this._3d);
        }
        return utils.compute(t2, this.points, this._3d, this.ratios);
      }
      raise() {
        const p = this.points, np = [p[0]], k = p.length;
        for (let i = 1, pi3, pim; i < k; i++) {
          pi3 = p[i];
          pim = p[i - 1];
          np[i] = {
            x: (k - i) / k * pi3.x + i / k * pim.x,
            y: (k - i) / k * pi3.y + i / k * pim.y
          };
        }
        np[k] = p[k - 1];
        return new Bezier(np);
      }
      derivative(t2) {
        return utils.compute(t2, this.dpoints[0], this._3d);
      }
      dderivative(t2) {
        return utils.compute(t2, this.dpoints[1], this._3d);
      }
      align() {
        let p = this.points;
        return new Bezier(utils.align(p, { p1: p[0], p2: p[p.length - 1] }));
      }
      curvature(t2) {
        return utils.curvature(t2, this.dpoints[0], this.dpoints[1], this._3d);
      }
      inflections() {
        return utils.inflections(this.points);
      }
      normal(t2) {
        return this._3d ? this.__normal3(t2) : this.__normal2(t2);
      }
      __normal2(t2) {
        const d = this.derivative(t2);
        const q = sqrt2(d.x * d.x + d.y * d.y);
        return { t: t2, x: -d.y / q, y: d.x / q };
      }
      __normal3(t2) {
        const r1 = this.derivative(t2), r2 = this.derivative(t2 + 0.01), q1 = sqrt2(r1.x * r1.x + r1.y * r1.y + r1.z * r1.z), q2 = sqrt2(r2.x * r2.x + r2.y * r2.y + r2.z * r2.z);
        r1.x /= q1;
        r1.y /= q1;
        r1.z /= q1;
        r2.x /= q2;
        r2.y /= q2;
        r2.z /= q2;
        const c = {
          x: r2.y * r1.z - r2.z * r1.y,
          y: r2.z * r1.x - r2.x * r1.z,
          z: r2.x * r1.y - r2.y * r1.x
        };
        const m = sqrt2(c.x * c.x + c.y * c.y + c.z * c.z);
        c.x /= m;
        c.y /= m;
        c.z /= m;
        const R = [
          c.x * c.x,
          c.x * c.y - c.z,
          c.x * c.z + c.y,
          c.x * c.y + c.z,
          c.y * c.y,
          c.y * c.z - c.x,
          c.x * c.z - c.y,
          c.y * c.z + c.x,
          c.z * c.z
        ];
        const n = {
          t: t2,
          x: R[0] * r1.x + R[1] * r1.y + R[2] * r1.z,
          y: R[3] * r1.x + R[4] * r1.y + R[5] * r1.z,
          z: R[6] * r1.x + R[7] * r1.y + R[8] * r1.z
        };
        return n;
      }
      hull(t2) {
        let p = this.points, _p = [], q = [], idx = 0;
        q[idx++] = p[0];
        q[idx++] = p[1];
        q[idx++] = p[2];
        if (this.order === 3) {
          q[idx++] = p[3];
        }
        while (p.length > 1) {
          _p = [];
          for (let i = 0, pt, l = p.length - 1; i < l; i++) {
            pt = utils.lerp(t2, p[i], p[i + 1]);
            q[idx++] = pt;
            _p.push(pt);
          }
          p = _p;
        }
        return q;
      }
      split(t1, t2) {
        if (t1 === 0 && !!t2) {
          return this.split(t2).left;
        }
        if (t2 === 1) {
          return this.split(t1).right;
        }
        const q = this.hull(t1);
        const result = {
          left: this.order === 2 ? new Bezier([q[0], q[3], q[5]]) : new Bezier([q[0], q[4], q[7], q[9]]),
          right: this.order === 2 ? new Bezier([q[5], q[4], q[2]]) : new Bezier([q[9], q[8], q[6], q[3]]),
          span: q
        };
        result.left._t1 = utils.map(0, 0, 1, this._t1, this._t2);
        result.left._t2 = utils.map(t1, 0, 1, this._t1, this._t2);
        result.right._t1 = utils.map(t1, 0, 1, this._t1, this._t2);
        result.right._t2 = utils.map(1, 0, 1, this._t1, this._t2);
        if (!t2) {
          return result;
        }
        t2 = utils.map(t2, t1, 1, 0, 1);
        return result.right.split(t2).left;
      }
      extrema() {
        const result = {};
        let roots = [];
        this.dims.forEach(function(dim) {
          let mfn = function(v) {
            return v[dim];
          };
          let p = this.dpoints[0].map(mfn);
          result[dim] = utils.droots(p);
          if (this.order === 3) {
            p = this.dpoints[1].map(mfn);
            result[dim] = result[dim].concat(utils.droots(p));
          }
          result[dim] = result[dim].filter(function(t2) {
            return t2 >= 0 && t2 <= 1;
          });
          roots = roots.concat(result[dim].sort(utils.numberSort));
        }.bind(this));
        result.values = roots.sort(utils.numberSort).filter(function(v, idx) {
          return roots.indexOf(v) === idx;
        });
        return result;
      }
      bbox() {
        const extrema = this.extrema(), result = {};
        this.dims.forEach(function(d) {
          result[d] = utils.getminmax(this, d, extrema[d]);
        }.bind(this));
        return result;
      }
      overlaps(curve) {
        const lbbox = this.bbox(), tbbox = curve.bbox();
        return utils.bboxoverlap(lbbox, tbbox);
      }
      offset(t2, d) {
        if (typeof d !== "undefined") {
          const c = this.get(t2), n = this.normal(t2);
          const ret = {
            c,
            n,
            x: c.x + n.x * d,
            y: c.y + n.y * d
          };
          if (this._3d) {
            ret.z = c.z + n.z * d;
          }
          return ret;
        }
        if (this._linear) {
          const nv = this.normal(0), coords = this.points.map(function(p) {
            const ret = {
              x: p.x + t2 * nv.x,
              y: p.y + t2 * nv.y
            };
            if (p.z && nv.z) {
              ret.z = p.z + t2 * nv.z;
            }
            return ret;
          });
          return [new Bezier(coords)];
        }
        return this.reduce().map(function(s) {
          if (s._linear) {
            return s.offset(t2)[0];
          }
          return s.scale(t2);
        });
      }
      simple() {
        if (this.order === 3) {
          const a1 = utils.angle(this.points[0], this.points[3], this.points[1]);
          const a2 = utils.angle(this.points[0], this.points[3], this.points[2]);
          if (a1 > 0 && a2 < 0 || a1 < 0 && a2 > 0)
            return false;
        }
        const n1 = this.normal(0);
        const n2 = this.normal(1);
        let s = n1.x * n2.x + n1.y * n2.y;
        if (this._3d) {
          s += n1.z * n2.z;
        }
        return abs2(acos2(s)) < pi2 / 3;
      }
      reduce() {
        let i, t1 = 0, t2 = 0, step = 0.01, segment, pass1 = [], pass2 = [];
        let extrema = this.extrema().values;
        if (extrema.indexOf(0) === -1) {
          extrema = [0].concat(extrema);
        }
        if (extrema.indexOf(1) === -1) {
          extrema.push(1);
        }
        for (t1 = extrema[0], i = 1; i < extrema.length; i++) {
          t2 = extrema[i];
          segment = this.split(t1, t2);
          segment._t1 = t1;
          segment._t2 = t2;
          pass1.push(segment);
          t1 = t2;
        }
        pass1.forEach(function(p1) {
          t1 = 0;
          t2 = 0;
          while (t2 <= 1) {
            for (t2 = t1 + step; t2 <= 1 + step; t2 += step) {
              segment = p1.split(t1, t2);
              if (!segment.simple()) {
                t2 -= step;
                if (abs2(t1 - t2) < step) {
                  return [];
                }
                segment = p1.split(t1, t2);
                segment._t1 = utils.map(t1, 0, 1, p1._t1, p1._t2);
                segment._t2 = utils.map(t2, 0, 1, p1._t1, p1._t2);
                pass2.push(segment);
                t1 = t2;
                break;
              }
            }
          }
          if (t1 < 1) {
            segment = p1.split(t1, 1);
            segment._t1 = utils.map(t1, 0, 1, p1._t1, p1._t2);
            segment._t2 = p1._t2;
            pass2.push(segment);
          }
        });
        return pass2;
      }
      translate(v, d1, d2) {
        d2 = typeof d2 === "number" ? d2 : d1;
        const o = this.order;
        let d = this.points.map((_, i) => (1 - i / o) * d1 + i / o * d2);
        return new Bezier(this.points.map((p, i) => ({
          x: p.x + v.x * d[i],
          y: p.y + v.y * d[i]
        })));
      }
      scale(d) {
        const order = this.order;
        let distanceFn = false;
        if (typeof d === "function") {
          distanceFn = d;
        }
        if (distanceFn && order === 2) {
          return this.raise().scale(distanceFn);
        }
        const clockwise = this.clockwise;
        const points = this.points;
        if (this._linear) {
          return this.translate(this.normal(0), distanceFn ? distanceFn(0) : d, distanceFn ? distanceFn(1) : d);
        }
        const r1 = distanceFn ? distanceFn(0) : d;
        const r2 = distanceFn ? distanceFn(1) : d;
        const v = [this.offset(0, 10), this.offset(1, 10)];
        const np = [];
        const o = utils.lli4(v[0], v[0].c, v[1], v[1].c);
        if (!o) {
          throw new Error("cannot scale this curve. Try reducing it first.");
        }
        [0, 1].forEach(function(t2) {
          const p = np[t2 * order] = utils.copy(points[t2 * order]);
          p.x += (t2 ? r2 : r1) * v[t2].n.x;
          p.y += (t2 ? r2 : r1) * v[t2].n.y;
        });
        if (!distanceFn) {
          [0, 1].forEach((t2) => {
            if (order === 2 && !!t2)
              return;
            const p = np[t2 * order];
            const d2 = this.derivative(t2);
            const p2 = { x: p.x + d2.x, y: p.y + d2.y };
            np[t2 + 1] = utils.lli4(p, p2, o, points[t2 + 1]);
          });
          return new Bezier(np);
        }
        [0, 1].forEach(function(t2) {
          if (order === 2 && !!t2)
            return;
          var p = points[t2 + 1];
          var ov = {
            x: p.x - o.x,
            y: p.y - o.y
          };
          var rc = distanceFn ? distanceFn((t2 + 1) / order) : d;
          if (distanceFn && !clockwise)
            rc = -rc;
          var m = sqrt2(ov.x * ov.x + ov.y * ov.y);
          ov.x /= m;
          ov.y /= m;
          np[t2 + 1] = {
            x: p.x + rc * ov.x,
            y: p.y + rc * ov.y
          };
        });
        return new Bezier(np);
      }
      outline(d1, d2, d3, d4) {
        d2 = d2 === void 0 ? d1 : d2;
        if (this._linear) {
          const n = this.normal(0);
          const start = this.points[0];
          const end = this.points[this.points.length - 1];
          let s, mid, e;
          if (d3 === void 0) {
            d3 = d1;
            d4 = d2;
          }
          s = { x: start.x + n.x * d1, y: start.y + n.y * d1 };
          e = { x: end.x + n.x * d3, y: end.y + n.y * d3 };
          mid = { x: (s.x + e.x) / 2, y: (s.y + e.y) / 2 };
          const fline = [s, mid, e];
          s = { x: start.x - n.x * d2, y: start.y - n.y * d2 };
          e = { x: end.x - n.x * d4, y: end.y - n.y * d4 };
          mid = { x: (s.x + e.x) / 2, y: (s.y + e.y) / 2 };
          const bline = [e, mid, s];
          const ls2 = utils.makeline(bline[2], fline[0]);
          const le2 = utils.makeline(fline[2], bline[0]);
          const segments2 = [ls2, new Bezier(fline), le2, new Bezier(bline)];
          return new PolyBezier(segments2);
        }
        const reduced = this.reduce(), len = reduced.length, fcurves = [];
        let bcurves = [], p, alen = 0, tlen = this.length();
        const graduated = typeof d3 !== "undefined" && typeof d4 !== "undefined";
        function linearDistanceFunction(s, e, tlen2, alen2, slen) {
          return function(v) {
            const f1 = alen2 / tlen2, f2 = (alen2 + slen) / tlen2, d = e - s;
            return utils.map(v, 0, 1, s + f1 * d, s + f2 * d);
          };
        }
        reduced.forEach(function(segment) {
          const slen = segment.length();
          if (graduated) {
            fcurves.push(segment.scale(linearDistanceFunction(d1, d3, tlen, alen, slen)));
            bcurves.push(segment.scale(linearDistanceFunction(-d2, -d4, tlen, alen, slen)));
          } else {
            fcurves.push(segment.scale(d1));
            bcurves.push(segment.scale(-d2));
          }
          alen += slen;
        });
        bcurves = bcurves.map(function(s) {
          p = s.points;
          if (p[3]) {
            s.points = [p[3], p[2], p[1], p[0]];
          } else {
            s.points = [p[2], p[1], p[0]];
          }
          return s;
        }).reverse();
        const fs = fcurves[0].points[0], fe = fcurves[len - 1].points[fcurves[len - 1].points.length - 1], bs = bcurves[len - 1].points[bcurves[len - 1].points.length - 1], be = bcurves[0].points[0], ls = utils.makeline(bs, fs), le = utils.makeline(fe, be), segments = [ls].concat(fcurves).concat([le]).concat(bcurves);
        return new PolyBezier(segments);
      }
      outlineshapes(d1, d2, curveIntersectionThreshold) {
        d2 = d2 || d1;
        const outline = this.outline(d1, d2).curves;
        const shapes = [];
        for (let i = 1, len = outline.length; i < len / 2; i++) {
          const shape = utils.makeshape(outline[i], outline[len - i], curveIntersectionThreshold);
          shape.startcap.virtual = i > 1;
          shape.endcap.virtual = i < len / 2 - 1;
          shapes.push(shape);
        }
        return shapes;
      }
      intersects(curve, curveIntersectionThreshold) {
        if (!curve)
          return this.selfintersects(curveIntersectionThreshold);
        if (curve.p1 && curve.p2) {
          return this.lineIntersects(curve);
        }
        if (curve instanceof Bezier) {
          curve = curve.reduce();
        }
        return this.curveintersects(this.reduce(), curve, curveIntersectionThreshold);
      }
      lineIntersects(line) {
        const mx = min(line.p1.x, line.p2.x), my = min(line.p1.y, line.p2.y), MX = max(line.p1.x, line.p2.x), MY = max(line.p1.y, line.p2.y);
        return utils.roots(this.points, line).filter((t2) => {
          var p = this.get(t2);
          return utils.between(p.x, mx, MX) && utils.between(p.y, my, MY);
        });
      }
      selfintersects(curveIntersectionThreshold) {
        const reduced = this.reduce(), len = reduced.length - 2, results = [];
        for (let i = 0, result, left, right; i < len; i++) {
          left = reduced.slice(i, i + 1);
          right = reduced.slice(i + 2);
          result = this.curveintersects(left, right, curveIntersectionThreshold);
          results.push(...result);
        }
        return results;
      }
      curveintersects(c1, c2, curveIntersectionThreshold) {
        const pairs = [];
        c1.forEach(function(l) {
          c2.forEach(function(r) {
            if (l.overlaps(r)) {
              pairs.push({ left: l, right: r });
            }
          });
        });
        let intersections = [];
        pairs.forEach(function(pair) {
          const result = utils.pairiteration(pair.left, pair.right, curveIntersectionThreshold);
          if (result.length > 0) {
            intersections = intersections.concat(result);
          }
        });
        return intersections;
      }
      arcs(errorThreshold) {
        errorThreshold = errorThreshold || 0.5;
        return this._iterate(errorThreshold, []);
      }
      _error(pc, np1, s, e) {
        const q = (e - s) / 4, c1 = this.get(s + q), c2 = this.get(e - q), ref = utils.dist(pc, np1), d1 = utils.dist(pc, c1), d2 = utils.dist(pc, c2);
        return abs2(d1 - ref) + abs2(d2 - ref);
      }
      _iterate(errorThreshold, circles) {
        let t_s = 0, t_e = 1, safety;
        do {
          safety = 0;
          t_e = 1;
          let np1 = this.get(t_s), np2, np3, arc, prev_arc;
          let curr_good = false, prev_good = false, done;
          let t_m = t_e, prev_e = 1, step = 0;
          do {
            prev_good = curr_good;
            prev_arc = arc;
            t_m = (t_s + t_e) / 2;
            step++;
            np2 = this.get(t_m);
            np3 = this.get(t_e);
            arc = utils.getccenter(np1, np2, np3);
            arc.interval = {
              start: t_s,
              end: t_e
            };
            let error = this._error(arc, np1, t_s, t_e);
            curr_good = error <= errorThreshold;
            done = prev_good && !curr_good;
            if (!done)
              prev_e = t_e;
            if (curr_good) {
              if (t_e >= 1) {
                arc.interval.end = prev_e = 1;
                prev_arc = arc;
                if (t_e > 1) {
                  let d = {
                    x: arc.x + arc.r * cos2(arc.e),
                    y: arc.y + arc.r * sin2(arc.e)
                  };
                  arc.e += utils.angle({ x: arc.x, y: arc.y }, d, this.get(1));
                }
                break;
              }
              t_e = t_e + (t_e - t_s) / 2;
            } else {
              t_e = t_m;
            }
          } while (!done && safety++ < 100);
          if (safety >= 100) {
            break;
          }
          prev_arc = prev_arc ? prev_arc : arc;
          circles.push(prev_arc);
          t_s = prev_e;
        } while (t_e < 1);
        return circles;
      }
    };
    module2.exports = __toCommonJS(bezier_exports);
  }
});

// node_modules/ghost-cursor/lib/math.js
var require_math = __commonJS({
  "node_modules/ghost-cursor/lib/math.js"(exports2) {
    "use strict";
    var __read = exports2 && exports2.__read || function(o, n) {
      var m = typeof Symbol === "function" && o[Symbol.iterator];
      if (!m) return o;
      var i = m.call(o), r, ar = [], e;
      try {
        while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
      } catch (error) {
        e = { error };
      } finally {
        try {
          if (r && !r.done && (m = i["return"])) m.call(i);
        } finally {
          if (e) throw e.error;
        }
      }
      return ar;
    };
    var __spreadArray = exports2 && exports2.__spreadArray || function(to, from, pack) {
      if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
          if (!ar) ar = Array.prototype.slice.call(from, 0, i);
          ar[i] = from[i];
        }
      }
      return to.concat(ar || Array.prototype.slice.call(from));
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.bezierCurveSpeed = exports2.bezierCurve = exports2.overshoot = exports2.clamp = exports2.generateBezierAnchors = exports2.randomVectorOnLine = exports2.randomNumberRange = exports2.setMagnitude = exports2.unit = exports2.magnitude = exports2.perpendicular = exports2.direction = exports2.scale = exports2.extrapolate = exports2.add = exports2.mult = exports2.div = exports2.sub = exports2.origin = void 0;
    var bezier_js_1 = require_bezier();
    exports2.origin = { x: 0, y: 0 };
    var sub = function(a, b) {
      return { x: a.x - b.x, y: a.y - b.y };
    };
    exports2.sub = sub;
    var div = function(a, b) {
      return { x: a.x / b, y: a.y / b };
    };
    exports2.div = div;
    var mult = function(a, b) {
      return { x: a.x * b, y: a.y * b };
    };
    exports2.mult = mult;
    var add = function(a, b) {
      return { x: a.x + b.x, y: a.y + b.y };
    };
    exports2.add = add;
    var extrapolate = function(a, b) {
      return (0, exports2.add)(b, (0, exports2.sub)(b, a));
    };
    exports2.extrapolate = extrapolate;
    var scale = function(value, range1, range2) {
      return (value - range1[0]) * (range2[1] - range2[0]) / (range1[1] - range1[0]) + range2[0];
    };
    exports2.scale = scale;
    var direction = function(a, b) {
      return (0, exports2.sub)(b, a);
    };
    exports2.direction = direction;
    var perpendicular = function(a) {
      return { x: a.y, y: -1 * a.x };
    };
    exports2.perpendicular = perpendicular;
    var magnitude = function(a) {
      return Math.sqrt(Math.pow(a.x, 2) + Math.pow(a.y, 2));
    };
    exports2.magnitude = magnitude;
    var unit = function(a) {
      return (0, exports2.div)(a, (0, exports2.magnitude)(a));
    };
    exports2.unit = unit;
    var setMagnitude = function(a, amount) {
      return (0, exports2.mult)((0, exports2.unit)(a), amount);
    };
    exports2.setMagnitude = setMagnitude;
    var randomNumberRange = function(min, max) {
      return Math.random() * (max - min) + min;
    };
    exports2.randomNumberRange = randomNumberRange;
    var randomVectorOnLine = function(a, b) {
      var vec = (0, exports2.direction)(a, b);
      var multiplier = Math.random();
      return (0, exports2.add)(a, (0, exports2.mult)(vec, multiplier));
    };
    exports2.randomVectorOnLine = randomVectorOnLine;
    var randomNormalLine = function(a, b, range) {
      var randMid = (0, exports2.randomVectorOnLine)(a, b);
      var normalV = (0, exports2.setMagnitude)((0, exports2.perpendicular)((0, exports2.direction)(a, randMid)), range);
      return [randMid, normalV];
    };
    var generateBezierAnchors = function(a, b, spread) {
      var side = Math.round(Math.random()) === 1 ? 1 : -1;
      var calc = function() {
        var _a = __read(randomNormalLine(a, b, spread), 2), randMid = _a[0], normalV = _a[1];
        var choice = (0, exports2.mult)(normalV, side);
        return (0, exports2.randomVectorOnLine)(randMid, (0, exports2.add)(randMid, choice));
      };
      return [calc(), calc()].sort(function(a2, b2) {
        return a2.x - b2.x;
      });
    };
    exports2.generateBezierAnchors = generateBezierAnchors;
    var clamp = function(target, min, max) {
      return Math.min(max, Math.max(min, target));
    };
    exports2.clamp = clamp;
    var overshoot2 = function(coordinate, radius) {
      var a = Math.random() * 2 * Math.PI;
      var rad = radius * Math.sqrt(Math.random());
      var vector = { x: rad * Math.cos(a), y: rad * Math.sin(a) };
      return (0, exports2.add)(coordinate, vector);
    };
    exports2.overshoot = overshoot2;
    var bezierCurve = function(start, finish, spreadOverride) {
      var MIN_SPREAD = 2;
      var MAX_SPREAD = 200;
      var vec = (0, exports2.direction)(start, finish);
      var length = (0, exports2.magnitude)(vec);
      var spread = spreadOverride !== null && spreadOverride !== void 0 ? spreadOverride : (0, exports2.clamp)(length, MIN_SPREAD, MAX_SPREAD);
      var anchors = (0, exports2.generateBezierAnchors)(start, finish, spread);
      return new (bezier_js_1.Bezier.bind.apply(bezier_js_1.Bezier, __spreadArray(__spreadArray([void 0, start], __read(anchors), false), [finish], false)))();
    };
    exports2.bezierCurve = bezierCurve;
    var bezierCurveSpeed = function(t2, P0, P1, P2, P3) {
      var B1 = 3 * Math.pow(1 - t2, 2) * (P1.x - P0.x) + 6 * (1 - t2) * t2 * (P2.x - P1.x) + 3 * Math.pow(t2, 2) * (P3.x - P2.x);
      var B2 = 3 * Math.pow(1 - t2, 2) * (P1.y - P0.y) + 6 * (1 - t2) * t2 * (P2.y - P1.y) + 3 * Math.pow(t2, 2) * (P3.y - P2.y);
      return Math.sqrt(Math.pow(B1, 2) + Math.pow(B2, 2));
    };
    exports2.bezierCurveSpeed = bezierCurveSpeed;
  }
});

// node_modules/ghost-cursor/lib/mouse-helper.js
var require_mouse_helper = __commonJS({
  "node_modules/ghost-cursor/lib/mouse-helper.js"(exports2) {
    "use strict";
    var __awaiter = exports2 && exports2.__awaiter || function(thisArg, _arguments, P, generator) {
      function adopt(value) {
        return value instanceof P ? value : new P(function(resolve) {
          resolve(value);
        });
      }
      return new (P || (P = Promise))(function(resolve, reject) {
        function fulfilled(value) {
          try {
            step(generator.next(value));
          } catch (e) {
            reject(e);
          }
        }
        function rejected(value) {
          try {
            step(generator["throw"](value));
          } catch (e) {
            reject(e);
          }
        }
        function step(result) {
          result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
        }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
      });
    };
    var __generator = exports2 && exports2.__generator || function(thisArg, body) {
      var _ = { label: 0, sent: function() {
        if (t2[0] & 1) throw t2[1];
        return t2[1];
      }, trys: [], ops: [] }, f, y, t2, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
      return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() {
        return this;
      }), g;
      function verb(n) {
        return function(v) {
          return step([n, v]);
        };
      }
      function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
          if (f = 1, y && (t2 = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t2 = y["return"]) && t2.call(y), 0) : y.next) && !(t2 = t2.call(y, op[1])).done) return t2;
          if (y = 0, t2) op = [op[0] & 2, t2.value];
          switch (op[0]) {
            case 0:
            case 1:
              t2 = op;
              break;
            case 4:
              _.label++;
              return { value: op[1], done: false };
            case 5:
              _.label++;
              y = op[1];
              op = [0];
              continue;
            case 7:
              op = _.ops.pop();
              _.trys.pop();
              continue;
            default:
              if (!(t2 = _.trys, t2 = t2.length > 0 && t2[t2.length - 1]) && (op[0] === 6 || op[0] === 2)) {
                _ = 0;
                continue;
              }
              if (op[0] === 3 && (!t2 || op[1] > t2[0] && op[1] < t2[3])) {
                _.label = op[1];
                break;
              }
              if (op[0] === 6 && _.label < t2[1]) {
                _.label = t2[1];
                t2 = op;
                break;
              }
              if (t2 && _.label < t2[2]) {
                _.label = t2[2];
                _.ops.push(op);
                break;
              }
              if (t2[2]) _.ops.pop();
              _.trys.pop();
              continue;
          }
          op = body.call(thisArg, _);
        } catch (e) {
          op = [6, e];
          y = 0;
        } finally {
          f = t2 = 0;
        }
        if (op[0] & 5) throw op[1];
        return { value: op[0] ? op[1] : void 0, done: true };
      }
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.installMouseHelper = installMouseHelper;
    function installMouseHelper(page) {
      return __awaiter(this, void 0, void 0, function() {
        function removeMouseHelper() {
          return __awaiter(this, void 0, void 0, function() {
            return __generator(this, function(_a) {
              switch (_a.label) {
                case 0:
                  return [4, page.evaluate(function() {
                    var _a2, _b;
                    ;
                    (_b = (_a2 = window).removeMouseHelper) === null || _b === void 0 ? void 0 : _b.call(_a2);
                  })];
                case 1:
                  _a.sent();
                  return [4, page.removeScriptToEvaluateOnNewDocument(evaluateOnNewDocumentId)];
                case 2:
                  _a.sent();
                  return [
                    2
                    /*return*/
                  ];
              }
            });
          });
        }
        var evaluateOnNewDocumentId;
        return __generator(this, function(_a) {
          switch (_a.label) {
            case 0:
              return [4, page.evaluateOnNewDocument(function() {
                var attachListener = function() {
                  var box = document.createElement("p-mouse-pointer");
                  var styleElement = document.createElement("style");
                  styleElement.innerHTML = "\n        p-mouse-pointer {\n          pointer-events: none;\n          position: absolute;\n          top: 0;\n          z-index: 10000;\n          left: 0;\n          width: 20px;\n          height: 20px;\n          background: rgba(0,0,0,.4);\n          border: 1px solid white;\n          border-radius: 10px;\n          box-sizing: border-box;\n          margin: -10px 0 0 -10px;\n          padding: 0;\n          transition: background .2s, border-radius .2s, border-color .2s;\n        }\n        p-mouse-pointer.button-1 {\n          transition: none;\n          background: rgba(0,0,0,0.9);\n        }\n        p-mouse-pointer.button-2 {\n          transition: none;\n          border-color: rgba(0,0,255,0.9);\n        }\n        p-mouse-pointer.button-3 {\n          transition: none;\n          border-radius: 4px;\n        }\n        p-mouse-pointer.button-4 {\n          transition: none;\n          border-color: rgba(255,0,0,0.9);\n        }\n        p-mouse-pointer.button-5 {\n          transition: none;\n          border-color: rgba(0,255,0,0.9);\n        }\n        p-mouse-pointer-hide {\n          display: none;\n        }\n      ";
                  document.head.appendChild(styleElement);
                  document.body.appendChild(box);
                  var onMouseMove = function(event) {
                    box.style.left = "".concat(event.pageX, "px");
                    box.style.top = "".concat(event.pageY, "px");
                    box.classList.remove("p-mouse-pointer-hide");
                    updateButtons(event.buttons);
                  };
                  var onMouseDown = function(event) {
                    updateButtons(event.buttons);
                    box.classList.add("button-".concat(event.which));
                    box.classList.remove("p-mouse-pointer-hide");
                  };
                  var onMouseUp = function(event) {
                    updateButtons(event.buttons);
                    box.classList.remove("button-".concat(event.which));
                    box.classList.remove("p-mouse-pointer-hide");
                  };
                  var onMouseLeave = function(event) {
                    updateButtons(event.buttons);
                    box.classList.add("p-mouse-pointer-hide");
                  };
                  var onMouseEnter = function(event) {
                    updateButtons(event.buttons);
                    box.classList.remove("p-mouse-pointer-hide");
                  };
                  function updateButtons(buttons) {
                    for (var i = 0; i < 5; i++) {
                      box.classList.toggle("button-".concat(i), Boolean(buttons & 1 << i));
                    }
                  }
                  document.addEventListener("mousemove", onMouseMove, true);
                  document.addEventListener("mousedown", onMouseDown, true);
                  document.addEventListener("mouseup", onMouseUp, true);
                  document.addEventListener("mouseleave", onMouseLeave, true);
                  document.addEventListener("mouseenter", onMouseEnter, true);
                  window.removeMouseHelper = function() {
                    document.removeEventListener("mousemove", onMouseMove, true);
                    document.removeEventListener("mousedown", onMouseDown, true);
                    document.removeEventListener("mouseup", onMouseUp, true);
                    document.removeEventListener("mouseleave", onMouseLeave, true);
                    document.removeEventListener("mouseenter", onMouseEnter, true);
                    box.remove();
                    styleElement.remove();
                  };
                };
                if (document.readyState !== "loading") {
                  attachListener();
                } else {
                  window.addEventListener("DOMContentLoaded", attachListener, false);
                }
              })];
            case 1:
              evaluateOnNewDocumentId = _a.sent().identifier;
              return [2, { removeMouseHelper }];
          }
        });
      });
    }
  }
});

// node_modules/ghost-cursor/lib/spoof.js
var require_spoof = __commonJS({
  "node_modules/ghost-cursor/lib/spoof.js"(exports2) {
    "use strict";
    var __assign = exports2 && exports2.__assign || function() {
      __assign = Object.assign || function(t2) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
          s = arguments[i];
          for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
            t2[p] = s[p];
        }
        return t2;
      };
      return __assign.apply(this, arguments);
    };
    var __awaiter = exports2 && exports2.__awaiter || function(thisArg, _arguments, P, generator) {
      function adopt(value) {
        return value instanceof P ? value : new P(function(resolve) {
          resolve(value);
        });
      }
      return new (P || (P = Promise))(function(resolve, reject) {
        function fulfilled(value) {
          try {
            step(generator.next(value));
          } catch (e) {
            reject(e);
          }
        }
        function rejected(value) {
          try {
            step(generator["throw"](value));
          } catch (e) {
            reject(e);
          }
        }
        function step(result) {
          result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
        }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
      });
    };
    var __generator = exports2 && exports2.__generator || function(thisArg, body) {
      var _ = { label: 0, sent: function() {
        if (t2[0] & 1) throw t2[1];
        return t2[1];
      }, trys: [], ops: [] }, f, y, t2, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
      return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() {
        return this;
      }), g;
      function verb(n) {
        return function(v) {
          return step([n, v]);
        };
      }
      function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
          if (f = 1, y && (t2 = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t2 = y["return"]) && t2.call(y), 0) : y.next) && !(t2 = t2.call(y, op[1])).done) return t2;
          if (y = 0, t2) op = [op[0] & 2, t2.value];
          switch (op[0]) {
            case 0:
            case 1:
              t2 = op;
              break;
            case 4:
              _.label++;
              return { value: op[1], done: false };
            case 5:
              _.label++;
              y = op[1];
              op = [0];
              continue;
            case 7:
              op = _.ops.pop();
              _.trys.pop();
              continue;
            default:
              if (!(t2 = _.trys, t2 = t2.length > 0 && t2[t2.length - 1]) && (op[0] === 6 || op[0] === 2)) {
                _ = 0;
                continue;
              }
              if (op[0] === 3 && (!t2 || op[1] > t2[0] && op[1] < t2[3])) {
                _.label = op[1];
                break;
              }
              if (op[0] === 6 && _.label < t2[1]) {
                _.label = t2[1];
                t2 = op;
                break;
              }
              if (t2 && _.label < t2[2]) {
                _.label = t2[2];
                _.ops.push(op);
                break;
              }
              if (t2[2]) _.ops.pop();
              _.trys.pop();
              continue;
          }
          op = body.call(thisArg, _);
        } catch (e) {
          op = [6, e];
          y = 0;
        } finally {
          f = t2 = 0;
        }
        if (op[0] & 5) throw op[1];
        return { value: op[0] ? op[1] : void 0, done: true };
      }
    };
    var __read = exports2 && exports2.__read || function(o, n) {
      var m = typeof Symbol === "function" && o[Symbol.iterator];
      if (!m) return o;
      var i = m.call(o), r, ar = [], e;
      try {
        while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
      } catch (error) {
        e = { error };
      } finally {
        try {
          if (r && !r.done && (m = i["return"])) m.call(i);
        } finally {
          if (e) throw e.error;
        }
      }
      return ar;
    };
    var __spreadArray = exports2 && exports2.__spreadArray || function(to, from, pack) {
      if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
          if (!ar) ar = Array.prototype.slice.call(from, 0, i);
          ar[i] = from[i];
        }
      }
      return to.concat(ar || Array.prototype.slice.call(from));
    };
    var __values = exports2 && exports2.__values || function(o) {
      var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
      if (m) return m.call(o);
      if (o && typeof o.length === "number") return {
        next: function() {
          if (o && i >= o.length) o = void 0;
          return { value: o && o[i++], done: !o };
        }
      };
      throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
    };
    var __importDefault = exports2 && exports2.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.createCursor = exports2.GhostCursor = exports2.getElementBox = exports2.getRandomPagePoint = exports2.getCDPClient = exports2.installMouseHelper = void 0;
    exports2.path = path2;
    var debug_1 = __importDefault(require_src());
    var math_1 = require_math();
    var mouse_helper_1 = require_mouse_helper();
    Object.defineProperty(exports2, "installMouseHelper", { enumerable: true, get: function() {
      return mouse_helper_1.installMouseHelper;
    } });
    var log = (0, debug_1.default)("ghost-cursor");
    var delay = function(ms) {
      return __awaiter(void 0, void 0, void 0, function() {
        return __generator(this, function(_a) {
          switch (_a.label) {
            case 0:
              if (ms < 1)
                return [
                  2
                  /*return*/
                ];
              return [4, new Promise(function(resolve) {
                return setTimeout(resolve, ms);
              })];
            case 1:
              return [2, _a.sent()];
          }
        });
      });
    };
    var fitts = function(distance, width) {
      var a = 0;
      var b = 2;
      var id = Math.log2(distance / width + 1);
      return a + b * id;
    };
    var getRandomBoxPoint = function(_a, options) {
      var x = _a.x, y = _a.y, width = _a.width, height = _a.height;
      var paddingWidth = 0;
      var paddingHeight = 0;
      if ((options === null || options === void 0 ? void 0 : options.paddingPercentage) !== void 0 && (options === null || options === void 0 ? void 0 : options.paddingPercentage) > 0 && (options === null || options === void 0 ? void 0 : options.paddingPercentage) <= 100) {
        paddingWidth = width * options.paddingPercentage / 100;
        paddingHeight = height * options.paddingPercentage / 100;
      }
      return {
        x: x + paddingWidth / 2 + Math.random() * (width - paddingWidth),
        y: y + paddingHeight / 2 + Math.random() * (height - paddingHeight)
      };
    };
    var getCDPClient = function(page) {
      return typeof page._client === "function" ? page._client() : page._client;
    };
    exports2.getCDPClient = getCDPClient;
    var getRandomPagePoint = function(page) {
      return __awaiter(void 0, void 0, void 0, function() {
        var targetId, window2;
        var _a, _b;
        return __generator(this, function(_c) {
          switch (_c.label) {
            case 0:
              targetId = page.target()._targetId;
              return [4, (0, exports2.getCDPClient)(page).send("Browser.getWindowForTarget", { targetId })];
            case 1:
              window2 = _c.sent();
              return [2, getRandomBoxPoint({
                x: math_1.origin.x,
                y: math_1.origin.y,
                width: (_a = window2.bounds.width) !== null && _a !== void 0 ? _a : 0,
                height: (_b = window2.bounds.height) !== null && _b !== void 0 ? _b : 0
              })];
          }
        });
      });
    };
    exports2.getRandomPagePoint = getRandomPagePoint;
    var getElementBox = function(page_1, element_1) {
      var args_1 = [];
      for (var _i = 2; _i < arguments.length; _i++) {
        args_1[_i - 2] = arguments[_i];
      }
      return __awaiter(void 0, __spreadArray([page_1, element_1], __read(args_1), false), void 0, function(page, element, relativeToMainFrame) {
        var objectId, quads, elementBox, elementFrame, iframes, frame, iframes_1, iframes_1_1, iframe, e_1_1, frameBox, _a, elementBox, _b;
        var e_1, _c;
        var _d;
        if (relativeToMainFrame === void 0) {
          relativeToMainFrame = true;
        }
        return __generator(this, function(_e) {
          switch (_e.label) {
            case 0:
              _e.trys.push([0, 14, , 20]);
              objectId = element.remoteObject().objectId;
              if (objectId === void 0)
                throw new Error("Element objectId is undefined, falling back to alternative methods");
              return [4, (0, exports2.getCDPClient)(page).send("DOM.getContentQuads", { objectId })];
            case 1:
              quads = _e.sent();
              elementBox = {
                x: quads.quads[0][0],
                y: quads.quads[0][1],
                width: quads.quads[0][4] - quads.quads[0][0],
                height: quads.quads[0][5] - quads.quads[0][1]
              };
              if (!!relativeToMainFrame) return [3, 13];
              return [4, element.contentFrame()];
            case 2:
              elementFrame = _e.sent();
              return [4, (_d = elementFrame === null || elementFrame === void 0 ? void 0 : elementFrame.parentFrame()) === null || _d === void 0 ? void 0 : _d.$$("xpath/.//iframe")];
            case 3:
              iframes = _e.sent();
              if (!(iframes !== void 0 && iframes !== null)) return [3, 13];
              frame = void 0;
              _e.label = 4;
            case 4:
              _e.trys.push([4, 9, 10, 11]);
              iframes_1 = __values(iframes), iframes_1_1 = iframes_1.next();
              _e.label = 5;
            case 5:
              if (!!iframes_1_1.done) return [3, 8];
              iframe = iframes_1_1.value;
              return [4, iframe.contentFrame()];
            case 6:
              if (_e.sent() === elementFrame) {
                frame = iframe;
              }
              _e.label = 7;
            case 7:
              iframes_1_1 = iframes_1.next();
              return [3, 5];
            case 8:
              return [3, 11];
            case 9:
              e_1_1 = _e.sent();
              e_1 = { error: e_1_1 };
              return [3, 11];
            case 10:
              try {
                if (iframes_1_1 && !iframes_1_1.done && (_c = iframes_1.return)) _c.call(iframes_1);
              } finally {
                if (e_1) throw e_1.error;
              }
              return [
                7
                /*endfinally*/
              ];
            case 11:
              if (!(frame !== void 0 && frame != null)) return [3, 13];
              return [4, frame.boundingBox()];
            case 12:
              frameBox = _e.sent();
              if (frameBox !== null) {
                elementBox.x -= frameBox.x;
                elementBox.y -= frameBox.y;
              }
              _e.label = 13;
            case 13:
              return [2, elementBox];
            case 14:
              _a = _e.sent();
              _e.label = 15;
            case 15:
              _e.trys.push([15, 17, , 19]);
              log("Quads not found, trying regular boundingBox");
              return [4, element.boundingBox()];
            case 16:
              elementBox = _e.sent();
              if (elementBox === null)
                throw new Error("Element boundingBox is null, falling back to getBoundingClientRect");
              return [2, elementBox];
            case 17:
              _b = _e.sent();
              log("BoundingBox null, using getBoundingClientRect");
              return [4, element.evaluate(function(el) {
                return el.getBoundingClientRect();
              })];
            case 18:
              return [2, _e.sent()];
            case 19:
              return [3, 20];
            case 20:
              return [
                2
                /*return*/
              ];
          }
        });
      });
    };
    exports2.getElementBox = getElementBox;
    function path2(start, end, options) {
      var optionsResolved = typeof options === "number" ? { spreadOverride: options } : __assign({}, options);
      var DEFAULT_WIDTH = 100;
      var MIN_STEPS = 25;
      var width = "width" in end && end.width !== 0 ? end.width : DEFAULT_WIDTH;
      var curve = (0, math_1.bezierCurve)(start, end, optionsResolved.spreadOverride);
      var length = curve.length() * 0.8;
      var speed = optionsResolved.moveSpeed !== void 0 && optionsResolved.moveSpeed > 0 ? 25 / optionsResolved.moveSpeed : Math.random();
      var baseTime = speed * MIN_STEPS;
      var steps = Math.ceil((Math.log2(fitts(length, width) + 1) + baseTime) * 3);
      var re = curve.getLUT(steps);
      return clampPositive(re, optionsResolved);
    }
    var clampPositive = function(vectors, options) {
      var clampedVectors = vectors.map(function(vector) {
        return {
          x: Math.max(0, vector.x),
          y: Math.max(0, vector.y)
        };
      });
      return (options === null || options === void 0 ? void 0 : options.useTimestamps) === true ? generateTimestamps(clampedVectors, options) : clampedVectors;
    };
    var generateTimestamps = function(vectors, options) {
      var _a;
      var speed = (_a = options === null || options === void 0 ? void 0 : options.moveSpeed) !== null && _a !== void 0 ? _a : Math.random() * 0.5 + 0.5;
      var timeToMove = function(P02, P12, P22, P32, samples) {
        var total = 0;
        var dt = 1 / samples;
        for (var t2 = 0; t2 < 1; t2 += dt) {
          var v1 = (0, math_1.bezierCurveSpeed)(t2 * dt, P02, P12, P22, P32);
          var v2 = (0, math_1.bezierCurveSpeed)(t2, P02, P12, P22, P32);
          total += (v1 + v2) * dt / 2;
        }
        return Math.round(total / speed);
      };
      var timedVectors = [];
      for (var i = 0; i < vectors.length; i++) {
        if (i === 0) {
          timedVectors.push(__assign(__assign({}, vectors[i]), { timestamp: Date.now() }));
        } else {
          var P0 = vectors[i - 1];
          var P1 = vectors[i];
          var P2 = i + 1 < vectors.length ? vectors[i + 1] : (0, math_1.extrapolate)(P0, P1);
          var P3 = i + 2 < vectors.length ? vectors[i + 2] : (0, math_1.extrapolate)(P1, P2);
          var time = timeToMove(P0, P1, P2, P3, vectors.length);
          timedVectors.push(__assign(__assign({}, vectors[i]), { timestamp: timedVectors[i - 1].timestamp + time }));
        }
      }
      return timedVectors;
    };
    var shouldOvershoot = function(a, b, threshold) {
      return (0, math_1.magnitude)((0, math_1.direction)(a, b)) > threshold;
    };
    var intersectsElement = function(vec, box) {
      return vec.x > box.x && vec.x <= box.x + box.width && vec.y > box.y && vec.y <= box.y + box.height;
    };
    var GhostCursor = (
      /** @class */
      (function() {
        function GhostCursor2(page, _a) {
          var _b = _a === void 0 ? {} : _a, _c = _b.start, start = _c === void 0 ? math_1.origin : _c, _d = _b.performRandomMoves, performRandomMoves = _d === void 0 ? false : _d, _e = _b.defaultOptions, defaultOptions = _e === void 0 ? {} : _e, _f = _b.visible, visible = _f === void 0 ? false : _f;
          this.moving = false;
          this.page = page;
          this.location = start;
          this.defaultOptions = defaultOptions;
          if (visible) {
            this.installMouseHelper().then(function(_) {
            }, function(_) {
            });
          }
          if (performRandomMoves) {
            this.randomMove().then(function(_) {
            }, function(_) {
            });
          }
        }
        GhostCursor2.prototype.installMouseHelper = function() {
          return __awaiter(this, void 0, void 0, function() {
            var _this = this;
            return __generator(this, function(_a) {
              switch (_a.label) {
                case 0:
                  return [4, (0, mouse_helper_1.installMouseHelper)(this.page).then(function(_a2) {
                    var removeMouseHelper = _a2.removeMouseHelper;
                    _this.removeMouseHelperFn = removeMouseHelper;
                  })];
                case 1:
                  _a.sent();
                  return [
                    2
                    /*return*/
                  ];
              }
            });
          });
        };
        GhostCursor2.prototype.removeMouseHelper = function() {
          return __awaiter(this, void 0, void 0, function() {
            var _a;
            return __generator(this, function(_b) {
              switch (_b.label) {
                case 0:
                  return [4, (_a = this.removeMouseHelperFn) === null || _a === void 0 ? void 0 : _a.call(this)];
                case 1:
                  _b.sent();
                  this.removeMouseHelperFn = void 0;
                  return [
                    2
                    /*return*/
                  ];
              }
            });
          });
        };
        GhostCursor2.prototype.moveMouse = function(newLocation_1, options_1) {
          return __awaiter(this, arguments, void 0, function(newLocation, options, abortOnMove) {
            var cdpClient, vectors, vectors_1, vectors_1_1, v, dispatchParams, error_1, e_2_1;
            var e_2, _a;
            if (abortOnMove === void 0) {
              abortOnMove = false;
            }
            return __generator(this, function(_b) {
              switch (_b.label) {
                case 0:
                  cdpClient = (0, exports2.getCDPClient)(this.page);
                  vectors = path2(this.location, newLocation, options);
                  _b.label = 1;
                case 1:
                  _b.trys.push([1, 8, 9, 10]);
                  vectors_1 = __values(vectors), vectors_1_1 = vectors_1.next();
                  _b.label = 2;
                case 2:
                  if (!!vectors_1_1.done) return [3, 7];
                  v = vectors_1_1.value;
                  _b.label = 3;
                case 3:
                  _b.trys.push([3, 5, , 6]);
                  if (abortOnMove && this.moving) {
                    return [
                      2
                      /*return*/
                    ];
                  }
                  dispatchParams = {
                    type: "mouseMoved",
                    x: v.x,
                    y: v.y
                  };
                  if ("timestamp" in v)
                    dispatchParams.timestamp = v.timestamp;
                  return [4, cdpClient.send("Input.dispatchMouseEvent", dispatchParams)];
                case 4:
                  _b.sent();
                  this.location = v;
                  return [3, 6];
                case 5:
                  error_1 = _b.sent();
                  if (!this.page.browser().isConnected())
                    return [
                      2
                      /*return*/
                    ];
                  log("Warning: could not move mouse, error message:", error_1);
                  return [3, 6];
                case 6:
                  vectors_1_1 = vectors_1.next();
                  return [3, 2];
                case 7:
                  return [3, 10];
                case 8:
                  e_2_1 = _b.sent();
                  e_2 = { error: e_2_1 };
                  return [3, 10];
                case 9:
                  try {
                    if (vectors_1_1 && !vectors_1_1.done && (_a = vectors_1.return)) _a.call(vectors_1);
                  } finally {
                    if (e_2) throw e_2.error;
                  }
                  return [
                    7
                    /*endfinally*/
                  ];
                case 10:
                  return [
                    2
                    /*return*/
                  ];
              }
            });
          });
        };
        GhostCursor2.prototype.randomMove = function(options) {
          return __awaiter(this, void 0, void 0, function() {
            var optionsResolved, rand, _1;
            var _a;
            return __generator(this, function(_b) {
              switch (_b.label) {
                case 0:
                  optionsResolved = __assign(__assign({ moveDelay: 2e3, randomizeMoveDelay: true }, (_a = this.defaultOptions) === null || _a === void 0 ? void 0 : _a.randomMove), options);
                  _b.label = 1;
                case 1:
                  _b.trys.push([1, 6, , 7]);
                  if (!!this.moving) return [3, 4];
                  return [4, (0, exports2.getRandomPagePoint)(this.page)];
                case 2:
                  rand = _b.sent();
                  return [4, this.moveMouse(rand, optionsResolved, true)];
                case 3:
                  _b.sent();
                  _b.label = 4;
                case 4:
                  return [4, delay(optionsResolved.moveDelay * (optionsResolved.randomizeMoveDelay ? Math.random() : 1))];
                case 5:
                  _b.sent();
                  this.randomMove(options).then(function(_) {
                  }, function(_) {
                  });
                  return [3, 7];
                case 6:
                  _1 = _b.sent();
                  log("Warning: stopping random mouse movements");
                  return [3, 7];
                case 7:
                  return [
                    2
                    /*return*/
                  ];
              }
            });
          });
        };
        GhostCursor2.prototype.mouseButtonAction = function(action, options) {
          return __awaiter(this, void 0, void 0, function() {
            var optionsResolved, cdpClient;
            var _a;
            return __generator(this, function(_b) {
              switch (_b.label) {
                case 0:
                  optionsResolved = __assign(__assign({ button: "left", clickCount: 1 }, (_a = this.defaultOptions) === null || _a === void 0 ? void 0 : _a.click), options);
                  cdpClient = (0, exports2.getCDPClient)(this.page);
                  return [4, cdpClient.send("Input.dispatchMouseEvent", {
                    x: this.location.x,
                    y: this.location.y,
                    button: optionsResolved.button,
                    clickCount: optionsResolved.clickCount,
                    type: action
                  })];
                case 1:
                  _b.sent();
                  return [
                    2
                    /*return*/
                  ];
              }
            });
          });
        };
        GhostCursor2.prototype.mouseDown = function(options) {
          return __awaiter(this, void 0, void 0, function() {
            return __generator(this, function(_a) {
              switch (_a.label) {
                case 0:
                  return [4, this.mouseButtonAction("mousePressed", options)];
                case 1:
                  _a.sent();
                  return [
                    2
                    /*return*/
                  ];
              }
            });
          });
        };
        GhostCursor2.prototype.mouseUp = function(options) {
          return __awaiter(this, void 0, void 0, function() {
            return __generator(this, function(_a) {
              switch (_a.label) {
                case 0:
                  return [4, this.mouseButtonAction("mouseReleased", options)];
                case 1:
                  _a.sent();
                  return [
                    2
                    /*return*/
                  ];
              }
            });
          });
        };
        GhostCursor2.prototype.toggleRandomMove = function(random) {
          this.moving = !random;
        };
        GhostCursor2.prototype.getLocation = function() {
          return this.location;
        };
        GhostCursor2.prototype.click = function(selector, options) {
          return __awaiter(this, void 0, void 0, function() {
            var optionsResolved, wasRandom, error_2;
            var _a;
            return __generator(this, function(_b) {
              switch (_b.label) {
                case 0:
                  optionsResolved = __assign(__assign({ moveDelay: 2e3, hesitate: 0, waitForClick: 0, randomizeMoveDelay: true, button: "left", clickCount: 1 }, (_a = this.defaultOptions) === null || _a === void 0 ? void 0 : _a.click), options);
                  wasRandom = !this.moving;
                  this.toggleRandomMove(false);
                  if (!(selector !== void 0)) return [3, 2];
                  return [4, this.move(selector, __assign(__assign({}, optionsResolved), {
                    // apply moveDelay after click, but not after actual move
                    moveDelay: 0
                  }))];
                case 1:
                  _b.sent();
                  _b.label = 2;
                case 2:
                  _b.trys.push([2, 7, , 8]);
                  return [4, delay(optionsResolved.hesitate)];
                case 3:
                  _b.sent();
                  return [4, this.mouseDown()];
                case 4:
                  _b.sent();
                  return [4, delay(optionsResolved.waitForClick)];
                case 5:
                  _b.sent();
                  return [4, this.mouseUp()];
                case 6:
                  _b.sent();
                  return [3, 8];
                case 7:
                  error_2 = _b.sent();
                  log("Warning: could not click mouse, error message:", error_2);
                  return [3, 8];
                case 8:
                  return [4, delay(optionsResolved.moveDelay * (optionsResolved.randomizeMoveDelay ? Math.random() : 1))];
                case 9:
                  _b.sent();
                  this.toggleRandomMove(wasRandom);
                  return [
                    2
                    /*return*/
                  ];
              }
            });
          });
        };
        GhostCursor2.prototype.move = function(selector, options) {
          return __awaiter(this, void 0, void 0, function() {
            var optionsResolved, wasRandom, go;
            var _this = this;
            var _a;
            return __generator(this, function(_b) {
              switch (_b.label) {
                case 0:
                  optionsResolved = __assign(__assign({ moveDelay: 0, maxTries: 10, overshootThreshold: 500, randomizeMoveDelay: true }, (_a = this.defaultOptions) === null || _a === void 0 ? void 0 : _a.move), options);
                  wasRandom = !this.moving;
                  this.toggleRandomMove(false);
                  go = function(iteration) {
                    return __awaiter(_this, void 0, void 0, function() {
                      var elem, box, destination, newBoundingBox;
                      return __generator(this, function(_a2) {
                        switch (_a2.label) {
                          case 0:
                            if (iteration > optionsResolved.maxTries) {
                              throw Error("Could not mouse-over element within enough tries");
                            }
                            return [
                              4,
                              this.getElement(selector, optionsResolved)
                              // Make sure the object is in view
                            ];
                          case 1:
                            elem = _a2.sent();
                            return [4, this.scrollIntoView(elem, optionsResolved)];
                          case 2:
                            _a2.sent();
                            return [4, (0, exports2.getElementBox)(this.page, elem)];
                          case 3:
                            box = _a2.sent();
                            destination = optionsResolved.destination !== void 0 ? (0, math_1.add)(box, optionsResolved.destination) : getRandomBoxPoint(box, optionsResolved);
                            if (!shouldOvershoot(this.location, destination, optionsResolved.overshootThreshold)) return [3, 6];
                            return [
                              4,
                              this.moveMouse((0, math_1.overshoot)(destination, GhostCursor2.OVERSHOOT_RADIUS), optionsResolved)
                              // then go to the box
                            ];
                          case 4:
                            _a2.sent();
                            return [4, this.moveMouse(__assign(__assign({}, box), destination), __assign(__assign({}, optionsResolved), { spreadOverride: GhostCursor2.OVERSHOOT_SPREAD }))];
                          case 5:
                            _a2.sent();
                            return [3, 8];
                          case 6:
                            return [4, this.moveMouse(destination, optionsResolved)];
                          case 7:
                            _a2.sent();
                            _a2.label = 8;
                          case 8:
                            return [
                              4,
                              (0, exports2.getElementBox)(this.page, elem)
                              // It's possible that the element that is being moved towards
                              // has moved to a different location by the time
                              // the the time the mouseover animation finishes
                            ];
                          case 9:
                            newBoundingBox = _a2.sent();
                            if (!!intersectsElement(this.location, newBoundingBox)) return [3, 11];
                            return [4, go(iteration + 1)];
                          case 10:
                            return [2, _a2.sent()];
                          case 11:
                            return [
                              2
                              /*return*/
                            ];
                        }
                      });
                    });
                  };
                  return [4, go(0)];
                case 1:
                  _b.sent();
                  this.toggleRandomMove(wasRandom);
                  return [4, delay(optionsResolved.moveDelay * (optionsResolved.randomizeMoveDelay ? Math.random() : 1))];
                case 2:
                  _b.sent();
                  return [
                    2
                    /*return*/
                  ];
              }
            });
          });
        };
        GhostCursor2.prototype.moveTo = function(destination, options) {
          return __awaiter(this, void 0, void 0, function() {
            var optionsResolved, wasRandom;
            var _a;
            return __generator(this, function(_b) {
              switch (_b.label) {
                case 0:
                  optionsResolved = __assign(__assign({ moveDelay: 0, randomizeMoveDelay: true }, (_a = this.defaultOptions) === null || _a === void 0 ? void 0 : _a.moveTo), options);
                  wasRandom = !this.moving;
                  this.toggleRandomMove(false);
                  return [4, this.moveMouse(destination, optionsResolved)];
                case 1:
                  _b.sent();
                  this.toggleRandomMove(wasRandom);
                  return [4, delay(optionsResolved.moveDelay * (optionsResolved.randomizeMoveDelay ? Math.random() : 1))];
                case 2:
                  _b.sent();
                  return [
                    2
                    /*return*/
                  ];
              }
            });
          });
        };
        GhostCursor2.prototype.moveBy = function(delta, options) {
          return __awaiter(this, void 0, void 0, function() {
            return __generator(this, function(_a) {
              switch (_a.label) {
                case 0:
                  return [4, this.moveTo((0, math_1.add)(this.location, __assign({ x: 0, y: 0 }, delta)), options)];
                case 1:
                  _a.sent();
                  return [
                    2
                    /*return*/
                  ];
              }
            });
          });
        };
        GhostCursor2.prototype.scrollIntoView = function(selector, options) {
          return __awaiter(this, void 0, void 0, function() {
            var optionsResolved, scrollSpeed, elem, _a, viewportWidth, viewportHeight, docHeight, docWidth, scrollPositionTop, scrollPositionLeft, elemBoundingBox, elemBox, marginedBox, marginedBoxRelativeToDoc, targetBox, top, left, bottom, right, isInViewport, manuallyScroll, cdpClient, objectId, _b, e_3;
            var _this = this;
            var _c;
            return __generator(this, function(_d) {
              switch (_d.label) {
                case 0:
                  optionsResolved = __assign(__assign({ scrollDelay: 200, scrollSpeed: 100, inViewportMargin: 0 }, (_c = this.defaultOptions) === null || _c === void 0 ? void 0 : _c.scroll), options);
                  scrollSpeed = (0, math_1.clamp)(optionsResolved.scrollSpeed, 1, 100);
                  return [4, this.getElement(selector, optionsResolved)];
                case 1:
                  elem = _d.sent();
                  return [4, this.page.evaluate(function() {
                    return {
                      viewportWidth: document.body.clientWidth,
                      viewportHeight: document.body.clientHeight,
                      docHeight: document.body.scrollHeight,
                      docWidth: document.body.scrollWidth,
                      scrollPositionTop: window.scrollY,
                      scrollPositionLeft: window.scrollX
                    };
                  })];
                case 2:
                  _a = _d.sent(), viewportWidth = _a.viewportWidth, viewportHeight = _a.viewportHeight, docHeight = _a.docHeight, docWidth = _a.docWidth, scrollPositionTop = _a.scrollPositionTop, scrollPositionLeft = _a.scrollPositionLeft;
                  return [4, (0, exports2.getElementBox)(this.page, elem)];
                // is relative to viewport
                case 3:
                  elemBoundingBox = _d.sent();
                  elemBox = {
                    top: elemBoundingBox.y,
                    left: elemBoundingBox.x,
                    bottom: elemBoundingBox.y + elemBoundingBox.height,
                    right: elemBoundingBox.x + elemBoundingBox.width
                  };
                  marginedBox = {
                    top: elemBox.top - optionsResolved.inViewportMargin,
                    left: elemBox.left - optionsResolved.inViewportMargin,
                    bottom: elemBox.bottom + optionsResolved.inViewportMargin,
                    right: elemBox.right + optionsResolved.inViewportMargin
                  };
                  marginedBoxRelativeToDoc = {
                    top: marginedBox.top + scrollPositionTop,
                    left: marginedBox.left + scrollPositionLeft,
                    bottom: marginedBox.bottom + scrollPositionTop,
                    right: marginedBox.right + scrollPositionLeft
                  };
                  targetBox = {
                    top: Math.max(marginedBoxRelativeToDoc.top, 0) - scrollPositionTop,
                    left: Math.max(marginedBoxRelativeToDoc.left, 0) - scrollPositionLeft,
                    bottom: Math.min(marginedBoxRelativeToDoc.bottom, docHeight) - scrollPositionTop,
                    right: Math.min(marginedBoxRelativeToDoc.right, docWidth) - scrollPositionLeft
                  };
                  top = targetBox.top, left = targetBox.left, bottom = targetBox.bottom, right = targetBox.right;
                  isInViewport = top >= 0 && left >= 0 && bottom <= viewportHeight && right <= viewportWidth;
                  if (isInViewport)
                    return [
                      2
                      /*return*/
                    ];
                  manuallyScroll = function() {
                    return __awaiter(_this, void 0, void 0, function() {
                      var deltaY, deltaX;
                      return __generator(this, function(_a2) {
                        switch (_a2.label) {
                          case 0:
                            deltaY = 0;
                            deltaX = 0;
                            if (top < 0) {
                              deltaY = top;
                            } else if (bottom > viewportHeight) {
                              deltaY = bottom - viewportHeight;
                            }
                            if (left < 0) {
                              deltaX = left;
                            } else if (right > viewportWidth) {
                              deltaX = right - viewportWidth;
                            }
                            return [4, this.scroll({ x: deltaX, y: deltaY }, optionsResolved)];
                          case 1:
                            _a2.sent();
                            return [
                              2
                              /*return*/
                            ];
                        }
                      });
                    });
                  };
                  _d.label = 4;
                case 4:
                  _d.trys.push([4, 13, , 15]);
                  cdpClient = (0, exports2.getCDPClient)(this.page);
                  if (!(scrollSpeed === 100 && optionsResolved.inViewportMargin <= 0)) return [3, 10];
                  _d.label = 5;
                case 5:
                  _d.trys.push([5, 7, , 9]);
                  objectId = elem.remoteObject().objectId;
                  if (objectId === void 0)
                    throw new Error();
                  return [4, cdpClient.send("DOM.scrollIntoViewIfNeeded", { objectId })];
                case 6:
                  _d.sent();
                  return [3, 9];
                case 7:
                  _b = _d.sent();
                  return [4, manuallyScroll()];
                case 8:
                  _d.sent();
                  return [3, 9];
                case 9:
                  return [3, 12];
                case 10:
                  return [4, manuallyScroll()];
                case 11:
                  _d.sent();
                  _d.label = 12;
                case 12:
                  return [3, 15];
                case 13:
                  e_3 = _d.sent();
                  log("Falling back to JS scroll method", e_3);
                  return [4, elem.evaluate(function(e) {
                    return e.scrollIntoView({
                      block: "center",
                      behavior: scrollSpeed < 90 ? "smooth" : void 0
                    });
                  })];
                case 14:
                  _d.sent();
                  return [3, 15];
                case 15:
                  return [
                    2
                    /*return*/
                  ];
              }
            });
          });
        };
        GhostCursor2.prototype.scroll = function(delta, options) {
          return __awaiter(this, void 0, void 0, function() {
            var optionsResolved, scrollSpeed, cdpClient, deltaX, deltaY, xDirection, yDirection, largerDistanceDir, _a, largerDistance, shorterDistance, EXP_SCALE_START, largerDistanceScrollStep, numSteps, largerDistanceRemainder, shorterDistanceScrollStep, shorterDistanceRemainder, i, longerDistanceDelta, shorterDistanceDelta, _b, deltaX_1, deltaY_1;
            var _c, _d, _e;
            return __generator(this, function(_f) {
              switch (_f.label) {
                case 0:
                  optionsResolved = __assign(__assign({ scrollDelay: 200, scrollSpeed: 100 }, (_c = this.defaultOptions) === null || _c === void 0 ? void 0 : _c.scroll), options);
                  scrollSpeed = (0, math_1.clamp)(optionsResolved.scrollSpeed, 1, 100);
                  cdpClient = (0, exports2.getCDPClient)(this.page);
                  deltaX = (_d = delta.x) !== null && _d !== void 0 ? _d : 0;
                  deltaY = (_e = delta.y) !== null && _e !== void 0 ? _e : 0;
                  xDirection = deltaX < 0 ? -1 : 1;
                  yDirection = deltaY < 0 ? -1 : 1;
                  deltaX = Math.abs(deltaX);
                  deltaY = Math.abs(deltaY);
                  largerDistanceDir = deltaX > deltaY ? "x" : "y";
                  _a = __read(largerDistanceDir === "x" ? [deltaX, deltaY] : [deltaY, deltaX], 2), largerDistance = _a[0], shorterDistance = _a[1];
                  EXP_SCALE_START = 90;
                  largerDistanceScrollStep = scrollSpeed < EXP_SCALE_START ? scrollSpeed : (0, math_1.scale)(scrollSpeed, [EXP_SCALE_START, 100], [EXP_SCALE_START, largerDistance]);
                  numSteps = Math.floor(largerDistance / largerDistanceScrollStep);
                  largerDistanceRemainder = largerDistance % largerDistanceScrollStep;
                  shorterDistanceScrollStep = Math.floor(shorterDistance / numSteps);
                  shorterDistanceRemainder = shorterDistance % numSteps;
                  i = 0;
                  _f.label = 1;
                case 1:
                  if (!(i < numSteps)) return [3, 4];
                  longerDistanceDelta = largerDistanceScrollStep;
                  shorterDistanceDelta = shorterDistanceScrollStep;
                  if (i === numSteps - 1) {
                    longerDistanceDelta += largerDistanceRemainder;
                    shorterDistanceDelta += shorterDistanceRemainder;
                  }
                  _b = __read(largerDistanceDir === "x" ? [longerDistanceDelta, shorterDistanceDelta] : [shorterDistanceDelta, longerDistanceDelta], 2), deltaX_1 = _b[0], deltaY_1 = _b[1];
                  deltaX_1 = deltaX_1 * xDirection;
                  deltaY_1 = deltaY_1 * yDirection;
                  return [4, cdpClient.send("Input.dispatchMouseEvent", {
                    type: "mouseWheel",
                    deltaX: deltaX_1,
                    deltaY: deltaY_1,
                    x: this.location.x,
                    y: this.location.y
                  })];
                case 2:
                  _f.sent();
                  _f.label = 3;
                case 3:
                  i++;
                  return [3, 1];
                case 4:
                  return [4, delay(optionsResolved.scrollDelay)];
                case 5:
                  _f.sent();
                  return [
                    2
                    /*return*/
                  ];
              }
            });
          });
        };
        GhostCursor2.prototype.scrollTo = function(destination, options) {
          return __awaiter(this, void 0, void 0, function() {
            var optionsResolved, _a, docHeight, docWidth, scrollPositionTop, scrollPositionLeft, to;
            var _b;
            return __generator(this, function(_c) {
              switch (_c.label) {
                case 0:
                  optionsResolved = __assign(__assign({ scrollDelay: 200, scrollSpeed: 100 }, (_b = this.defaultOptions) === null || _b === void 0 ? void 0 : _b.scroll), options);
                  return [4, this.page.evaluate(function() {
                    return {
                      docHeight: document.body.scrollHeight,
                      docWidth: document.body.scrollWidth,
                      scrollPositionTop: window.scrollY,
                      scrollPositionLeft: window.scrollX
                    };
                  })];
                case 1:
                  _a = _c.sent(), docHeight = _a.docHeight, docWidth = _a.docWidth, scrollPositionTop = _a.scrollPositionTop, scrollPositionLeft = _a.scrollPositionLeft;
                  to = (function() {
                    switch (destination) {
                      case "top":
                        return { y: 0 };
                      case "bottom":
                        return { y: docHeight };
                      case "left":
                        return { x: 0 };
                      case "right":
                        return { x: docWidth };
                      default:
                        return destination;
                    }
                  })();
                  return [4, this.scroll({
                    y: to.y !== void 0 ? to.y - scrollPositionTop : 0,
                    x: to.x !== void 0 ? to.x - scrollPositionLeft : 0
                  }, optionsResolved)];
                case 2:
                  _c.sent();
                  return [
                    2
                    /*return*/
                  ];
              }
            });
          });
        };
        GhostCursor2.prototype.getElement = function(selector, options) {
          return __awaiter(this, void 0, void 0, function() {
            var optionsResolved, elem, _a, handle;
            var _b;
            return __generator(this, function(_c) {
              switch (_c.label) {
                case 0:
                  optionsResolved = __assign(__assign({}, (_b = this.defaultOptions) === null || _b === void 0 ? void 0 : _b.getElement), options);
                  elem = null;
                  if (!(typeof selector === "string")) return [3, 9];
                  if (!(selector.startsWith("//") || selector.startsWith("(//"))) return [3, 4];
                  selector = "xpath/.".concat(selector);
                  if (!(optionsResolved.waitForSelector !== void 0)) return [3, 2];
                  return [4, this.page.waitForSelector(selector, { timeout: optionsResolved.waitForSelector })];
                case 1:
                  _c.sent();
                  _c.label = 2;
                case 2:
                  return [4, this.page.$$(selector)];
                case 3:
                  _a = __read.apply(void 0, [_c.sent(), 1]), handle = _a[0];
                  elem = handle.asElement();
                  return [3, 8];
                case 4:
                  if (!(optionsResolved.waitForSelector !== void 0)) return [3, 6];
                  return [4, this.page.waitForSelector(selector, { timeout: optionsResolved.waitForSelector })];
                case 5:
                  _c.sent();
                  _c.label = 6;
                case 6:
                  return [4, this.page.$(selector)];
                case 7:
                  elem = _c.sent();
                  _c.label = 8;
                case 8:
                  if (elem === null) {
                    throw new Error('Could not find element with selector "'.concat(selector, `", make sure you're waiting for the elements by specifying "waitForSelector"`));
                  }
                  return [3, 10];
                case 9:
                  elem = selector;
                  _c.label = 10;
                case 10:
                  return [2, elem];
              }
            });
          });
        };
        GhostCursor2.OVERSHOOT_SPREAD = 10;
        GhostCursor2.OVERSHOOT_RADIUS = 120;
        return GhostCursor2;
      })()
    );
    exports2.GhostCursor = GhostCursor;
    var createCursor = function(page, start, performRandomMoves, defaultOptions, visible) {
      if (start === void 0) {
        start = math_1.origin;
      }
      if (performRandomMoves === void 0) {
        performRandomMoves = false;
      }
      if (defaultOptions === void 0) {
        defaultOptions = {};
      }
      if (visible === void 0) {
        visible = false;
      }
      return new GhostCursor(page, { start, performRandomMoves, defaultOptions, visible });
    };
    exports2.createCursor = createCursor;
  }
});

// cursor.js
var readline = require("readline");
var { path } = require_spoof();
var { overshoot } = require_math();
var OVERSHOOT_THRESHOLD = 500;
var OVERSHOOT_RADIUS = 120;
var OVERSHOOT_SPREAD = 10;
var PADDING = 0.3;
function plan({ from, box, speed }) {
  const destination = {
    x: box.x + box.width * PADDING / 2 + Math.random() * box.width * (1 - PADDING),
    y: box.y + box.height * PADDING / 2 + Math.random() * box.height * (1 - PADDING)
  };
  const options = { useTimestamps: true, ...speed ? { moveSpeed: speed } : {} };
  const distance = Math.hypot(destination.x - from.x, destination.y - from.y);
  let points;
  if (distance > OVERSHOOT_THRESHOLD) {
    const past = overshoot(destination, OVERSHOOT_RADIUS);
    const first = path(from, past, options);
    const second = path(past, { ...box, ...destination }, { ...options, spreadOverride: OVERSHOOT_SPREAD });
    const offset = first[first.length - 1].timestamp - second[0].timestamp;
    points = [...first, ...second.slice(1).map((p) => ({ ...p, timestamp: p.timestamp + offset }))];
  } else {
    points = path(from, destination, options);
  }
  const t0 = points[0].timestamp;
  return { points: points.map((p) => [p.x, p.y, p.timestamp - t0]), end: destination };
}
readline.createInterface({ input: process.stdin }).on("line", (line) => {
  let out;
  try {
    out = plan(JSON.parse(line));
  } catch (err) {
    out = { error: String(err) };
  }
  process.stdout.write(JSON.stringify(out) + "\n");
});
