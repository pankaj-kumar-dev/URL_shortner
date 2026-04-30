// Malicious URL validation — no external API, pure heuristics

// Block private/loopback IP ranges (SSRF prevention)
const PRIVATE_IP_REGEX =
  /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.0\.0\.0|::1|localhost)/i;

// Suspicious TLDs commonly used in phishing
const SUSPICIOUS_TLDS = new Set([
  '.tk', '.ml', '.ga', '.cf', '.gq',  // Freenom abuse-heavy TLDs
  '.xyz', '.top', '.click', '.link',  // High phishing rate
  '.zip', '.mov',                     // Google TLDs abused for phishing
]);

// Known malicious keyword patterns in hostname
const SUSPICIOUS_HOSTNAME_PATTERNS = [
  /paypal.*login/i,
  /login.*paypal/i,
  /apple.*id.*verify/i,
  /secure.*banking/i,
  /account.*verify.*\d/i,
  /free.*crypto/i,
  /wallet.*connect.*web3/i,
];

// Blocked schemes — only http/https allowed
const ALLOWED_SCHEMES = new Set(['http:', 'https:']);

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

export function validateUrl(rawUrl: string): ValidationResult {
  let parsed: URL;

  try {
    parsed = new URL(rawUrl);
  } catch {
    return { valid: false, reason: 'Invalid URL format' };
  }

  // 1. Scheme check
  if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
    return { valid: false, reason: `Scheme "${parsed.protocol}" not allowed` };
  }

  const hostname = parsed.hostname.toLowerCase();

  // 2. Private/loopback IP (SSRF)
  if (PRIVATE_IP_REGEX.test(hostname)) {
    return { valid: false, reason: 'Private or loopback addresses not allowed' };
  }

  // 3. Suspicious TLD
  const tld = '.' + hostname.split('.').pop();
  if (SUSPICIOUS_TLDS.has(tld)) {
    return { valid: false, reason: `TLD "${tld}" is not permitted` };
  }

  // 4. Hostname pattern matching
  for (const pattern of SUSPICIOUS_HOSTNAME_PATTERNS) {
    if (pattern.test(hostname)) {
      return { valid: false, reason: 'URL matches known phishing pattern' };
    }
  }

  // 5. Excessively long URL (common in obfuscation attacks)
  if (rawUrl.length > 2048) {
    return { valid: false, reason: 'URL exceeds maximum length of 2048 characters' };
  }

  // 6. Multiple consecutive dots or dashes (typosquatting signals)
  if (/\.{2,}/.test(hostname) || /-{3,}/.test(hostname)) {
    return { valid: false, reason: 'Suspicious hostname pattern detected' };
  }

  return { valid: true };
}
