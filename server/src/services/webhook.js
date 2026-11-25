import { db } from './firebase.js';

export async function sendDiscordWebhook({ title, description, color = 0x00f0ff, fields = [] }) {
  try {
    const secretSnap = await db.collection('system_config').doc('secrets').get();
    const webhookUrl = secretSnap.exists ? secretSnap.data()?.discordWebhookUrl : '';
    if (!webhookUrl || !webhookUrl.startsWith('https://discord.com/api/webhooks/')) {
      return { sent: false, reason: 'No valid webhook URL configured' };
    }

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'EmoçHosting Sistem',
        embeds: [
          {
            title,
            description,
            color,
            fields,
            timestamp: new Date().toISOString(),
            footer: { text: 'EmoçHosting Gerçek Zamanlı Altyapı' },
          },
        ],
      }),
    });

    return { sent: res.ok, status: res.status };
  } catch (err) {
    return { sent: false, reason: err.message };
  }
}
