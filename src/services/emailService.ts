import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

interface Monitor {
  name: string;
  url: string;
}

export async function sendDownAlert(email: string, monitor: Monitor): Promise<void> {
  try {
    const subject = `🔴 Monitor Down: ${monitor.name}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc2626;">🔴 Monitor Down</h2>
        <p><strong>${monitor.name}</strong> is currently down.</p>
        
        <div style="background-color: #fee2e2; border-left: 4px solid #dc2626; padding: 15px; margin: 20px 0;">
          <p style="margin: 0;"><strong>URL:</strong> ${monitor.url}</p>
          <p style="margin: 10px 0 0 0;"><strong>Time:</strong> ${new Date().toLocaleString()}</p>
        </div>
        
        <p style="color: #6b7280; font-size: 14px;">
          You're receiving this because you have alerts enabled for this monitor.
        </p>
        
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
        <p style="color: #9ca3af; font-size: 12px;">Powered by WatchTower</p>
      </div>
    `;

    await resend.emails.send({
      from: 'WatchTower <onboarding@resend.dev>', // Use onboarding@resend.dev for testing
      to: email,
      subject: subject,
      html: html
    });

    console.log(`[EMAIL] ✅ Down alert sent to ${email} for ${monitor.name}`);
  } catch (error) {
    console.error(`[EMAIL] ❌ Failed to send down alert to ${email}:`, error);
    // Don't throw - email failure should not crash health checks
  }
}

export async function sendRecoveryAlert(
  email: string, 
  monitor: Monitor, 
  downtimeSeconds: number
): Promise<void> {
  try {
    const downtimeMins = Math.floor(downtimeSeconds / 60);
    const downtimeSecs = downtimeSeconds % 60;
    const downtimeStr = downtimeMins > 0 
      ? `${downtimeMins}m ${downtimeSecs}s`
      : `${downtimeSecs}s`;

    const subject = `🟢 Monitor Recovered: ${monitor.name}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #16a34a;">🟢 Monitor Recovered</h2>
        <p><strong>${monitor.name}</strong> is back online!</p>
        
        <div style="background-color: #dcfce7; border-left: 4px solid #16a34a; padding: 15px; margin: 20px 0;">
          <p style="margin: 0;"><strong>URL:</strong> ${monitor.url}</p>
          <p style="margin: 10px 0 0 0;"><strong>Downtime:</strong> ${downtimeStr}</p>
          <p style="margin: 10px 0 0 0;"><strong>Recovered at:</strong> ${new Date().toLocaleString()}</p>
        </div>
        
        <p style="color: #6b7280; font-size: 14px;">
          You're receiving this because you have alerts enabled for this monitor.
        </p>
        
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
        <p style="color: #9ca3af; font-size: 12px;">Powered by WatchTower</p>
      </div>
    `;

    await resend.emails.send({
      from: 'WatchTower <onboarding@resend.dev>',
      to: email,
      subject: subject,
      html: html
    });

    console.log(`[EMAIL] ✅ Recovery alert sent to ${email} for ${monitor.name}`);
  } catch (error) {
    console.error(`[EMAIL] ❌ Failed to send recovery alert to ${email}:`, error);
    // Don't throw
  }
}