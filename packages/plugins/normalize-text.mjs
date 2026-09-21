// Purpose: Example transform plugin that normalizes whitespace without inventing document content.
export async function execute(input) {
  return { text: input.text.replace(/\s+/gu, " ").trim() };
}
