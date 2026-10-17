/**
 * Privacy protection utility.
 * Scrubs identifiable personal information (Phone numbers, ABHA IDs, Patient names)
 * before transcripts are sent to external LLMs.
 */

// Phone numbers: Indian formats (+91, 0, or raw 10-digit starting with 6-9, with optional spaces/dashes)
const PHONE_REGEX = /(\+91[\-\s]?)?[0]?[6-9]\d{4}[\-\s]?\d{5}\b/g;

// ABHA ID: 14 digits (either grouped 12-3456-7890-1234 or continuous 14 digits)
const ABHA_REGEX = /\b\d{2}[\-]\d{4}[\-]\d{4}[\-]\d{4}\b|\b\d{14}\b/g;

// Name introduction patterns (English, Hinglish, Devanagari)
const NAME_PATTERNS = [
  /(?:my\s+name\s+is|i\s+am|name\s*[:\-])\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi,
  /(?:mera\s+naam|humara\s+naam|naam\s*[:\-])\s+([a-zA-Z\u0900-\u097F]+(?:\s+[a-zA-Z\u0900-\u097F]+)*)\s*(?:hai|hoon)?/gi,
  /(?:मेरा\s+नाम|नाम\s*[:\-])\s+([\u0900-\u097F]+(?:\s+[\u0900-\u097F]+)*)\s*(?:है)?/gi,
];

export interface ScrubResult {
  scrubbedText: string;
  hasRedactions: boolean;
  redactedTypes: string[];
}

/**
 * Removes PII from raw patient input before sending to LLMs.
 */
export function scrubPII(text: string): ScrubResult {
  let result = text;
  const redactedTypes: Set<string> = new Set();

  // 1. Scrub Phone Numbers
  if (PHONE_REGEX.test(result)) {
    result = result.replace(PHONE_REGEX, "[PHONE_REDACTED]");
    redactedTypes.add("phone");
  }

  // 2. Scrub ABHA IDs
  if (ABHA_REGEX.test(result)) {
    result = result.replace(ABHA_REGEX, "[ABHA_REDACTED]");
    redactedTypes.add("abha_id");
  }

  // 3. Scrub Names in common self-introductions
  for (const pattern of NAME_PATTERNS) {
    result = result.replace(pattern, (match, p1) => {
      redactedTypes.add("name");
      return match.replace(p1, "[NAME_REDACTED]");
    });
  }

  return {
    scrubbedText: result,
    hasRedactions: redactedTypes.size > 0,
    redactedTypes: Array.from(redactedTypes),
  };
}
