import { GoogleGenAI } from "@google/genai";
import prisma from "./prisma.js";
import { sendWhatsAppMessage } from "./whatsapp.js";
import dotenv from "dotenv";
dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export const detectAndSaveAppointment = async (customerPhone, business, conversationId) => {
  try {

    const all = await prisma.message.findMany();
    // console.log(all.length);

    // console.log(conversationId);

    const msgs = await prisma.message.findMany({
        where: {
            conversationId
        }
    });
    // console.log(msgs.length);

    const recentMessages = await prisma.message.findMany({
      where: { conversationId: conversationId },
      orderBy: { sentAt: "desc" },
      take: 10
    });

    console.log("recentMessages:\n", recentMessages);
    const conversationText = recentMessages
      .reverse()
      .map(m => `${m.role === "user" ? "Customer" : "Assistant"}: ${m.content}`)
      .join("\n");
    const today = new Date().toISOString().split("T")[0];

    // console.log("conversationText:\n", conversationText);

    const detectionPrompt = `
      You are an appointment information extractor.
      Extract appointment information from this WhatsApp conversation.

      Todays date is: ${today}

      RULES:
      - Determine whether the appointment has been CONFIRMED.
      - An appointment is confirmed only if the assistant explicitly confirms or accepts the booking.
      - If the customer is only asking about booking or availability, it is NOT confirmed.
      - Convert relative dates (today, tomorrow, kal, next Monday, etc.) using today's date.
      - Convert time to 24-hour HH:MM format.
      - If any field is not mentioned, return null.
      - Never invent any information.

      CONVERSATION:
      ${conversationText}
    `

    const appointmentSchema = {
      type: "object",
      properties: {
        booked: { type: "boolean" },
        patientName: { type: ["string", "null"] },
        service: { type: ["string", "null"] },
        date: { type: ["string", "null"] },
        time: { type: ["string", "null"] },
        notes: { type: ["string", "null"] }
      },
      required: ["booked", "patientName", "date", "time"],
      additionalProperties: false
    };

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      config: {
        temperature: 0.1,      // very low — we want consistent extraction
        maxOutputTokens: 300,
        responseMimeType: "application/json", // JSON is short
        responseJsonSchema: appointmentSchema,
        thinkingConfig: {
          thinkingBudget: 0
        }
      },
      contents: [{ role: "user", parts: [{ text: detectionPrompt }] }]
    });

    console.dir(response, { depth: null });

    const rawText = response.text ?? "";
    // console.log(`Detection raw response: ${rawText}`);

    const cleaned = rawText
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    let detected;
    try {
      detected = JSON.parse(cleaned);
    } catch (parseErr) {
      console.log(`JSON Parsing Error: ${parseErr.message}`);
      return;
    }

    if (!detected.booked) {
      console.log("📋 No appointment detected in this conversation turn");
      return;
    }

    if (!detected.patientName || !detected.date || !detected.time) {
      console.log("⚠️  Booking detected but missing required fields — skipping save");
      console.log("Missing:", {
        name: detected.patientName,
        date: detected.date,
        time: detected.time
      });
      return;
    }

    const scheduledAt = new Date(`${detected.date}T${detected.time}:00`)

    if (isNaN(scheduledAt.getTime())) {
      console.log(`Invalid date/time: ${detected.date} ${detected.time}`);
      return;
    }

    const appointment = await prisma.appointment.upsert({
      where: {
        businessId_customerPhone_scheduledAt: {
          businessId: business.id,
          customerPhone,
          scheduledAt
        }
      },
      update: {
        customerName: detected.patientName,
        service: detected.service ?? "General Consultation",
        notes: detected.notes,
        status: "confirmed"
      },
      create: {
        businessId: business.id,
        conversationId,
        customerName: detected.patientName,
        customerPhone,
        service: detected.service ?? "General Consultation",
        scheduledAt,
        durationMins: 30,
        status: "confirmed",
        reminderSent: false,
        notes: detected.notes
      }
    });

    const dateFormatted = scheduledAt.toLocaleDateString("en-IN", {
      weekday: "long",
      day: "numeric",
      month: "long"
    })

    const timeFormatted = scheduledAt.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true
    })

    const confirmationMessage =
      `*Appointment Confirmed!*\n\n` +
      `Name: ${detected.patientName}\n` +
      `Clinic: ${business.name}\n` +
      `Service: ${detected.service ?? "General Consultation"}\n` +
      `Date: ${dateFormatted}\n` +
      `Time: ${timeFormatted}\n\n` +
      `We'll send you a reminder before your appointment. See you soon! 😊`

    await sendWhatsAppMessage(customerPhone, confirmationMessage);

    console.log(`📩 Confirmation sent to ${customerPhone}`);

  } catch (err) {
    console.error("Appointment detection error:", err.message);
  }
}
