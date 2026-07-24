import { ai, GEMINI_MODEL } from "../config/gemini.js";
import {
  addModelMessage,
  addUserMessage,
  getChatHistory,
} from "./memory.service.js";

/**
 * User message Gemini ko send karta hai.
 *
 * Level 2 mein current session ki puri conversation
 * Gemini ko context ke roop mein bheji jaati hai.
 */
export async function generateReply(userMessage) {
  const cleanMessage = userMessage?.trim();

  if (!cleanMessage) {
    throw new Error("Message empty nahi ho sakta.");
  }

  // Current user message history mein save karo.
  addUserMessage(cleanMessage);

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,

      // Current session ki puri conversation Gemini ko bhej rahe hain.
      contents: getChatHistory(),

      config: {
        systemInstruction: `
          You are a helpful AI assistant.
          Use the previous conversation to answer the user.
          Reply clearly and concisely.
          Use Hinglish when the user writes in Hindi or Hinglish.
        `,
      },
    });

    const reply = response.text?.trim();

    if (!reply) {
      throw new Error("Gemini se empty response mila.");
    }

    // Gemini ka response bhi history mein save karo.
    addModelMessage(reply);

    return reply;
  } catch (error) {
    /*
     * User message pehle history mein add ho chuka tha.
     * API fail hone par use remove karna useful hai,
     * warna failed message next request mein chala jayega.
     */
    getChatHistory().pop();

    throw error;
  }
}