const nodemailer = require('nodemailer');
require('dotenv').config();


async function createTransporter() {
  if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  }
 
  const testAccount = await nodemailer.createTestAccount();
  return nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    secure: false,
    auth: {
      user: testAccount.user,
      pass: testAccount.pass,
    },
  });
}


function formatInterviewTime(dt) {
  if (!dt) return 'TBD';
  const d = new Date(dt);
  return d.toLocaleString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Sending an email.
 * @param {object} opts
 * @param {string} opts.to       - recipient email
 * @param {string} opts.subject  - email subject
 * @param {string} opts.html     - HTML body
 * @param {string} [opts.text]   - plain-text fallback
 */
async function sendEmail({ to, subject, html, text }) {
  try {
    const transporter = await createTransporter();
    const fromAddr = process.env.EMAIL_USER
      ? `"RecruitApp" <${process.env.EMAIL_USER}>`
      : '"RecruitApp" <no-reply@recruitapp.com>';

    const info = await transporter.sendMail({
      from: fromAddr,
      to,
      subject,
      text: text || 'Please view this email in an HTML-capable client.',
      html,
    });

    console.log(`[Email] Sent to ${to} | messageId: ${info.messageId}`);
    if (!process.env.EMAIL_USER) {
      console.log(`[Email] Ethereal preview: ${nodemailer.getTestMessageUrl(info)}`);
    }
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error('[Email] Failed to send:', err.message);
    return { success: false, error: err.message };
  }
}


function buildAcceptanceEmailHtml({ candidateName, jobTitle, company, interviewTime, zoomLink, recruiterMessage }) {
  const timeStr = formatInterviewTime(interviewTime);
  const zoomSection = zoomLink
    ? `<div style="text-align:center;margin:28px 0">
         <a href="${zoomLink}"
            style="background:#2D8CFF;color:#fff;text-decoration:none;padding:14px 36px;
                   border-radius:8px;font-size:16px;font-weight:700;display:inline-block;">
           🎥 Join Interview
         </a>
         <p style="font-size:12px;color:#888;margin-top:8px">or copy link: <a href="${zoomLink}" style="color:#2D8CFF">${zoomLink}</a></p>
       </div>`
    : '';

  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f4f5f9;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0"
               style="background:#ffffff;border-radius:16px;overflow:hidden;
                      box-shadow:0 4px 24px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#3558D4,#5B8DEF);
                        padding:32px 40px;text-align:center;">
              <h1 style="color:#fff;margin:0;font-size:26px;font-weight:700;">🎉 Congratulations!</h1>
              <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:15px;">
                You've been selected for the next round
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;">
              <p style="font-size:16px;color:#333;margin:0 0 16px;">
                Hi <strong>${candidateName}</strong>,
              </p>
              <p style="font-size:15px;color:#555;line-height:1.6;margin:0 0 24px;">
                ${recruiterMessage || `We are pleased to inform you that you have been accepted for the <strong>${jobTitle}</strong> position at <strong>${company}</strong>.`}
              </p>

              <!-- Interview Card -->
              <div style="background:#f0f4ff;border-left:4px solid #3558D4;
                           border-radius:8px;padding:20px 24px;margin-bottom:24px;">
                <p style="margin:0 0 8px;font-size:13px;color:#3558D4;
                           font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">
                  📅 Interview Scheduled
                </p>
                <p style="margin:0;font-size:18px;font-weight:700;color:#1a1a2e;">
                  ${timeStr}
                </p>
                <p style="margin:6px 0 0;font-size:13px;color:#666;">
                  ${jobTitle} — ${company}
                </p>
              </div>

              ${zoomSection}

              <p style="font-size:13px;color:#888;line-height:1.6;margin:0;">
                Please make sure you join the meeting a few minutes early. 
                If you have any questions, reply to this email.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9f9f9;padding:20px 40px;text-align:center;
                        border-top:1px solid #eee;">
              <p style="margin:0;font-size:12px;color:#aaa;">
                This email was sent by RecruitApp · Do not reply if unintended
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}


function buildReminderEmailHtml({ candidateName, jobTitle, company, interviewTime, zoomLink }) {
  const timeStr = formatInterviewTime(interviewTime);
  const zoomSection = zoomLink
    ? `<div style="text-align:center;margin:28px 0">
         <a href="${zoomLink}"
            style="background:#FF6B35;color:#fff;text-decoration:none;padding:14px 36px;
                   border-radius:8px;font-size:16px;font-weight:700;display:inline-block;">
           ⚡ Join Interview Now
         </a>
         <p style="font-size:12px;color:#888;margin-top:8px">or copy link: <a href="${zoomLink}" style="color:#FF6B35">${zoomLink}</a></p>
       </div>`
    : '';

  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f4f5f9;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0"
               style="background:#ffffff;border-radius:16px;overflow:hidden;
                      box-shadow:0 4px 24px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#FF6B35,#FF9500);
                        padding:32px 40px;text-align:center;">
              <h1 style="color:#fff;margin:0;font-size:26px;font-weight:700;"> 1 Hour Reminder</h1>
              <p style="color:rgba(255,255,255,0.9);margin:8px 0 0;font-size:15px;">
                Your interview is starting soon!
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;">
              <p style="font-size:16px;color:#333;margin:0 0 16px;">
                Hi <strong>${candidateName}</strong>,
              </p>
              <p style="font-size:15px;color:#555;line-height:1.6;margin:0 0 24px;">
                This is a reminder that your interview for <strong>${jobTitle}</strong> 
                at <strong>${company}</strong> is <strong>starting in 1 hour</strong>.
              </p>

              <!-- Interview Card -->
              <div style="background:#fff5f0;border-left:4px solid #FF6B35;
                           border-radius:8px;padding:20px 24px;margin-bottom:24px;">
                <p style="margin:0 0 8px;font-size:13px;color:#FF6B35;
                           font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">
                   Interview Time
                </p>
                <p style="margin:0;font-size:18px;font-weight:700;color:#1a1a2e;">
                  ${timeStr}
                </p>
                <p style="margin:6px 0 0;font-size:13px;color:#666;">
                  ${jobTitle} — ${company}
                </p>
              </div>

              ${zoomSection}

              <p style="font-size:13px;color:#888;line-height:1.6;margin:0;">
                 <strong>Tip:</strong> Join a few minutes early to test your audio and video.
                Good luck! 
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9f9f9;padding:20px 40px;text-align:center;
                        border-top:1px solid #eee;">
              <p style="margin:0;font-size:12px;color:#aaa;">
                This email was sent by RecruitApp · Do not reply if unintended
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}


function buildVerificationEmailHtml(otp) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f4f5f9;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0"
               style="background:#ffffff;border-radius:16px;overflow:hidden;
                      box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg,#3558D4,#5B8DEF);
                        padding:32px 40px;text-align:center;">
              <h1 style="color:#fff;margin:0;font-size:26px;font-weight:700;">Verify Your Email</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:36px 40px;text-align:center;">
              <p style="font-size:16px;color:#333;margin:0 0 24px;">
                Thank you for joining <strong>RecruitApp</strong>! Please use the following code to verify your account:
              </p>
              <div style="background:#f0f4ff;border-radius:8px;padding:24px;display:inline-block;margin-bottom:24px;">
                <span style="font-size:32px;font-weight:700;letter-spacing:8px;color:#3558D4;">${otp}</span>
              </div>
              <p style="font-size:13px;color:#888;line-height:1.6;margin:0;">
                This code is valid for 10 minutes. If you did not request this, please ignore this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}


