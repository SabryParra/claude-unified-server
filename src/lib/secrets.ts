/**
 * secrets.ts — client-side secret detection and stripping before push.
 *
 * Server also runs a looser check, but we want to catch secrets early
 * on the client to avoid a round-trip rejection.
 */

const SECRET_PATTERNS: RegExp[] = [
  /ghp_[a-zA-Z0-9]{36,}/g,
  /gho_[a-zA-Z0-9]{36,}/g,
  /github_pat_[a-zA-Z0-9_]{82,}/g,
  /sk-[a-zA-Z0-9]{20,}/g,
  /xoxb-[a-zA-Z0-9-]{24,}/g,
  /AKIA[A-Z0-9]{16}/g,
  /\bey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
];

export interface StripResult {
  content: string;
  detected: boolean;
  count: number;
}

export function stripSecrets(content: string): StripResult {
  let result = content;
  let count = 0;

  for (const pattern of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    const matches = result.match(pattern);
    if (matches) {
      count += matches.length;
      pattern.lastIndex = 0;
      result = result.replace(pattern, '[REDACTED]');
    }
  }

  return { content: result, detected: count > 0, count };
}

export function sanitizeSettings(raw: string): string {
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    delete obj['env'];
    const { detected, content } = stripSecrets(JSON.stringify(obj, null, 2));
    if (detected) {
      console.warn('⚠️  Secrets detected and stripped from settings.json');
    }
    return content;
  } catch {
    return raw;
  }
}

export function hasSecrets(content: string): boolean {
  return SECRET_PATTERNS.some((p) => {
    p.lastIndex = 0;
    const found = p.test(content);
    p.lastIndex = 0;
    return found;
  });
}
