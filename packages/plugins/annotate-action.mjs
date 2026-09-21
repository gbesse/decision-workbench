// Purpose: Example pure action that returns a proposed annotation; it does not contact an external system.
export async function execute(input) {
  return {
    execution: "local_result_only",
    annotation: { queue: input.queue, text: input.text },
  };
}
