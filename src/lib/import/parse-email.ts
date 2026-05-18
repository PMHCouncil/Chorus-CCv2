"use client";

export interface EmailSender {
  name?: string;
  email?: string;
}

export interface ParsedEmail {
  kind: "email";
  /** Who the outer email came from (the forwarder, if forwarded) */
  outerFrom: EmailSender | null;
  outerDate: string | null;
  /** Original sender if this is a forwarded email, otherwise null */
  originalFrom: EmailSender | null;
  originalDate: string | null;
  originalSubject: string | null;
  /** Body text of the original / only email */
  body: string;
  warnings: string[];
}

export async function parseEmailFile(file: File): Promise<ParsedEmail> {
  const text = await file.text();
  return parseEmlText(text);
}

export function parseEmlText(raw: string): ParsedEmail {
  const warnings: string[] = [];
  const { headers, body } = splitHeadersAndBody(raw);

  const outerFrom = parseAddressHeader(headers.get("from") ?? "");
  const outerDate = parseEmailDate(headers.get("date") ?? "");
  const contentType = headers.get("content-type") ?? "";
  const transferEncoding = (headers.get("content-transfer-encoding") ?? "").toLowerCase().trim();

  const bodyText = extractBodyText(body, contentType, transferEncoding, warnings);
  const forwarded = detectForwardedMessage(bodyText);

  return {
    kind: "email",
    outerFrom,
    outerDate,
    originalFrom: forwarded?.from ?? null,
    originalDate: forwarded?.date ?? null,
    originalSubject: forwarded?.subject ?? null,
    body: (forwarded?.body ?? bodyText).trim(),
    warnings,
  };
}

// ── Header parsing ──────────────────────────────────────────────────────────

function splitHeadersAndBody(raw: string): { headers: Map<string, string>; body: string } {
  // RFC 822: headers and body are separated by a blank line
  const blankLine = raw.search(/\r?\n\r?\n/);
  if (blankLine === -1) return { headers: parseHeaders(raw), body: "" };
  const headerSection = raw.slice(0, blankLine);
  const body = raw.slice(blankLine).replace(/^\r?\n\r?\n/, "");
  return { headers: parseHeaders(headerSection), body };
}

function parseHeaders(text: string): Map<string, string> {
  const headers = new Map<string, string>();
  // Unfold: continuation lines begin with whitespace (RFC 2822 §2.2.3)
  const unfolded = text.replace(/\r?\n[ \t]+/g, " ");
  for (const line of unfolded.split(/\r?\n/)) {
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (!headers.has(key)) headers.set(key, value);
  }
  return headers;
}

/**
 * Parses an address header value like:
 *   "Display Name <addr@example.com>"  or  "addr@example.com"
 */
export function parseAddressHeader(raw: string): EmailSender | null {
  if (!raw.trim()) return null;
  // "Name <email>" or "<email>"
  const angleMatch = raw.match(/^(.*?)\s*<([^>]*)>\s*$/);
  if (angleMatch) {
    const name = angleMatch[1].trim().replace(/^["']|["']$/g, "") || undefined;
    const email = angleMatch[2].trim() || undefined;
    return { name, email };
  }
  const plain = raw.trim();
  if (plain.includes("@")) return { email: plain };
  if (plain) return { name: plain };
  return null;
}

export function parseEmailDate(raw: string): string | null {
  if (!raw.trim()) return null;
  const d = new Date(raw.trim());
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

// ── Body extraction ─────────────────────────────────────────────────────────

function extractBodyText(
  body: string,
  contentType: string,
  transferEncoding: string,
  warnings: string[],
): string {
  const ct = contentType.toLowerCase();

  if (ct.startsWith("multipart/")) {
    const bMatch = contentType.match(/boundary="?([^";]+)"?/i);
    if (bMatch) {
      const result = extractMultipartText(body, bMatch[1].trim(), warnings);
      if (result !== null) return result;
    }
    warnings.push("Could not parse MIME multipart; using raw body.");
  }

  // Single-part: decode if needed
  return decodePart(body, transferEncoding, warnings);
}

function extractMultipartText(
  body: string,
  boundary: string,
  warnings: string[],
): string | null {
  const delimiter = "--" + boundary;
  const parts = body.split(new RegExp(escRe(delimiter) + "(?:--)?", "g"));

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const { headers, body: partBody } = splitHeadersAndBody(trimmed);
    const ct = (headers.get("content-type") ?? "").toLowerCase();
    const enc = (headers.get("content-transfer-encoding") ?? "").toLowerCase().trim();

    if (ct.startsWith("text/plain")) {
      return decodePart(partBody, enc, warnings);
    }
    // Recurse into nested multipart (e.g. multipart/alternative)
    if (ct.startsWith("multipart/")) {
      const nb = (headers.get("content-type") ?? "").match(/boundary="?([^";]+)"?/i);
      if (nb) {
        const nested = extractMultipartText(partBody, nb[1].trim(), warnings);
        if (nested !== null) return nested;
      }
    }
  }
  return null;
}

function decodePart(text: string, encoding: string, warnings: string[]): string {
  if (encoding === "base64") {
    try {
      return atob(text.replace(/\s/g, ""));
    } catch {
      warnings.push("Could not decode base64 email body.");
      return text;
    }
  }
  if (encoding === "quoted-printable") {
    return decodeQP(text);
  }
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function decodeQP(text: string): string {
  return text
    .replace(/=\r?\n/g, "")
    .replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

// ── Forwarded message detection ─────────────────────────────────────────────

interface ForwardedInfo {
  from: EmailSender | null;
  date: string | null;
  subject: string | null;
  body: string;
}

// Order matters: more specific patterns first
const FORWARD_MARKERS: RegExp[] = [
  /^-{3,}\s*Forwarded message\s*-{3,}/im,   // Gmail
  /^-{3,}\s*Original Message\s*-{3,}/im,     // Outlook
  /^-{3,}\s*Forwarded by\s+/im,              // Lotus / old Outlook
  /^Begin forwarded message:/im,              // Apple Mail
  /^-{3,}\s*Forwarded email\s*-{3,}/im,
];

export function detectForwardedMessage(body: string): ForwardedInfo | null {
  for (const marker of FORWARD_MARKERS) {
    const match = body.match(marker);
    if (!match || match.index === undefined) continue;

    const afterMarker = body.slice(match.index + match[0].length);
    const lines = afterMarker.split(/\r?\n/);

    const forwardedHeaders = new Map<string, string>();
    let bodyStartLine = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Blank line ends the forwarded-message header block
      if (line.trim() === "") {
        bodyStartLine = i + 1;
        break;
      }
      const headerMatch = line.match(/^(From|Date|Sent|To|Cc|Subject):\s*(.*)/i);
      if (headerMatch) {
        const key = headerMatch[1].toLowerCase();
        if (!forwardedHeaders.has(key)) forwardedHeaders.set(key, headerMatch[2].trim());
      }
    }

    const forwardedBody = lines.slice(bodyStartLine).join("\n").trim();

    return {
      from: parseAddressHeader(forwardedHeaders.get("from") ?? ""),
      date: parseEmailDate(
        forwardedHeaders.get("date") ?? forwardedHeaders.get("sent") ?? "",
      ),
      subject: forwardedHeaders.get("subject") ?? null,
      body: forwardedBody || afterMarker.trim(),
    };
  }
  return null;
}

function escRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
