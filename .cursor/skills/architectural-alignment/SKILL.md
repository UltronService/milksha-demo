---
name: architectural-alignment
description: Use after any refactor or file split, before review. Checks that new or moved files match the project's existing architecture boundaries.
---
# Architectural alignment

## Steps
1. Scan the directory structure. Identify the existing patterns (for example, frontend component split or backend layers).
2. Write down the rules you found: folder per layer, file naming, export style.
3. Check each new or moved file against these rules: name, export style, folder location.
4. Check imports. Business logic must not import UI or infrastructure code directly.
5. Report each violation with file path, rule broken, and fix.

## Rules
- Match existing conventions exactly. Do not invent a new pattern.
- If the project has no clear rule, report it. Do not decide alone.
- Run before thermo-nuclear-code-quality-review.
