# Proposed fix acceptance boundary

1. **Geometry:** During `data-column-move-anim=1`, every visible frame of the pushed chip (enter-from-above path) must stay inside `.milksha-cream` and never intersect `.milksha-ztitle`.
2. **Viewports:** 1920×1080 and 3840×2160.
3. **Zones:** Both `prep` and `ready` on 5→6 overflow.
4. **Regression:** Existing column-move motion specs (exit down, transform direction) remain green once clip is fixed.
5. **Optional (#52):** Backfill enter-from-below at left-bottom slot — assert no `below-cream` overlap with zone chrome under cream padding.

Spec: `tests/e2e/board-colmove-clip.spec.mjs`
