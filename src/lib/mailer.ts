import "server-only";

/**
 * Outbound email — stubbed to the server console for the MVP (Phase 3.2).
 *
 * Everything the app sends goes through `sendMail`, so swapping in Resend /
 * SES / Postmark later means replacing one function body, not hunting down
 * call sites.
 */
export type MailMessage = {
  to: string;
  subject: string;
  body: string;
};

export async function sendMail(message: MailMessage): Promise<void> {
  console.info(
    [
      "",
      "──────────── ✉  EMAIL (stubbed — not actually sent) ────────────",
      `To:      ${message.to}`,
      `Subject: ${message.subject}`,
      "",
      message.body,
      "───────────────────────────────────────────────────────────────",
      "",
    ].join("\n"),
  );
}

export async function sendPasswordResetEmail(params: {
  to: string;
  username: string;
  resetUrl: string;
  expiresAt: Date;
}): Promise<void> {
  const minutes = Math.max(1, Math.round((params.expiresAt.getTime() - Date.now()) / 60_000));

  await sendMail({
    to: params.to,
    subject: "Reset your BuggedOut password",
    body: [
      `Hi ${params.username},`,
      "",
      "Someone asked to reset the password on your BuggedOut account.",
      `Open this link to choose a new one — it expires in ${minutes} minutes and works once:`,
      "",
      params.resetUrl,
      "",
      "If this wasn't you, ignore this email; your password stays as it is.",
    ].join("\n"),
  });
}
