import express from "express";
import dotenv from "dotenv";
import axios from "axios";
import pkg from "@prisma/client";
dotenv.config();

const app = express();
app.use(express.json())

const {
  DATABASE_URL,
  WHATSAPP_VERIFY_TOKEN,
  WHATSAPP_ACCESS_TOKEN,
  WHATSAPP_PHONE_NUMBER_ID,
  PORT = 3000
} = process.env;

const { PrismaClient } = pkg;
const prisma = new PrismaClient({
  url: DATABASE_URL
});

// Health check route
app.get("/", (req, res) => {
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

    const message = value.messages[0];
    const phoneNumberId = value?.metadata?.phone_number_id;

    // Only handle text messages for now (ignore audio, image etc.)
    if (message.type !== 'text') return;

    const customerPhone = message.from;        // e.g. "919876543210"
    const messageText   = message.text.body;   // what they typed
    const waMessageId   = message.id;          // Meta's unique message ID

    console.log(`Message from ${customerPhone}: "${messageText}"`);

    const existing = await prisma.message.findUnique({
      where: { waMessageId }
    });

    if (existing) return;

    const business = await prisma.business.findUnique({
      where: {
        whatsappPhoneId: phoneNumberId
      }
    });

    if (!business) {
      console.log("Business not found");
      return;
    }

    const conversation = await prisma.conversation.upsert({
      where: {
        businessId_customerPhone: {
          businessId: business.id,
          customerPhone: customerPhone
        }
      },
      update: {},
      create: {
        businessId: business.id,
        customerPhone: customerPhone,
        status: "active",
        isEscalated: false
      }
    });

    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "user",
        content: messageText,
        waMessageId: waMessageId
      }
    });

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() }
    });

    const replyText = `Hello! How can I help you?`;

    await sendWhatsAppMessage(customerPhone, replyText, conversation.id);

  } catch (err) {
    console.error('Error processing webhook:', err.message);
    // Don't throw — we already sent 200, just log it
  }
});

export const sendWhatsAppMessage = async (to, message, conversation_id) => {
  try {
    const response = await axios.post(
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

    const waMessageId = response.data.messages?.[0]?.id;

    await prisma.message.create({
      data: {
        conversationId: conversation_id,
        role: "assistant",
        content: message,
        waMessageId: waMessageId
      }
    });

    await prisma.conversation.update({
      where: { id: conversation_id },
      data: { lastMessageAt: new Date() }
    });

    console.log(`Reply sent to ${to}`);
  } catch (err) {
    console.error('Failed to send message:', err.response?.data || err.message);
  }
}

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});