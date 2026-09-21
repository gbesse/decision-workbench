// Purpose: Example operator-installed transform that redacts obvious email addresses from text.
export async function execute({ text }) {
  return {
    text: text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[EMAIL]"),
  };
}
