import { GoogleGenAI } from "@google/genai";
import prisma from "./prisma.js";
import { sendWhatsAppMessage } from "./whatsapp.js";
import dotenv from "dotenv";
dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export const detectAndSaveAppointment = async (customerPhone, business, conversationId) => {
  try {

    const all = await prisma.message.findMany();
    console.log(all.length);

    console.log(conversationId);

    const msgs = await prisma.message.findMany({
        where: {
            conversationId
        }
    });
    console.log(msgs.length);

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

    console.log("conversationText:\n", conversationText);

    const detectionPrompt = `
      You are an appointment detection system.
      Your task is to determine whether a WhatsApp conversation contains a CONFIRMED appointment and extract its details.

      Todays date is: ${today}

      CONVERSATION:
      ${conversationText}

      RULES:
      - Return booked=true ONLY if the assistant has clearly accepted or confirmed the booking.
      - Messages like "I want to book", "Can I book?", or "Is 4 PM available?" are NOT confirmed appointments.
      - If the assistant asks for more information, booked=false.
      - If the assistant confirms the appointment, booked=true.
      - Convert relative dates (today, tomorrow, kal, next Monday, etc.) using today's date.
      - Convert times to 24-hour HH:MM format.
      - If any field is not mentioned, return null.
      - Do not invent names, dates, services, or times.

      Only return a valid JSON object in the following format:
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
        maxOutputTokens: 300,
        responseMimeType: "application/json"  // JSON is short
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
