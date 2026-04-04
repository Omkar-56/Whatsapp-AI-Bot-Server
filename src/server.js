import express from "express";
import dotenv from "dotenv";
import { handleIncomingMessage } from "./messageHandler.js";
dotenv.config();

const app = express();
app.use(express.json())

const {
  WHATSAPP_VERIFY_TOKEN,
  WHATSAPP_ACCESS_TOKEN,
  WHATSAPP_PHONE_NUMBER_ID,
  PORT = 3000
} = process.env;



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
    console.log(body);

    // Ignore non-message events (status updates, read receipts etc.)
    if (body.object !== 'whatsapp_business_account') return;
    
    const entry   = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value   = changes?.value;

    // Ignore delivery/read status updates — only process actual messages
    if (!value?.messages) return;

    const message = value.messages[0];
    if (message.type !== 'text') return;

    const phoneNumberId = value?.metadata?.phone_number_id;
    if (!phoneNumberId) {
      console.log("No phoneNumberId found");  
      return;
    }

    const customerPhone = message.from;        // e.g. "919876543210"
    const messageText   = message.text.body;   // what they typed
    const waMessageId   = message.id;          // Meta's unique message ID

    await handleIncomingMessage(phoneNumberId, customerPhone, messageText, waMessageId);

  } catch (err) {
    console.error('Error processing webhook:', err.message);
    // Don't throw — we already sent 200, just log it
  }
});

// start server 
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});