function buildForgotPasswordEmailHtml(tempPassword, name) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f4f5f9;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0"
               style="background:#ffffff;border-radius:16px;overflow:hidden;
                      box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg,#FF6B35,#FF9500);
                        padding:32px 40px;text-align:center;">
              <h1 style="color:#fff;margin:0;font-size:26px;font-weight:700;">Password Reset</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:36px 40px;">
              <p style="font-size:16px;color:#333;margin:0 0 16px;">
                Hi <strong>${name}</strong>,
              </p>
              <p style="font-size:15px;color:#555;line-height:1.6;margin:0 0 24px;">
                We received a request to reset your password. You can log in using this temporary password:
              </p>
              <div style="background:#fff5f0;border-left:4px solid #FF6B35;
                           border-radius:8px;padding:20px 24px;margin-bottom:24px;text-align:center;">
                <span style="font-size:24px;font-weight:700;color:#1a1a2e;">${tempPassword}</span>
              </div>
              <p style="font-size:13px;color:#888;line-height:1.6;margin:0;">
                For security reasons, please change your password immediately after logging in.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

module.exports = {
  sendEmail,
  formatInterviewTime,
  buildAcceptanceEmailHtml,
  buildReminderEmailHtml,
  buildVerificationEmailHtml,
  buildForgotPasswordEmailHtml
};
