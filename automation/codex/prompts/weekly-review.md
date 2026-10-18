Read `AGENTS.md`, `.codex/prompts/code-review.md`, and the relevant files under `.codex/checklists/` before reviewing.

Review the checked-out `origin/main` source for concrete bugs, regressions, security issues, broken API contracts, and missing validation. Prioritize findings by severity and include file and line evidence. Do not modify files, access production data, start a local application server, deploy, commit, push, or open a pull request.

Return only a result that conforms to the supplied JSON Schema. Set `deployment_performed` to `false`.
