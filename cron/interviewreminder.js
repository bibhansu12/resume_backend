
const cron = require('node-cron');
const db = require('../database/db');
const {
  sendEmail,
  buildReminderEmailHtml,
  formatInterviewTime,
} = require('../service/emailService');


const startInterviewReminderCron = () => {

  
  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date();
      const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);       
      const oneHourLaterBuffer = new Date(now.getTime() + 61 * 60 * 1000); 

      const formatDate = (d) =>
        d.toISOString().slice(0, 19).replace('T', ' ');

      
      const [rows] = await db.query(
        `SELECT
           n.id            AS notification_id,
           n.candidate_id,
           n.recruiter_id,
           n.application_id,
           n.job_id,
           n.zoom_link,
           n.interview_time,
           u.email         AS candidate_email,
           u.name          AS candidate_name,
           j.title         AS job_title,
           j.company       AS job_company
         FROM notifications n
         JOIN users u ON u.id = n.candidate_id
         JOIN jobs  j ON j.id = n.job_id
         WHERE n.interview_time IS NOT NULL
           AND n.interview_time >= ?
           AND n.interview_time < ?
           AND n.reminder_sent = 0`,
        [formatDate(oneHourLater), formatDate(oneHourLaterBuffer)]
      );

      console.log(
        `[Cron] Interview reminder: found ${rows.length} upcoming interviews`
      );

      for (const n of rows) {
        try {
          const reminderMsg =
            ` Reminder: Your interview for "${n.job_title}" at ${n.job_company} ` +
            `is in 1 hour!  ${formatInterviewTime(n.interview_time)}`;

          
          await db.query(
            `INSERT INTO notifications
               (candidate_id, recruiter_id, application_id, job_id,
                message, zoom_link, is_read, created_at, interview_time, reminder_sent)
             VALUES (?, ?, ?, ?, ?, ?, 0, NOW(), ?, 1)`,
            [
              n.candidate_id,
              n.recruiter_id,
              n.application_id,
              n.job_id,
              reminderMsg,
              n.zoom_link,
              n.interview_time,
            ]
          );

         
          await db.query(
            'UPDATE notifications SET reminder_sent = 1 WHERE id = ?',
            [n.notification_id]
          );

         
          if (n.candidate_email) {
            const html = buildReminderEmailHtml({
              candidateName: n.candidate_name,
              jobTitle: n.job_title,
              company: n.job_company,
              interviewTime: n.interview_time,
              zoomLink: n.zoom_link,
            });

            sendEmail({
              to: n.candidate_email,
              subject: ` Reminder: Your interview starts in 1 hour  ${n.job_title} at ${n.job_company}`,
              html,
              text: reminderMsg,
            }).then(() => {
              console.log(`[Cron] Reminder email sent to ${n.candidate_email}`);
            }).catch((err) => {
              console.error(`[Cron] Reminder email failed for ${n.candidate_email}:`, err.message);
            });
          }

        } catch (err) {
          console.error(
            `[Cron] Error processing reminder for notification ${n.notification_id}:`,
            err.message
          );
        }
      }
    } catch (err) {
      console.error('[Cron] Interview reminder error:', err.message);
    }
  });

  console.log('[Cron] Interview 1-hour reminder cron started');
};

module.exports = { startInterviewReminderCron };
