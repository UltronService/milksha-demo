---
name: refactor-pipeline
description: Use for every refactor, cleanup, or optimization task. One pipeline that replaces separate calls to token-economic-refactoring, blast-radius, dependency-graph-visualizer, tests, architectural-alignment, and thermo-nuclear-code-quality-review.
---
# Refactor pipeline

## Communication rules (all steps)
- Do not paste code into chat. Report file paths, function names, and line ranges only.
- Do not repeat unchanged code. Do not regenerate whole files.
- Reports to the manager: Traditional Chinese, ASD-STE100, 3 lines at most per step.
- Secrets: write <REDACTED>.

## Step 1. Scope
1. List target files (1–2, closely related), functions, and line ranges.
2. If more files are needed, split into separate tasks.

## Step 2. Impact
1. Find every caller, import, config, and test that the change can affect, outside the diff.
2. Name the one fact that proves the change is safe.

## Step 3. Dependency map
1. Draw a Mermaid `graph TD` of the impacted modules only.
2. Mark the changed module, core utilities, APIs, and data flow direction.
3. If impact crosses a layer boundary or touches a public API, stop and ask the manager.

## Step 4. Edit and test
1. Edit only the listed ranges.
2. Bug fix: write a failing regression test first. New feature: red, then green.
3. Run the project's tests and type checks. Fix failures before going on.
4. Confirm no lines outside the listed ranges changed.

## Step 5. Architecture check
1. Match existing folder, naming, and export conventions exactly.
2. Business logic must not import UI or infrastructure code directly.
3. No clear existing rule: report it. Do not invent one.

## Step 6. Quality review
1. Flag giant files, deep nesting, duplicated branches, and needless abstractions.
2. Fix in scope. List out-of-scope findings for the manager.
3. Final report: pass or fail, PR link, one-line reason.
