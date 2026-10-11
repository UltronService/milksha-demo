import { test, expect } from '@playwright/test';
import { primeBoardForAnimation } from './board-animation-helpers.mjs';

test.describe('ready fade regression (browser WAAPI)', () => {
  test('animateReadyPulse: cancel must leave chip opaque', async ({ page }) => {
    await primeBoardForAnimation(page);
    const result = await page.evaluate(async () => {
      const Anim = window.QMS.MilkshaBoardAnim;
      const el = document.createElement('div');
      el.className = 'milksha-board-chip';
      document.body.appendChild(el);
      let generation = 1;
      const done = Anim.animateReadyPulse(el, 1.3, 300, 3000, 300, 1, () => generation);
      const anims = el.getAnimations();
      if (!anims.length) {
        return { error: 'no WAAPI animation', inline: el.style.opacity };
      }
      anims[0].cancel();
      await done;
      return { inline: el.style.opacity, computed: getComputedStyle(el).opacity };
    });

    expect(result.error).toBeUndefined();
    expect(
      result.inline,
      `regression: cancelled ready pulse must snap inline opacity to 1 (got inline=${result.inline} computed=${result.computed})`,
    ).toBe('1');
  });
});
