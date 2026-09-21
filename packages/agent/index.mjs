// Purpose: Run reviewed, versioned JSON workflows with durable claims and recorded plugin tool traces.
import { evaluate, validatePack, fingerprint } from "@gbesse/decisionpacks";
import {
  record as capture,
  replay as replayCapsule,
} from "@gbesse/agent-capsule";
import { ensure, snapshot } from "../core/contracts.mjs";
import { Conflict } from "../core/store.mjs";
const workflow = async ({ input, call }) => call(input.tool, input.args);
export class AgentServer {
  constructor({ store, registry, provider, timeoutMs = 30000 }) {
    Object.assign(this, { store, registry, provider, timeoutMs });
  }
  async start({ requestId, pack, state, routes }) {
    ensure(
      typeof requestId === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(requestId),
      "A stable requestId is required",
    );
    pack = snapshot(pack);
    state = snapshot(state);
    routes = snapshot(routes);
    validatePack(pack);
    const outcomes = new Set([
      ...pack.rules.map((r) => r.outcome),
      pack.fallback,
    ]);
    for (const [outcome, route] of Object.entries(routes)) {
      ensure(outcomes.has(outcome), "Route outcome is not declared");
      ensure(
        this.registry.plugins.get(route.plugin)?.manifest.kind === "action",
        "Route needs an enabled action plugin",
      );
      ensure(
        route.bindings && typeof route.bindings === "object",
        "Route bindings required",
      );
    }
    const digest = fingerprint({ pack, state, routes }),
      existing = this.store.get("run", requestId);
    if (existing) {
      if (existing.data.requestFingerprint !== digest)
        throw new Conflict("requestId already refers to different input");
      return existing;
    }
    let run = this.store.put("run", requestId, {
      status: "evaluating",
      requestFingerprint: digest,
      pack,
      state,
      routes,
      history: [{ event: "started", at: new Date().toISOString() }],
    });
    try {
      const decision = await evaluate(pack, state, {
        provider: this.provider,
        timeoutMs: this.timeoutMs,
      });
      const route = routes[decision.outcome];
      run = this.store.put(
        "run",
        requestId,
        {
          ...run.data,
          decision,
          status: route ? "awaiting_review" : "completed",
          history: [
            ...run.data.history,
            {
              event: route ? "review_requested" : "completed",
              at: new Date().toISOString(),
            },
          ],
        },
        run.revision,
      );
      return run;
    } catch (error) {
      this.store.put(
        "run",
        requestId,
        { ...run.data, status: "failed", error: error.message },
        run.revision,
      );
      throw error;
    }
  }
  async approve(id, revision, actor = "local-operator") {
    let run = this.store.get("run", id);
    ensure(run, "Unknown run");
    if (run.revision !== revision) throw new Conflict();
    ensure(run.data.status === "awaiting_review", "Run is not awaiting review");
    const route = run.data.routes[run.data.decision.outcome],
      args = {};
    for (const [key, binding] of Object.entries(route.bindings)) {
      ensure(
        !["__proto__", "constructor", "prototype"].includes(key),
        "Invalid binding name",
      );
      if (
        binding &&
        typeof binding === "object" &&
        Object.hasOwn(binding, "state")
      ) {
        ensure(
          Object.hasOwn(run.data.state, binding.state),
          "Missing argument source",
        );
        args[key] = run.data.state[binding.state];
      } else {
        ensure(
          binding && Object.hasOwn(binding, "value"),
          "Bindings require state or value",
        );
        args[key] = snapshot(binding.value);
      }
    }
    // Claim durably before invoking the tool. A restart never silently repeats an uncertain external action.
    run = this.store.put(
      "run",
      id,
      {
        ...run.data,
        status: "executing",
        approvedBy: actor,
        approvedAt: new Date().toISOString(),
      },
      revision,
    );
    try {
      const capsule = await capture(
        workflow,
        { tool: route.plugin, args },
        {
          [route.plugin]: (input, options) =>
            this.registry.execute(route.plugin, input, {
              ...options,
              timeoutMs: this.timeoutMs,
              invocationId: id,
            }),
        },
        {
          workflowId: "decision-workbench/action-v1",
          timeoutMs: this.timeoutMs + 1000,
          maxEvents: 1,
        },
      );
      const failed = capsule.outcome.status === "threw";
      return this.store.put(
        "run",
        id,
        {
          ...run.data,
          status: failed ? "uncertain" : "completed",
          capsule,
          ...(failed
            ? { error: capsule.outcome.error.message }
            : { result: capsule.outcome.value }),
          history: [
            ...run.data.history,
            {
              event: failed ? "action_uncertain" : "action_completed",
              at: new Date().toISOString(),
            },
          ],
        },
        run.revision,
      );
    } catch (error) {
      this.store.put(
        "run",
        id,
        { ...run.data, status: "uncertain", error: error.message },
        run.revision,
      );
      throw error;
    }
  }
  reject(id, revision) {
    const run = this.store.get("run", id);
    ensure(
      run?.data.status === "awaiting_review",
      "Run is not awaiting review",
    );
    return this.store.put(
      "run",
      id,
      { ...run.data, status: "rejected" },
      revision,
    );
  }
  async replay(id) {
    const run = this.store.get("run", id);
    ensure(run?.data.capsule, "Run has no completed trace");
    return replayCapsule(workflow, run.data.capsule, { timeoutMs: 5000 });
  }
}
