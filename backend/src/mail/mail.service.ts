import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_PORT === '465',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    const from = process.env.SMTP_FROM || 'Rateio App <noreply@rateio.app>';

    const html = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </head>
      <body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 0;">
          <tr>
            <td align="center">
              <table width="480" cellpadding="0" cellspacing="0"
                style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
                <tr>
                  <td style="background:#81007F;padding:32px;text-align:center;">
                    <h1 style="margin:0;color:#FFFF00;font-size:24px;letter-spacing:1px;">Rateio App</h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding:40px 32px 24px;">
                    <h2 style="margin:0 0 16px;color:#333;font-size:20px;">Recuperação de Senha</h2>
                    <p style="margin:0 0 24px;color:#555;font-size:15px;line-height:1.6;">
                      Recebemos uma solicitação para redefinir a senha da sua conta.
                      Use o código abaixo para criar uma nova senha:
                    </p>
                    <div style="background:#f9f0ff;border:2px dashed #81007F;border-radius:12px;
                                padding:24px;text-align:center;margin:0 0 24px;">
                      <p style="margin:0 0 8px;color:#81007F;font-size:13px;font-weight:600;
                                letter-spacing:2px;text-transform:uppercase;">Seu código</p>
                      <span style="font-size:40px;font-weight:bold;color:#81007F;letter-spacing:12px;">
                        ${token}
                      </span>
                    </div>
                    <p style="margin:0 0 8px;color:#888;font-size:13px;">
                      ⏱ Este código expira em <strong>1 hora</strong>.
                    </p>
                    <p style="margin:0;color:#888;font-size:13px;">
                      Se você não solicitou a redefinição de senha, ignore este email.
                      Sua senha permanecerá a mesma.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="background:#fafafa;border-top:1px solid #eee;
                              padding:16px 32px;text-align:center;">
                    <p style="margin:0;color:#bbb;font-size:12px;">
                      © Rateio App — Este é um email automático, não responda.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    try {
      await this.transporter.sendMail({
        from,
        to: email,
        subject: 'Recuperação de senha — Rateio App',
        html,
      });
      this.logger.log(`Password reset email sent to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send password reset email to ${email}`, error);
      throw error;
    }
  }
}
