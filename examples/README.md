# Runnable examples

These files exercise the six modules using explicit synthetic judgments. Run `npm run demo` for the complete non-browser path. `support-triage.json` is a DecisionPacks policy reused from the existing project; its thresholds are illustrative, not calibrated against real Jev.

For a real extension installation, inspect `external-plugin/redact-emails.mjs`, run `node examples/write-plugin-config.mjs`, and start `npm start -- --demo --plugins .local/plugin-config.json`. The plugin becomes visible and executable in the browser catalogue. The config generator refuses to overwrite an existing approval. Review code before regenerating a changed digest.

For an external action, inspect `external-plugin/webhook-action.mjs` and follow [the webhook guide](../docs/plugins.md). `write-webhook-config.mjs` creates its approved configuration. The webhook performs a real network write after approval, even when inference is in demo mode.
