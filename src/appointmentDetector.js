import { GoogleGenAI } from "@google/genai"
import prisma from "./db.js"
import { sendWhatsAppMessage } from "./whatsapp.js"

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export const detectAndSaveAppointment = async () => {
  try {
    const recentMessages = await prisma.message.findMany({
      where: { conversationId },
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
    console.log(`🔍 Detection raw response: ${rawText}`);

  } catch (err) {
    
  }
}