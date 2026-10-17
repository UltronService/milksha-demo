import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { redactSensitive } from '../lib/redact-sensitive.mjs';

describe('redactSensitive', () => {
  it('redacts emails', () => {
    const out = redactSensitive('contact qa@example.com please');
    assert.equal(out.includes('qa@example.com'), false);
    assert.match(out, /<REDACTED>/);
  });

  it('redacts bearer tokens', () => {
    const out = redactSensitive('Authorization: Bearer abcdefghijklmnop');
    assert.match(out, /Bearer <REDACTED>/);
  });

  it('preserves existing REDACTED placeholders', () => {
    const out = redactSensitive('already <REDACTED> here');
    assert.equal(out, 'already <REDACTED> here');
  });
});
