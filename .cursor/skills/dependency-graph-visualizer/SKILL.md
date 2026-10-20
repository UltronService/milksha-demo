---
name: dependency-graph-visualizer
description: Use right after blast-radius finds the impact of a change. Draws the module dependencies as a Mermaid diagram for the manager.
---
# Dependency graph visualizer

## Steps
1. Take the impacted modules from the blast-radius result.
2. Find the calls and imports between these modules.
3. Draw a Mermaid `graph TD` diagram. Mark the changed module, core utilities, APIs, and data flow direction.
4. Keep the diagram to the impacted modules only. Group the rest as one node.
5. Under the diagram, write 3 lines at most: what changes, what is at risk, what must be tested.

## Rules
- The text for the manager follows ASD-STE100 rules in Traditional Chinese.
- Do not include secrets. Write them as <REDACTED>.
