import { describe, it, expect } from 'bun:test';
import { stripSecrets, sanitizeSettings, hasSecrets } from '~/lib/secrets.ts';

describe('stripSecrets', () => {
  it('returns original content unchanged when no secrets present', () => {
    const content = '# My Skill\nThis is a helpful skill.';
    const result = stripSecrets(content);
    expect(result.content).toBe(content);
    expect(result.detected).toBe(false);
    expect(result.count).toBe(0);
  });

  it('strips GitHub PAT (ghp_)', () => {
    const secret = 'ghp_' + 'A'.repeat(36);
    const content = `token: ${secret}`;
    const result = stripSecrets(content);
    expect(result.content).toBe('token: [REDACTED]');
    expect(result.detected).toBe(true);
    expect(result.count).toBe(1);
  });

  it('strips GitHub OAuth token (gho_)', () => {
    const secret = 'gho_' + 'B'.repeat(36);
    const result = stripSecrets(`auth: ${secret}`);
    expect(result.detected).toBe(true);
    expect(result.content).toContain('[REDACTED]');
  });

  it('strips OpenAI-style key (sk-)', () => {
    const secret = 'sk-' + 'x'.repeat(48);
    const result = stripSecrets(`OPENAI_API_KEY=${secret}`);
    expect(result.detected).toBe(true);
    expect(result.content).toBe('OPENAI_API_KEY=[REDACTED]');
  });

  it('strips AWS access key ID', () => {
    const result = stripSecrets('key: AKIAIOSFODNN7EXAMPLE');
    expect(result.detected).toBe(true);
  });

  it('strips multiple secrets in one pass', () => {
    const a = 'ghp_' + 'A'.repeat(36);
    const b = 'sk-' + 'x'.repeat(20);
    const result = stripSecrets(`a=${a} b=${b}`);
    expect(result.count).toBe(2);
    expect(result.content).toBe('a=[REDACTED] b=[REDACTED]');
  });
});

describe('sanitizeSettings', () => {
  it('removes the env block', () => {
    const raw = JSON.stringify({ theme: 'dark', env: { ANTHROPIC_API_KEY: 'sk-' + 'x'.repeat(48) } });
    const result = sanitizeSettings(raw);
    const obj = JSON.parse(result);
    expect(obj.theme).toBe('dark');
    expect(obj.env).toBeUndefined();
  });

  it('returns content unchanged when no env block', () => {
    const raw = JSON.stringify({ theme: 'dark', model: 'claude-sonnet-4-6' });
    const result = sanitizeSettings(raw);
    expect(JSON.parse(result).theme).toBe('dark');
  });

  it('handles invalid JSON gracefully', () => {
    const raw = 'not json {{{';
    expect(sanitizeSettings(raw)).toBe(raw);
  });
});

describe('hasSecrets', () => {
  it('returns true when content contains a secret', () => {
    expect(hasSecrets('key: ghp_' + 'A'.repeat(36))).toBe(true);
  });

  it('returns false for clean content', () => {
    expect(hasSecrets('This is a normal markdown file.')).toBe(false);
  });
});
