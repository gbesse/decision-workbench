// Purpose: Validate bounded action sequences and resolve only explicit state or earlier-result bindings.
import { ensure, snapshot } from "../core/contracts.mjs";
const safe = (key) =>
  typeof key === "string" &&
  /^[a-zA-Z0-9_-]{1,80}$/.test(key) &&
  !["__proto__", "constructor", "prototype"].includes(key);
export const routeSteps = (route) =>
  route.steps ?? [
    { id: "action", plugin: route.plugin, bindings: route.bindings },
  ];
export function normalizeRoute(route, registry, state) {
  ensure(
    route && typeof route === "object" && !Array.isArray(route),
    "Invalid action route",
  );
  ensure(
    !(route.steps && route.plugin),
    "Use either a single plugin or a steps sequence",
  );
  const steps = routeSteps(route);
  ensure(
    Array.isArray(steps) && steps.length > 0 && steps.length <= 10,
    "Routes require 1–10 steps",
  );
  const previous = new Set();
  return {
    steps: steps.map((step) => {
      ensure(
        safe(step.id) && !previous.has(step.id),
        "Step ids must be unique safe names",
      );
      const plugin = registry.plugins.get(step.plugin);
      ensure(
        plugin?.manifest.kind === "action",
        "Route needs an enabled action plugin",
      );
      ensure(
        step.bindings &&
          typeof step.bindings === "object" &&
          !Array.isArray(step.bindings),
        "Route bindings required",
      );
      for (const [name, binding] of Object.entries(step.bindings)) {
        ensure(
          safe(name) &&
            binding &&
            typeof binding === "object" &&
            !Array.isArray(binding),
          "Invalid binding",
        );
        const modes = ["value", "state", "step"].filter((key) =>
          Object.hasOwn(binding, key),
        );
        ensure(
          modes.length === 1,
          "Bindings require exactly one value, state or step source",
        );
        if (modes[0] === "state")
          ensure(
            Object.hasOwn(state, binding.state),
            "Missing argument source",
          );
        if (modes[0] === "step") {
          ensure(
            previous.has(binding.step),
            "Result bindings must reference an earlier step",
          );
          pointerSegments(binding.path ?? "");
        }
      }
      previous.add(step.id);
      return {
        ...snapshot(step),
        pluginPin: { version: plugin.manifest.version, sha256: plugin.digest },
      };
    }),
  };
}
function pointerSegments(path) {
  ensure(
    typeof path === "string" &&
      path.length <= 500 &&
      (path === "" || path.startsWith("/")),
    "Result path must be a JSON pointer",
  );
  const parts = path === "" ? [] : path.slice(1).split("/");
  ensure(
    parts.length <= 20 && parts.every((part) => !/~(?![01])/.test(part)),
    "Invalid result pointer",
  );
  const decoded = parts.map((part) =>
    part.replaceAll("~1", "/").replaceAll("~0", "~"),
  );
  ensure(
    decoded.every(
      (part) => !["__proto__", "constructor", "prototype"].includes(part),
    ),
    "Unsafe result pointer",
  );
  return decoded;
}
export function resolveBindings(step, state, completed) {
  const args = {};
  for (const [key, binding] of Object.entries(step.bindings)) {
    ensure(safe(key), "Invalid binding name");
    if (Object.hasOwn(binding, "state")) {
      ensure(Object.hasOwn(state, binding.state), "Missing argument source");
      args[key] = state[binding.state];
    } else if (Object.hasOwn(binding, "step")) {
      const prior = completed.find((item) => item.id === binding.step);
      ensure(prior?.status === "completed", "Referenced step is not completed");
      let value = prior.result;
      for (const part of pointerSegments(binding.path ?? "")) {
        ensure(
          value !== null &&
            typeof value === "object" &&
            Object.hasOwn(value, part),
          "Result pointer does not exist",
        );
        value = value[part];
      }
      args[key] = snapshot(value);
    } else {
      ensure(Object.hasOwn(binding, "value"), "Bindings require a source");
      args[key] = snapshot(binding.value);
    }
  }
  return args;
}
