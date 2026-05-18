"use client";

import MsgReader from "@kenjiuno/msgreader";
import type { ParsedEmail } from "./parse-email";
import { parseEmailDate, detectForwardedMessage } from "./parse-email";

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

export async function parseMsgFile(file: File): Promise<ParsedEmail> {
  const buf = await file.arrayBuffer();
  return parseMsgBuffer(buf);
}

function parseMsgBuffer(buf: ArrayBuffer): ParsedEmail {
  const warnings: string[] = [];

  const reader = new MsgReader(buf);
  const data = reader.getFileData();

  if (data.error) {
    throw new Error(`Could not read .msg file: ${data.error}`);
  }

  // Prefer SMTP address over Exchange distinguished-name format
  const emailAddr =
    data.senderSmtpAddress?.trim() ||
    data.creatorSMTPAddress?.trim() ||
    (data.senderEmail?.trim().includes("@") ? data.senderEmail.trim() : undefined);

  const outerFrom =
    data.senderName?.trim() || emailAddr
      ? { name: data.senderName?.trim() || undefined, email: emailAddr }
      : null;

  // Date: transport headers → clientSubmitTime → messageDeliveryTime
  let outerDate: string | null = null;
  if (data.headers) {
    const m = data.headers.match(/^Date:\s*(.+)$/im);
    if (m) outerDate = parseEmailDate(m[1].trim());
  }
  if (!outerDate && data.clientSubmitTime) {
    outerDate = parseEmailDate(data.clientSubmitTime);
  }
  if (!outerDate && data.messageDeliveryTime) {
    outerDate = parseEmailDate(data.messageDeliveryTime);
  }

  const bodyText = data.body?.trim() ?? "";
  const htmlFallbackText = !bodyText && data.bodyHtml ? stripHtml(data.bodyHtml) : "";
  const effectiveText = bodyText || htmlFallbackText;

  if (!effectiveText) {
    warnings.push("No text body found in .msg file.");
  }

  // Try plain text first; fall back to stripped HTML so Outlook HTML-only forwards
  // still surface the original sender buried in the forwarded block.
  const forwarded =
    detectForwardedMessage(bodyText) ??
    (htmlFallbackText ? detectForwardedMessage(htmlFallbackText) : null);

  return {
    kind: "email",
    outerFrom,
    outerDate,
    originalFrom: forwarded?.from ?? null,
    originalDate: forwarded?.date ?? null,
    originalSubject: forwarded?.subject ?? null,
    body: (forwarded?.body ?? effectiveText).trim(),
    warnings,
  };
}
