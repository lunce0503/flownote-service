# Agent Workflow Board

- Date: 2026-05-19
- Area: `flownote/src/widgets/AgentWidget`

## Objective

Make the main Flownote usage flow smoother by guiding users through planning, writing, checking, and organizing. Accept additional improvement requests as prompts and turn them into actionable agenda items.

## Changes

- Added `AgentWorkflowBoard` to the Agent page sidebar.
- Added stage buttons for planning, writing, checking, and organizing.
- Added an improvement prompt input that turns free-form improvement requests into a staged agenda.
- Updated the default agent prompt so responses identify the current workflow stage and return agenda, verification, and follow-up actions.
- Added a workflow-oriented recommended command.

## Validation

- Run `yarn build` in `flownote/`.
- Run `git diff --check` for changed Agent files and this report.
- Run repository-level `docker compose up -d --build`.
