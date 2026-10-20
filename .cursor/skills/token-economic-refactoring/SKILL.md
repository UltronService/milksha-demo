---
name: token-economic-refactoring
description: Use for every refactor or edit task in Composer. Keeps edits small, saves tokens, and prevents overwriting unchanged code.
---
# Token-economic refactoring

## Steps
1. Before editing, list the target: file, function names, or line ranges.
2. Limit one task to 1–2 closely related files. Split larger work into separate tasks.
3. Edit only the listed ranges. Do not rewrite unchanged code.
4. When showing code, show only changed parts. Mark skipped parts with `// ... existing code ...`.
5. After editing, confirm that no lines outside the listed ranges changed.

## Rules
- Do not regenerate whole files.
- Do not paste unchanged code into the chat.
- If the change needs more files than planned, stop and report.
