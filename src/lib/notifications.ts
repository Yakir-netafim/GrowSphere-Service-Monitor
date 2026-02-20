import { Resend } from 'resend';

interface AlertParams {
    serviceName: string;
    envName: string;
    url: string;
    statusCode: number;
}

export async function sendEmailAlert({ serviceName, envName, url, statusCode }: AlertParams) {
    if (!process.env.RESEND_API_KEY) {
        console.warn('RESEND_API_KEY is not set, skipping email alert.');
        return;
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    const to = process.env.EMAIL_TO?.split(',') ?? ['yakir.moshe@netafim.com'];

    try {
        await resend.emails.send({
            from: process.env.EMAIL_FROM ?? 'Netafim Monitor <onboarding@resend.dev>',
            to,
            subject: `🚨 CRITICAL: ${serviceName} (${envName}) is DOWN`,
            html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h1 style="color: #ef4444; margin-top: 0;">🚨 Service Alert</h1>
          <p>The following service is <strong>failing health checks</strong>:</p>
          <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
            <tr style="background: #f8fafc;">
              <td style="padding: 8px 12px; font-weight: bold; border: 1px solid #e2e8f0;">Service</td>
              <td style="padding: 8px 12px; border: 1px solid #e2e8f0;">${serviceName}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; font-weight: bold; border: 1px solid #e2e8f0;">Environment</td>
              <td style="padding: 8px 12px; border: 1px solid #e2e8f0;">${envName}</td>
            </tr>
            <tr style="background: #f8fafc;">
              <td style="padding: 8px 12px; font-weight: bold; border: 1px solid #e2e8f0;">URL</td>
              <td style="padding: 8px 12px; border: 1px solid #e2e8f0;"><a href="${url}">${url}</a></td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; font-weight: bold; border: 1px solid #e2e8f0;">Status Code</td>
              <td style="padding: 8px 12px; border: 1px solid #e2e8f0; color: #ef4444;">${statusCode === 0 ? 'Timeout / No Response' : statusCode}</td>
            </tr>
            <tr style="background: #f8fafc;">
              <td style="padding: 8px 12px; font-weight: bold; border: 1px solid #e2e8f0;">Time</td>
              <td style="padding: 8px 12px; border: 1px solid #e2e8f0;">${new Date().toLocaleString()}</td>
            </tr>
          </table>
          <p style="color: #64748b; font-size: 14px;">This alert will not repeat for the same service & environment until tomorrow.</p>
        </div>
      `,
        });
        console.log(`✅ Email alert sent for ${serviceName} (${envName})`);
    } catch (error) {
        console.error('❌ Failed to send email alert:', error);
    }
}

interface GroupedAlertParams {
    serviceName: string;
    failingEnvs: {
        envName: string;
        url: string;
        statusCode: number;
    }[];
}

export async function sendTeamsAlert({ serviceName, failingEnvs }: GroupedAlertParams) {
    const webhookUrl = process.env.TEAMS_WEBHOOK_URL;
    if (!webhookUrl) {
        console.warn('❌ TEAMS_WEBHOOK_URL is not set in process.env!');
        return;
    }
    console.log(`📡 Attempting to send grouped Teams alert for ${serviceName} to: ${webhookUrl.substring(0, 50)}...`);

    const facts = failingEnvs.flatMap(env => [
        { name: `Environment: ${env.envName}`, value: `Status: ${env.statusCode === 0 ? 'Timeout' : env.statusCode}` },
    ]);

    // Add timestamp as a separate fact
    facts.push({ name: 'Time', value: new Date().toLocaleString('he-IL') });

    const card = {
        '@type': 'MessageCard',
        '@context': 'http://schema.org/extensions',
        themeColor: 'd70000',
        summary: `${serviceName} is DOWN in ${failingEnvs.map(e => e.envName).join(', ')}`,
        sections: [
            {
                activityTitle: `🚨 Service Down: **${serviceName}**`,
                activitySubtitle: failingEnvs.length > 1
                    ? `Failing in **${failingEnvs.length} environments**`
                    : `Environment: **${failingEnvs[0].envName}**`,
                facts: facts,
                markdown: true,
            },
        ],
        potentialAction: failingEnvs.map(env => ({
            '@type': 'OpenUri',
            name: `Check ${env.envName} Health`,
            targets: [{ os: 'default', uri: env.url }],
        })),
    };

    try {
        const res = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(card),
        });
        if (!res.ok) throw new Error(`Teams webhook responded with status ${res.status}`);
        console.log(`✅ Teams alert sent for ${serviceName} (${failingEnvs.length} envs)`);
    } catch (error) {
        console.error('❌ Failed to send Teams alert:', error);
    }
}

