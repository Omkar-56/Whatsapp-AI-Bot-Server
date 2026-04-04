import { sendWhatsAppMessage } from "./whatsapp.js";
import prisma from "./prisma.js";

export const handleIncomingMessage = async (phoneNumberId, customerPhone, messageText, waMessageId) => {
  const business = await prisma.business.findUnique({
    where: { whatsappPhoneId: phoneNumberId },
    include: { config: true }
  });

  if (!business) {
    console.log(`No business found for phone ID: ${phoneNumberId}`);
    return;
  }

  if (!business.isActive) {
    console.log(`Business ${business.name} is inactive — ignoring message`);
    return;
  }

  const conversation = await prisma.conversation.upsert({
    where: {
      businessId_customerPhone: {
        businessId: business.id,
        customerPhone: customerPhone
      }
    },
    update: {
      lastMessageAt: new Date(),
      status: 'active'
    },
    create: {
      businessId: business.id,
      customerPhone: customerPhone,
      status: 'active',
      lastMessageAt: new Date()
    }
  });

  const existing = await prisma.message.findUnique({
    where: { waMessageId }
  });

  if (existing) {
    console.log(`⚠️  Duplicate message ${waMessageId} — skipping`);
    return;
  }

  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      role: 'user',
      content: messageText,
      waMessageId: waMessageId,
      messageType: 'text'
    }
  });

  console.log(`Saved message from ${customerPhone}: "${messageText}"`);

  // const history = await prisma.message.findMany({
  //   where: { conversationId: conversation.id },
  //   orderBy: { sentAt: 'asc' },
  //   take: 10  // last 10 messages
  // });

  const replyText = `Hi! I received your message. Our AI assistant will respond shortly. You said: "${messageText}"`;

  await sendWhatsAppMessage(customerPhone, replyText);

  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      role: 'assistant',
      content: replyText,
      messageType: 'text'
    }
  });

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date() }
  });

  console.log(`Full cycle complete for ${customerPhone}`);

}