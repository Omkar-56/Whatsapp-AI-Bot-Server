import express from "express";
import dotenv from "dotenv";
import axios from "axios";

const app = express();
dotenv.config();

const {
  WHATSAPP_VERIFY_TOKEN,
  WHATSAPP_ACCESS_TOKEN,
  WHATSAPP_PHONE_NUMBER_ID,
  PORT = 3000
} = process.env

// Health check route
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    message: "Server is running",
  });
});

app.get('/webhook', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === WHATSAPP_VERIFY_TOKEN) {
    console.log('Webhook verified by Meta');
    res.status(200).send(challenge);  // must send back the challenge string
  } else {
    console.error('Webhook verification failed — token mismatch')
    res.sendStatus(403);
  }
});

app.post('/webhook', async (req, res) => {

  // Always respond 200 immediately — before any processing
  // If you don't, Meta retries and you process the same message twice
  res.sendStatus(200);

  try {
    const body = req.body;

    // Ignore non-message events (status updates, read receipts etc.)
    if (body.object !== 'whatsapp_business_account') return;
    
    const entry   = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value   = changes?.value;

    // Ignore delivery/read status updates — only process actual messages
    if (!value?.messages) return

    const message = value.messages[0]

    // Only handle text messages for now (ignore audio, image etc.)
    if (message.type !== 'text') return;

    const customerPhone = message.from;        // e.g. "919876543210"
    const messageText   = message.text.body;   // what they typed
    const waMessageId   = message.id;          // Meta's unique message ID

    console.log(`Message from ${customerPhone}: "${messageText}"`);

    // ── TODO: save to DB and call Gemini here (next step) ────
    // For now, send a hardcoded reply to confirm the loop works

    const replyText = `Hello! I received your message: "${messageText}". AI replies coming soon!`;

    await sendWhatsAppMessage(customerPhone, replyText);

  } catch (err) {
    console.error('Error processing webhook:', err.message);
    // Don't throw — we already sent 200, just log it
  }
});

export const sendWhatsAppMessage = async (to, message) => {
  try {
    await axios.post(
      `https://graph.facebook.com/v22.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        to: to,
        type: 'text',
        text: { body: message }
      },
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log(`Reply sent to ${to}`);
  } catch (err) {
    console.error('Failed to send message:', err.response?.data || err.message);
  }
}

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});