// Purpose: Run reviewed, versioned JSON workflows with durable claims and recorded plugin tool traces.
import { evaluate, validatePack, fingerprint } from "@gbesse/decisionpacks";
import {
  record as capture,
  replay as replayCapsule,
} from "@gbesse/agent-capsule";
import { ensure, snapshot } from "../core/contracts.mjs";
import { Conflict } from "../core/store.mjs";
import { normalizeRoute, routeSteps, resolveBindings } from "./routes.mjs";
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
    // Request identity excludes runtime plugin pins, preserving retries of older stored runs.
    const digest = fingerprint({ pack, state, routes }),
      existing = this.store.get("run", requestId);
    if (existing) {
      if (existing.data.requestFingerprint !== digest)
        throw new Conflict("requestId already refers to different input");
      return existing;
    }
    const outcomes = new Set([
      ...pack.rules.map((r) => r.outcome),
      pack.fallback,
    ]);
    for (const [outcome, route] of Object.entries(routes)) {
      ensure(outcomes.has(outcome), "Route outcome is not declared");
      routes[outcome] = normalizeRoute(route, this.registry, state);
    }
    let run = this.store.put("run", requestId, {
      status: "evaluating",
      requestFingerprint: digest,
      pack,
      state,
      routes,
      stepIndex: 0,
      steps: [],
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
    const steps = routeSteps(run.data.routes[run.data.decision.outcome]);
    const index = run.data.stepIndex ?? 0,
      step = steps[index];
    ensure(step, "Unknown workflow step");
    const plugin = this.registry.plugins.get(step.plugin);
    ensure(
      plugin?.manifest.kind === "action",
      "Action plugin is no longer enabled",
    );
    if (step.pluginPin)
      ensure(
        plugin.digest === step.pluginPin.sha256 &&
          plugin.manifest.version === step.pluginPin.version,
        "Approved action plugin changed; create and review a new run",
      );
    const args = resolveBindings(step, run.data.state, run.data.steps ?? []);
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
        { tool: step.plugin, args },
        {
          [step.plugin]: (input, options) =>
            this.registry.execute(step.plugin, input, {
              ...options,
              timeoutMs: this.timeoutMs,
              invocationId: steps.length === 1 ? id : `${id}:${step.id}`,
            }),
        },
        {
          workflowId: "decision-workbench/action-v1",
          timeoutMs: this.timeoutMs + 1000,
          maxEvents: 1,
        },
      );
      const failed = capsule.outcome.status === "threw";
      const completedSteps = [
        ...(run.data.steps ?? []),
        {
          id: step.id,
          plugin: step.plugin,
          status: failed ? "uncertain" : "completed",
          capsule,
          approvedBy: actor,
          approvedAt: run.data.approvedAt,
          ...(failed
            ? { error: capsule.outcome.error.message }
            : { result: capsule.outcome.value }),
        },
      ];
      const more = !failed && index + 1 < steps.length;
      return this.store.put(
        "run",
        id,
        {
          ...run.data,
          status: failed ? "uncertain" : more ? "awaiting_review" : "completed",
          steps: completedSteps,
          stepIndex: failed ? index : index + 1,
          capsule,
          ...(failed
            ? { error: capsule.outcome.error.message }
            : { result: capsule.outcome.value }),
          history: [
            ...run.data.history,
            {
              event: failed ? "action_uncertain" : "action_completed",
              stepId: step.id,
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
    if (!run.data.steps?.length)
      return replayCapsule(workflow, run.data.capsule, { timeoutMs: 5000 });
    const results = [];
    // Replaying a prefix is useful while the next action awaits review; it never authorizes that action.
    for (const step of run.data.steps)
      results.push({
        id: step.id,
        ...(await replayCapsule(workflow, step.capsule, { timeoutMs: 5000 })),
      });
    if (
      results.length === 1 &&
      routeSteps(run.data.routes[run.data.decision.outcome]).length === 1
    )
      return { ...results[0], steps: results };
    return {
      reproduced: results.every((result) => result.reproduced),
      steps: results,
      consumedEvents: results.reduce(
        (sum, result) => sum + result.consumedEvents,
        0,
      ),
    };
  }
}
