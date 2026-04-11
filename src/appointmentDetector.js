import { GoogleGenAI } from "@google/genai";
import prisma from "./prisma.js";
import { sendWhatsAppMessage } from "./whatsapp.js";
import dotenv from "dotenv";
dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export const detectAndSaveAppointment = async (customerPhone, business, conversationId) => {
  try {
    const recentMessages = await prisma.message.findMany({
      where: { conversationId: conversationId },
      orderBy: { sentAt: "desc" },
      take: 6
    });

    const conversationText = recentMessages
      .reverse()
      .map(m => `${m.role === "user" ? "Customer" : "Assistant"}: ${m.content}`)
      .join("\n");
      const today = new Date().toISOString().split("T")[0];

    const detectionPrompt = `
      You are an appointment detection system. Analyze this WhatsApp conversation and determine if an appointment was EXPLICITLY confirmed.

      CONVERSATION:
      ${conversationText}

      RULES:
      - Only return booked: true if the appointment date, time, and patient name are ALL confirmed
      - "I want to book" or "Can I book?" is NOT a confirmed booking
      - The assistant must have confirmed the slot for it to count
      - If date is relative like "kal" or "tomorrow", use today's date: ${today} to calculate
      - Return ONLY valid JSON, no explanation, no markdown

      Return this exact JSON:
      {
        "booked": true or false,
        "patientName": "name or null",
        "service": "service name or null",
        "date": "YYYY-MM-DD or null",
        "time": "HH:MM in 24hr format or null",
        "notes": "any extra details or null"
      }
    `

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      config: {
        temperature: 0.1,      // very low — we want consistent extraction
        maxOutputTokens: 200,  // JSON is short
      },
      contents: [{ role: "user", parts: [{ text: detectionPrompt }] }]
    });

    const rawText = response.text.trim();
    console.log(`Detection raw response: ${rawText}`);

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
      `✅ *Appointment Confirmed!*\n\n` +
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