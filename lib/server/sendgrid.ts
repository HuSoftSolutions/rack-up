import sgMail from "@sendgrid/mail";

type InviteEmailPayload = {
  to: string;
  from: string;
  actionLink: string;
  displayName?: string | null;
  inviterEmail?: string | null;
  businessName?: string | null;
  role?: string | null;
};

let initialized = false;

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function initSendgrid() {
  if (initialized) return;
  const apiKey = getEnv("SENDGRID_API_KEY");
  sgMail.setApiKey(apiKey);
  initialized = true;
}

export async function sendInviteEmail(payload: InviteEmailPayload) {
  initSendgrid();
  const templateId = process.env.SENDGRID_INVITE_TEMPLATE_ID || "";

  const roleLabel = payload.role ? payload.role : "member";
  const businessLabel = payload.businessName ? `Business: ${payload.businessName}` : "";
  const inviterLabel = payload.inviterEmail ? `Invited by ${payload.inviterEmail}` : "Invited by admin";

  if (templateId) {
    await sgMail.send({
      to: payload.to,
      from: payload.from,
      templateId,
      dynamicTemplateData: {
        inviteLink: payload.actionLink,
        email: payload.to,
        displayName: payload.displayName ?? "",
        inviterEmail: payload.inviterEmail ?? "",
        businessName: payload.businessName ?? "",
        role: payload.role ?? "",
      },
    });
    return;
  }

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

  await sgMail.send({
    to: payload.to,
    from: payload.from,
    subject,
    text,
    html,
  });
}
