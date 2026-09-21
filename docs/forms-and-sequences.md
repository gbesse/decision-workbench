# Editable forms and reviewed action sequences

This guide covers the form designer and multi-step JSON routes added in v0.2.0. Both extend existing contracts without requiring a build or a second server.

## Design a form

Open **UI Builder**, select a policy, then edit the title, description, field labels, help text, placeholders and controls. Use **Monter** or **Descendre** to reorder fields. String inputs support a text input, textarea or select with explicit options; numeric and boolean inputs retain number and checkbox controls.

**Actualiser l’aperçu** validates the draft and displays it alongside the editor. **Enregistrer le formulaire** persists it using a revision check. Evaluation and export use the saved layout. An unsaved preview cannot be evaluated. HTML export collects typed JSON; it does not embed the operator token or call Jev.

All policy inputs must appear exactly once. The designer changes presentation, not the policy's types or questions. To add a decision input, first edit and version the policy's full JSON contract. When the policy content changes, the saved form is marked stale and evaluation/export require review and a new save. Reopen the policy's form to rebuild its current fields; old form configurations remain in storage until replaced.

Form-specific select restrictions apply when evaluation includes `formRevision`. Omitting it intentionally uses the raw DecisionPack input contract, so existing non-form API clients keep working. A select is a presentation/input constraint, not an authorization rule for an underlying decision service.

### API additions

| Route                    | Body                                       | Result                                                   |
| ------------------------ | ------------------------------------------ | -------------------------------------------------------- |
| POST `/api/form-preview` | `{packId, layout}`                         | Validated `{form}` without persistence                   |
| POST `/api/form-layout`  | `{packId, packRevision, revision, layout}` | Saved layout object; revision 0 for creation             |
| POST `/api/form`         | `{packId}`                                 | `{form, layout, stale, html}`; stale layouts receive 409 |
| POST `/api/evaluate`     | `{packId, formRevision, state}`            | Evaluation against the current saved form and policy     |

`GET /api/workspace` now includes `forms`, keyed by `packId`. Each entry contains the compiled form, its stored layout object (or null), and whether the policy changed.

```json
{
  "title": "Support request",
  "description": "Choose the request to route.",
  "fields": [
    {
      "name": "text",
      "label": "Your request",
      "control": "select",
      "help": "The saved policy determines the destination.",
      "options": ["Refund invoice", "API crashes"]
    }
  ]
}
```

Layouts permit at most 100 unique nonempty options per select. Labels, help and descriptions have bounded lengths. No arbitrary HTML, JavaScript, computed expressions or remote data sources are accepted by the designer.

## Compose several actions

In **JSON Agents**, click **Exemple à deux étapes** to populate a route for every finite outcome. The first local annotation prepares a result; the second consumes part of that result. Each step waits for a separate operator approval. The JSON routes remain directly editable.

A route can still use the original `{plugin, bindings}` shape. Alternatively it can contain `steps`, an ordered array of 1–10 action definitions with unique IDs. One policy decision selects the route; subsequent steps do not call the model again. This is a finite sequential workflow, not a graph editor, loop engine or general planner.

```json
{
  "billing": {
    "steps": [
      {
        "id": "prepare",
        "plugin": "annotation.prepare",
        "bindings": {
          "queue": { "value": "billing" },
          "text": { "state": "text" }
        }
      },
      {
        "id": "followup",
        "plugin": "annotation.prepare",
        "bindings": {
          "queue": { "value": "followup" },
          "text": { "step": "prepare", "path": "/annotation/text" }
        }
      }
    ]
  }
}
```

A binding has exactly one source: `value`, top-level `state`, or an earlier completed `step`. Step results use JSON Pointer paths; an empty path selects the whole result. Forward references, unknown steps, reserved prototype properties and malformed pointers are rejected. A pointer that does not exist in the actual prior result fails before the next action is claimed or executed.

The selected plugin version and entrypoint digest are saved in each new run's route. Changing the plugin implementation blocks approval of that old run. Start and review a new run after an intentional plugin change. Existing pre-v0.2 runs without pins remain readable and use their original explicit approval behavior.

After a successful step, the run returns to `awaiting_review` if another step remains. Its revision changes, so an old approval cannot authorize the next action. Completion stores per-step results, approval metadata and capsules. A failed step makes the run uncertain and preserves the successful prefix; it is not automatically retried. Rejecting a later step cannot undo earlier external effects. No automatic compensation is implemented.

Multi-step action plugins receive an invocation ID of `<requestId>:<stepId>`; legacy single-action routes keep the original request ID. A webhook receiver must still implement deduplication. Restart recovery preserves completed steps. A crash during execution marks the run uncertain and requires inspection.

`/api/runs/replay` replays the recorded prefix, even if a later action is awaiting approval. It never executes plugins or authorizes remaining steps. Multi-step responses include `{reproduced, steps, consumedEvents}`. Single-action replay retains its outcome fields for compatibility and adds step information when available.
