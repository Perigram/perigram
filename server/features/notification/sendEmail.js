import logger from '~~/server/utils/logger';
import { connectDB } from '~~/server/db/mongo';

async function sendEmail(to, subject, htmlBody) {
  try {
    const response = await $fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${useRuntimeConfig().resendToken}`,
      },
      body: {
        from: 'isuo1991@outlook.com',
        to: to,
        subject: subject,
        html: htmlBody,
      },
    });
    logger.info('Email sent successfully!');
    logger.info('Response:', response);
    return true;
  } catch (error) {
    logger.warn(`Email notification skipped: ${error.message}`);
    return false;
  }
}

export async function sendNestFinishEmail(nestingJob) {
  const db = await connectDB();
  const project = await db.collection('projects').findOne({ 'identity.slug': nestingJob.projectSlug });
  const user = await db.collection('users').findOne({ _id: nestingJob.ownerId });
  if (!user || !project) {
    logger.error('User or project not found');
    throw createError({
      statusCode: 404,
      statusMessage: "User or project not found",
    });
  }
  try {
    const recipient = user.data?.email;
    const emailSubject = `Your nesting project ${project.identity?.name} is finished`;
    const emailBody = `
      <p>Your nesting project ${project.identity?.name} is finished</p>
      <p>You can view the project <a href="${useRuntimeConfig().public.baseUrl}/project/${project.identity?.slug}">here</a></p>
    `;

    const sent = await sendEmail(recipient, emailSubject, emailBody);
    if (sent) logger.info('Email sending process completed.');
    return sent;
  } catch (err) {
    logger.warn(`Email notification skipped: ${err.message}`);
    return false;
  }
}
