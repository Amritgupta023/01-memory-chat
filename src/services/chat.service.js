import { ai, GEMINI_MODEL } from "../config/gemini.js";
import {
  addModelMessage,
  addUserMessage,
  getRecentChatHistory,
  removeLastMessage,
} from "./memory.service.js";

/**
 * User message Gemini ko send karta hai.
 *
 * Level 3 mein conversation RAM ke saath
 * JSON file mein bhi persist hoti hai.
 */
export async function generateReply(userMessage) {
  const cleanMessage = userMessage?.trim();

  if (!cleanMessage) {
    throw new Error("Message empty nahi ho sakta.");
  }

  /*
   * Pehle user message RAM aur JSON file mein save hoga.
   */
  await addUserMessage(cleanMessage);

  try {
    /*
     * Learning project mein recent 20 messages bhej rahe hain.
     * Is value ko badha ya ghata sakte ho.
     */
    const conversationHistory = getRecentChatHistory(20);

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: conversationHistory,
      config: {
        systemInstruction: `
          You are a helpful AI assistant.

          Use the previous conversation when it is relevant.
          Do not claim to remember information that is not present
          in the supplied conversation.

          Reply clearly and concisely.
          Use Hinglish when the user writes in Hindi or Hinglish.
        `,
      },
    });

    const reply = response.text?.trim();

    if (!reply) {
      throw new Error("Gemini se empty response mila.");
    }

    /*
     * Gemini reply ko RAM aur JSON file mein save karo.
     */
    await addModelMessage(reply);

    return reply;
  } catch (error) {
    /*
     * API fail hui to current user message ko history se remove karo.
     *
     * Warna next request mein failed message bhi context mein chala jayega.
     */
    await removeLastMessage();

    throw error;
  }
}