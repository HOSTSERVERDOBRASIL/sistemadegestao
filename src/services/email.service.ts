import nodemailer from 'nodemailer';

interface MailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

function createTransporter() {
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER ?? '',
      pass: process.env.SMTP_PASS ?? '',
    },
  });
}

export async function sendMail(opts: MailOptions): Promise<{ ok: boolean; error?: string }> {
  const transporter = createTransporter();
  if (!transporter) {
    console.warn('[email] SMTP_HOST não configurado — e-mail não enviado:', opts.subject);
    return { ok: false, error: 'SMTP não configurado' };
  }
  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text ?? opts.html.replace(/<[^>]+>/g, ''),
    });
    return { ok: true };
  } catch (err: any) {
    console.error('[email] Erro ao enviar:', err.message);
    return { ok: false, error: err.message };
  }
}

export function templatePortalToken(opts: {
  clienteNome: string;
  pedidoNumero: string;
  portalUrl: string;
  expiresAt: Date;
  escopo: string;
  empresaNome?: string;
}): { subject: string; html: string } {
  const empresa = opts.empresaNome ?? 'AtlasX';
  const expStr = opts.expiresAt.toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' });
  const escopoLabel: Record<string, string> = {
    acompanhamento: 'acompanhar o andamento',
    envio_documentos: 'enviar documentos',
    aceite: 'aceitar a proposta',
    formulario_icp: 'preencher o formulário ICP-Brasil',
    completo: 'visualizar, enviar documentos e aceitar',
  };
  const acao = escopoLabel[opts.escopo] ?? opts.escopo;

  const subject = `[${empresa}] Acesso ao seu pedido ${opts.pedidoNumero}`;
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">
        <tr>
          <td style="background:#1e40af;padding:28px 32px">
            <h1 style="margin:0;color:#fff;font-size:1.25rem;font-weight:700">${empresa}</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:32px">
            <p style="margin:0 0 8px;font-size:1rem;color:#1e293b">Olá, <strong>${opts.clienteNome}</strong>!</p>
            <p style="margin:0 0 24px;font-size:0.95rem;color:#475569">
              Você recebeu um link de acesso para <strong>${acao}</strong> do pedido <strong>${opts.pedidoNumero}</strong>.
            </p>
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px">
              <tr>
                <td align="center">
                  <a href="${opts.portalUrl}"
                     style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:1rem;font-weight:600;letter-spacing:.01em">
                    Acessar meu pedido
                  </a>
                </td>
              </tr>
            </table>
            <p style="margin:0 0 8px;font-size:0.8rem;color:#94a3b8;text-align:center">
              Ou copie o link abaixo no seu navegador:
            </p>
            <p style="margin:0 0 24px;font-size:0.78rem;color:#64748b;text-align:center;word-break:break-all">
              ${opts.portalUrl}
            </p>
            <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 20px">
            <p style="margin:0;font-size:0.8rem;color:#94a3b8">
              ⏱ Este link é válido até <strong>${expStr}</strong> e é de uso pessoal — não compartilhe.
              <br>Se você não solicitou este acesso, ignore este e-mail.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  return { subject, html };
}
