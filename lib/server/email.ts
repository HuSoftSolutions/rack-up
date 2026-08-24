import { Resend } from "resend";

type PasswordResetEmailPayload = {
  to: string;
  from: string;
  actionLink: string;
};

type InviteEmailPayload = {
  to: string;
  from: string;
  actionLink: string;
  displayName?: string | null;
  inviterEmail?: string | null;
  businessName?: string | null;
  role?: string | null;
};

let client: Resend | null = null;

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function getClient(): Resend {
  if (!client) {
    client = new Resend(getEnv("RESEND_API_KEY"));
  }
  return client;
}

// Bare addresses get a display name; addresses already in "Name <addr>" form
// pass through unchanged.
function formatFrom(from: string): string {
  return from.includes("<") ? from : `Rack Up <${from}>`;
}

async function send(options: {
  to: string;
  from: string;
  subject: string;
  text: string;
  html: string;
}) {
  const { error } = await getClient().emails.send({
    to: options.to,
    from: formatFrom(options.from),
    subject: options.subject,
    text: options.text,
    html: options.html,
  });
  if (error) {
    throw new Error(`Resend error: ${error.message}`);
  }
}

export async function sendPasswordResetEmail(payload: PasswordResetEmailPayload) {
  const subject = "Reset your Rack Up password";
  const text = [
    "We received a request to reset the password for your Rack Up account.",
    "",
    "Reset your password using this link:",
    payload.actionLink,
    "",
    "If you didn't request this, you can safely ignore this email — your password won't change.",
  ].join("\n");

  const html = `
    <div style="font-family:Arial, sans-serif; line-height:1.5; color:#111;">
      <h2>Reset your Rack Up password</h2>
      <p>We received a request to reset the password for your Rack Up account.</p>
      <p>
        <a href="${payload.actionLink}" style="color:#0ea5e9;">Reset your password</a>
      </p>
      <p style="font-size:12px;color:#555;">If the button doesn't work, copy and paste this link:</p>
      <p style="font-size:12px;color:#555;">${payload.actionLink}</p>
      <p style="font-size:12px;color:#555;">If you didn't request this, you can safely ignore this email — your password won't change.</p>
    </div>
  `;

  await send({ to: payload.to, from: payload.from, subject, text, html });
}

export async function sendInviteEmail(payload: InviteEmailPayload) {
  const roleLabel = payload.role ? payload.role : "member";
  const businessLabel = payload.businessName ? `Business: ${payload.businessName}` : "";
  const inviterLabel = payload.inviterEmail ? `Invited by ${payload.inviterEmail}` : "Invited by admin";

  const subject = "You're invited to Rack Up";
  const text = [
    "You're invited to Rack Up.",
    businessLabel,
    `Role: ${roleLabel}`,
    inviterLabel,
    "",
    "Set your password and sign in using this link:",
    payload.actionLink,
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
    <div style="font-family:Arial, sans-serif; line-height:1.5; color:#111;">
      <h2>You're invited to Rack Up</h2>
      ${payload.businessName ? `<p><strong>Business:</strong> ${payload.businessName}</p>` : ""}
      <p><strong>Role:</strong> ${roleLabel}</p>
      <p>${inviterLabel}</p>
      <p>
        <a href="${payload.actionLink}" style="color:#0ea5e9;">Set your password and sign in</a>
      </p>
      <p style="font-size:12px;color:#555;">If the button doesn't work, copy and paste this link:</p>
      <p style="font-size:12px;color:#555;">${payload.actionLink}</p>
    </div>
  `;

  await send({ to: payload.to, from: payload.from, subject, text, html });
}
