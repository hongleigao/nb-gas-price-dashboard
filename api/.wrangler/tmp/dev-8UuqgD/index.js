var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/handlers/cycle.js
function getMonctonCycleDates() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Moncton",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const todayStr = formatter.format(/* @__PURE__ */ new Date());
  const [y, m, d] = todayStr.split("-").map(Number);
  const todayDate = new Date(Date.UTC(y, m - 1, d));
  const dayOfWeek = todayDate.getUTCDay();
  let daysSinceThu = dayOfWeek - 4;
  if (daysSinceThu < 0) daysSinceThu += 7;
  const currentStart = new Date(todayDate);
  currentStart.setUTCDate(todayDate.getUTCDate() - daysSinceThu);
  const prevStart = new Date(currentStart);
  prevStart.setUTCDate(currentStart.getUTCDate() - 7);
  return {
    currentStartStr: currentStart.toISOString().split("T")[0],
    prevStartStr: prevStart.toISOString().split("T")[0]
  };
}
__name(getMonctonCycleDates, "getMonctonCycleDates");
async function handleCycle(request, env) {
  const db = env.D1_DB;
  try {
    const { results: eubData } = await db.prepare(
      "SELECT effective_date, max_price, is_interrupter, interrupter_variance FROM eub_prices ORDER BY effective_date DESC LIMIT 1"
    ).all();
    if (eubData.length === 0) {
      return new Response(JSON.stringify({
        status: "error",
        error: { code: "NO_DATA", message: "No EUB price data available" }
      }), { status: 404, headers: { "Access-Control-Allow-Origin": "*" } });
    }
    const currentEub = eubData[0];
    const { currentStartStr, prevStartStr } = getMonctonCycleDates();
    const { results: marketData } = await db.prepare(
      "SELECT * FROM market_data WHERE date >= ? ORDER BY date ASC"
    ).bind(prevStartStr).all();
    const previousCycle = marketData.filter((r) => r.date < currentStartStr && r.is_weekend === 0);
    let benchmarkPrice = 0;
    if (previousCycle.length > 0) {
      const sum = previousCycle.reduce((acc, row) => acc + row.rbob_cad_base, 0);
      benchmarkPrice = parseFloat((sum / previousCycle.length).toFixed(4));
    }
    const marketCycle = marketData.filter((r) => r.date >= currentStartStr).map((r) => ({
      date: r.date,
      absolute_price: parseFloat(r.rbob_cad_base.toFixed(4)),
      is_weekend: r.is_weekend
    }));
    const { results: syncData } = await db.prepare("SELECT max(date) as last_date FROM market_data").all();
    const responseData = {
      status: "success",
      data: {
        current_eub: {
          effective_date: currentEub.effective_date,
          max_price: currentEub.max_price,
          is_interrupter: currentEub.is_interrupter,
          interrupter_variance: currentEub.interrupter_variance || 0
        },
        benchmark_price: benchmarkPrice,
        market_cycle: marketCycle
      },
      meta: {
        last_sync_time: syncData[0]?.last_date || (/* @__PURE__ */ new Date()).toISOString(),
        timezone: "America/Moncton"
      }
    };
    return new Response(JSON.stringify(responseData), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=1800"
        // CDN 防抖缓存
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({
      status: "error",
      error: { code: "SERVER_ERROR", message: e.message }
    }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }
}
__name(handleCycle, "handleCycle");

// src/handlers/history.js
async function handleHistory(request, env) {
  const db = env.D1_DB;
  const url = new URL(request.url);
  const days = parseInt(url.searchParams.get("days") || "90", 10);
  try {
    const { results: eubHistory } = await db.prepare(
      "SELECT effective_date, max_price, is_interrupter FROM eub_prices ORDER BY effective_date DESC LIMIT ?"
    ).bind(days).all();
    const { results: marketHistory } = await db.prepare(
      "SELECT date, rbob_cad_base FROM market_data ORDER BY date DESC LIMIT ?"
    ).bind(days).all();
    return new Response(JSON.stringify({
      status: "success",
      data: {
        eub_history: eubHistory,
        market_history: marketHistory
      },
      meta: {
        query_days: days
      }
    }), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=1800"
        // 缓存半小时，降低 D1 消耗
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({
      status: "error",
      error: { code: "DATABASE_ERROR", message: e.message }
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }
}
__name(handleHistory, "handleHistory");

// src/router.js
var router = {
  async handle(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (path === "/api/v1/cycle/current") {
      return await handleCycle(request, env);
    } else if (path === "/api/v1/history") {
      return await handleHistory(request, env);
    }
    return new Response(JSON.stringify({ error: "Not Found" }), {
      status: 404,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }
};
var router_default = router;

// src/index.js
var src_default = {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type"
        }
      });
    }
    try {
      return await router_default.handle(request, env);
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }
  }
};

// ../../../../../Users/hongl/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../../../../Users/hongl/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-0y50Zn/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// ../../../../../Users/hongl/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-0y50Zn/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
