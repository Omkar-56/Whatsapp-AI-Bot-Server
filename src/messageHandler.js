import prisma from "./prisma.js";
import { sendWhatsAppMessage } from "./whatsapp.js";
import { getAIReply } from "./gemini.js";

export const handleIncomingMessage = async (phoneNumberId, customerPhone, messageText, waMessageId) => {
  const business = await prisma.business.findUnique({
    where: { whatsappPhoneId: phoneNumberId }
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
    console.log(`Duplicate message ${waMessageId} — skipping`);
    return;
  }

  const allMessages = await prisma.message.findMany({
    where: {
      conversationId: conversation.id,
    },
    orderBy: { sentAt: 'desc' },
    take: 10
  });

  const history = allMessages.reverse();

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
  console.log(`Calling Gemini for ${business.name} — history: ${history.length} messages`);

  const result = await getAIReply(history, messageText);

  await sendWhatsAppMessage(customerPhone, result.reply);

  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      role: 'assistant',
      content: result.reply,
      messageType: 'text',
      tokensUsed: result.tokensUsed
    }
  });

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date() }
  });

  console.log(`Done — ${business.name} replied to ${customerPhone}`);

  if (result.intent === "BOOK_APPOINTMENT" && result.appointment?.status === "CONFIRMED") {
    const appointment = result.appointment;
    scheduledAt = new Date(`${detected.date}T${detected.time}:00`);

    if (isNaN(scheduledAt.getTime())) {
      console.log(`Invalid date/time: ${detected.date} ${detected.time}`);
      return;
    }

    await prisma.appointment.upsert({
      where: {
        businessId_customerPhone_scheduledAt: {
          businessId: appointment.id,
          customerPhone,
          scheduledAt
        }
      },
      update: {
        customerName: appointment.patientName,
        service: appointment.service ?? "General Consultation",
        notes: appointment.notes,
        status: "confirmed"
      },
      create: {
        businessId: business.id,
        conversationId: conversation.id,
        customerName: appointment.patientName,
        customerPhone,
        service: appointment.service ?? "General Consultation",
        scheduledAt,
        durationMins: 30,
        status: "confirmed",
        reminderSent: false,
        notes: appointment.notes
      }
    });

    console.log("Appointment saved.");

  }
}
