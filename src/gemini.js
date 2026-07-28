import { GoogleGenAI } from "@google/genai";
import { systemPrompt, responseSchema } from "./responseConfig.js";


// Initialize the client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const formatHistory = (messages) => {
  return messages.map(msg => ({
    role: msg.role === "assistant" ? "model" : "user",
    parts: [{ text: msg.content }]
  }));
}

const parseJSON = (text) => {
  try {
    return JSON.parse(text);
  } catch (e) {
    console.error("Invalid JSON:");
    console.error(e);
    throw e;
  }
}

export const getAIReply = async (history, newMessage) => {
  const contents = [
    ...formatHistory(history),
    {
      role: "user",
      parts: [{ text: newMessage }]
    }
  ];

  try {

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        responseJsonSchema: responseSchema,
        temperature: 0.5,
        maxOutputTokens: 512,
        thinkingConfig: {
          thinkingBudget: 0
        }
      }
    });

    const result = parseJSON(response.text ?? "");
    const tokensUsed = response.usageMetadata?.totalTokenCount ?? 0;

    return { ...result, tokensUsed }

  } catch (err) {
    console.error("Gemini error:", err.message);

    try {
      console.log("Switching to fallback model...");

      const fallbackRes = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents,
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: "application/json",
          responseJsonSchema: responseSchema,
          temperature: 0.5,
          maxOutputTokens: 512,
          thinkingConfig: {
            thinkingBudget: 0
          }
        }
      });

      const fallbackResult = parseJSON(fallbackRes.text ?? "");

      return {
        ...fallbackResult,
        tokensUsed: fallbackRes.usageMetadata?.totalTokenCount ?? 0
      };

    } catch (fallbackErr) {
      console.error("Fallback failed:", fallbackErr.message);

      return {
        reply: "Sorry, thodi der baad try karein 🙏",
        intent: "UNKNOWN",
        appointment: null,
        tokensUsed: 0
      };
    }
  }
}
