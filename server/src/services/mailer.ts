import nodemailer from 'nodemailer';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export type SendMethod = 'graph' | 'smtp' | 'mock';

export interface SendResult {
  ok: boolean;
  method: SendMethod;
  error?: string;
}

// ─── Microsoft Graph email ──────────────────────────────────────────────────

async function sendViaGraph(msg: MailMessage): Promise<SendResult> {
  try {
    const { ClientSecretCredential } = await import('@azure/identity');
    const { Client: GraphClient } = await import('@microsoft/microsoft-graph-client');
    const { TokenCredentialAuthenticationProvider } = await import(
      '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials/index.js' as any
    );

    const credential = new ClientSecretCredential(
      process.env.AZURE_TENANT_ID!,
      process.env.AZURE_CLIENT_ID!,
      process.env.AZURE_CLIENT_SECRET!,
    );

    const authProvider = new TokenCredentialAuthenticationProvider(credential, {
      scopes: ['https://graph.microsoft.com/.default'],
    });

    const client = GraphClient.initWithMiddleware({ authProvider });
    const from = process.env.SMTP_FROM || 'no-reply@microgenesis.com';

    await client.api(`/users/${from}/sendMail`).post({
      message: {
        subject: msg.subject,
        body: {
          contentType: msg.html ? 'HTML' : 'Text',
          content: msg.html || msg.text,
        },
        toRecipients: msg.to.split(',').map(addr => ({
          emailAddress: { address: addr.trim() },
        })),
      },
      saveToSentItems: false,
    });

    return { ok: true, method: 'graph' };
  } catch (err: any) {
    console.error('[Graph sendEmail]', err?.message || err);
    return { ok: false, method: 'graph', error: err?.message };
  }
}

// ─── SMTP email ─────────────────────────────────────────────────────────────

async function sendViaSMTP(msg: MailMessage): Promise<SendResult> {
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });

  try {
    await transport.sendMail({
      from: process.env.SMTP_FROM || 'Microgenesis Supply Chain Portal <no-reply@microgenesis.example>',
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
      ...(msg.html ? { html: msg.html } : {}),
    });
    return { ok: true, method: 'smtp' };
  } catch (err: any) {
    console.error('[SMTP sendEmail]', err?.message || err);
    return { ok: false, method: 'smtp', error: err?.message };
  }
}

// ─── Mock (console) email ───────────────────────────────────────────────────

async function sendViaMock(msg: MailMessage): Promise<SendResult> {
  console.log('--- [MOCK EMAIL] ---------------------------------------');
  console.log(`To: ${msg.to}\nSubject: ${msg.subject}\n\n${msg.text}`);
  console.log('----------------------------------------------------------');
  return { ok: true, method: 'mock' };
}

// ─── Unified entry point ────────────────────────────────────────────────────

export async function sendEmail(msg: MailMessage): Promise<SendResult> {
  if (process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET && process.env.AZURE_TENANT_ID) {
    return sendViaGraph(msg);
  }

  if (process.env.SMTP_HOST) {
    return sendViaSMTP(msg);
  }

  return sendViaMock(msg);
}

// Legacy aliases — used by existing code (notify.ts, index.ts)
export const sendMail = sendEmail;
export const sendMailReal = sendEmail;
