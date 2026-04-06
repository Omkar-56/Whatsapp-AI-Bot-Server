import { GoogleGenAI } from "@google/genai";

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
    // Create a chat session with history
    const chat = ai.chats.create({
      model: "gemini-2.5-flash",
      config: {
        systemInstruction: systemPrompt,
        maxOutputTokens: 300,
        temperature: 0.7,    // slightly creative but mostly factual
      },
      history: formatHistory(history)
    });

    const response = await chat.sendMessage({
      message: newMessage
    });

    const replyText  = response.text;
    const tokensUsed = response.usageMetadata?.totalTokenCount ?? 0;

    console.log(`Gemini replied (${tokensUsed} tokens): "${replyText.substring(0, 60)}..."`);

    return { replyText, tokensUsed }

  } catch (err) {
    console.error("Gemini error:", err.message)

    return {
      replyText: "Namaste! Abhi hum busy hain. Thodi der mein aapko reply karenge. 🙏",
      tokensUsed: 0
    }
  }
}

run();
