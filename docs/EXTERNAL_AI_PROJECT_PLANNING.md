# External AI Project Planning

Use this workflow when you want Claude, Grok, or ChatGPT to deepen one project without paying for a large in-app API loop.

## Best workflow

1. Open a project at `/category/[categoryId]`
2. Use the export controls in the `AI strategic window`
3. Paste the planning prompt and export JSON into your external AI chat
4. Ask the model to return strict JSON only
5. Paste the result back into the `External AI import` box
6. Preview every proposed change
7. Apply only the items you actually want

This keeps Rise & Shine as the source of truth while external AI acts as a planning and refinement partner.

## Recommended prompt pattern

The app can generate a ready-made prompt, but this framing works well if you want to tweak it:

```text
You are helping extend a project inside Rise & Shine.

Review the exported project snapshot and produce a practical delta, not a full rewrite.

Goals:
- improve project strategy
- sharpen the source of truth narrative
- propose better next moves
- split oversized work into subtasks
- improve alignment to desired outcomes and human need strategies
- suggest vision-level updates only when they clearly improve this project

Rules:
- return one JSON object only
- use the exact schema I provided
- use existing task ids and desired outcome ids exactly as given
- be conservative and high-leverage
- do not delete data
- if unsure, omit the field instead of guessing
```

## Provider tips

### Claude

- Usually strong at project decomposition and narrative cleanup.
- Ask for `strict JSON only`.
- If it adds prose before the JSON, ask it to retry with no commentary.

### Grok

- Often useful for brainstorming and strategic alternatives.
- Remind it to avoid extra explanation outside the JSON payload.
- Good for generating several possible next-move strategies, then narrowing to one.

### ChatGPT

- Good at balanced structured output if you explicitly say `return only one JSON object`.
- If it starts wrapping JSON in markdown fences, ask for the same result without code fences.

## Cost-control guidance

- Keep exports project-scoped, not account-wide.
- Prefer `Copy export JSON` over giant freeform paste dumps when the chat starts getting long.
- Reuse one thread per project until the context gets stale, then start a fresh thread with the latest export.
- Use manual copy/paste for the heavy thinking and keep the app-side work to validation, preview, and apply.

## What gets applied today

The current import flow can preview and apply:

- project workspace edits
- task updates
- new root initiatives
- new subtasks
- alignment fixes
- approval-based vision suggestions

## What remains intentionally conservative

- No destructive deletion flow in v1
- No blind overwrite of the whole vision profile
- No required paid model call inside the app

## Suggested operator habit

For each meaningful external AI session:

1. Save the current workspace first
2. Export the latest pack
3. Ask for a proposed delta
4. Preview the result in Rise & Shine
5. Apply only the high-confidence changes
6. Re-export after major edits so the external chat stays current
