"use client";

import MsgReader from "@kenjiuno/msgreader";
import type { ParsedEmail } from "./parse-email";
import { parseEmailDate, detectForwardedMessage } from "./parse-email";

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

  if (!bodyText) {
    if (data.bodyHtml) {
      warnings.push(
        "Only an HTML body was found in this .msg file; plain text was not available.",
      );
    } else {
      warnings.push("No text body found in .msg file.");
    }
  }

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
