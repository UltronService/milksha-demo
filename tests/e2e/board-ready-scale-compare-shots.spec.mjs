import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SHOT_DIR = join(ROOT, 'artifacts', 'board-ready-fade-self-qa', 'screenshots');
const MANIFEST = join(SHOT_DIR, 'compare-shots-manifest.json');

function md5(path) {
  return createHash('md5').update(readFileSync(path)).digest('hex');
}

test.describe('ready scale compare screenshots (artifacts)', () => {
  test('manifest exists with safe/unsafe pairs and distinct md5', () => {
    expect(existsSync(MANIFEST)).toBe(true);
    const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
    expect(manifest.shots?.length).toBe(4);

    for (const vp of ['1920x1080', '3840x2160']) {
      const safe = manifest.shots.find((s) => s.viewport === vp && s.mode === 'safe');
      const unsafe = manifest.shots.find((s) => s.viewport === vp && s.mode === 'unsafe');
      expect(safe).toBeTruthy();
      expect(unsafe).toBeTruthy();
      expect(safe.readyNumbers?.length).toBe(10);
      expect(unsafe.readyNumbers?.length).toBe(10);
      expect(safe.fullboard).toBeTruthy();
      expect(unsafe.fullboard).toBeTruthy();
      const safeFull = join(SHOT_DIR, safe.fullboard);
      const unsafeFull = join(SHOT_DIR, unsafe.fullboard);
      const safeZoom = join(SHOT_DIR, safe.zoom2x);
      const unsafeZoom = join(SHOT_DIR, unsafe.zoom2x);
      expect(existsSync(safeFull)).toBe(true);
      expect(existsSync(unsafeFull)).toBe(true);
      expect(existsSync(safeZoom)).toBe(true);
      expect(existsSync(unsafeZoom)).toBe(true);

      const safeMd5 = md5(safeFull);
      const unsafeMd5 = md5(unsafeFull);
      expect(safeMd5).not.toBe(unsafeMd5);
      expect(safe.measuredScale).toBeLessThan(1.25);
      expect(unsafe.measuredScale).toBeGreaterThan(1.27);
      expect(unsafe.measuredScale).toBeLessThan(1.34);
    }
  });
});
