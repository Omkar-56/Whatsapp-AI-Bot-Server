import { GoogleGenAI } from "@google/genai";
import { log } from "console";

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

export const getAIReply = async (systemPrompt, history, newMessage) => {
  try {
    console.log(history);
    
    // // Create a chat session with history
    // const chat = ai.chats.create({
    //   model: "gemini-2.5-flash",
    //   config: {
    //     systemInstruction: systemPrompt,
    //     maxOutputTokens: 300,
    //     temperature: 0.7,    // slightly creative but mostly factual
    //   },
    //   history: formatHistory(history)
    // });

    // const response = await chat.sendMessage({
    //   message: newMessage
    // });

    const contents = [
      ...formatHistory(history),
      {
        role: "user",
        parts: [{ text: `User Query (Reply to this message only): ${newMessage}` }]
      }
    ];

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents,
      config: {
        systemInstruction: {
          role: "system",
          parts: [{ text: systemPrompt }]
        }
      }
    });

    const replyText  = response.text ?? "";
    const tokensUsed = response.usageMetadata?.totalTokenCount ?? 0;

    console.log(`Gemini replied (${tokensUsed} tokens): "${replyText.slice(0, 60)}..."`);
    
    return { replyText, tokensUsed }

  } catch (err) {
    console.error("Gemini error:", err.message)

    if (err.status === 503) {
      console.log("Swithing to fallback model...");
      return await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents,
        config: {
          systemInstruction: {
            role: "system",
            parts: [{ text: systemPrompt }]
          }
        }
      });
    }

    return {
      replyText: "Sorry, thodi der baad try karein 🙏",
      tokensUsed: 0
    }
  }
}
