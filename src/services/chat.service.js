import { ai, GEMINI_MODEL } from "../config/gemini.js";

/**
 * User ka message Gemini ko send karta hai.
 *
 * Level 1 mein hum history send nahi kar rahe.
 * Isliye har request independent hai.
 */
export async function generateReply(userMessage) {
  if (!userMessage || !userMessage.trim()) {
    throw new Error("Message empty nahi ho sakta.");
  }

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: userMessage.trim(),
    config: {
      systemInstruction: `
        You are a helpful AI assistant.
        Reply clearly and concisely.
        Use Hinglish when the user writes in Hindi or Hinglish.
      `,
    },
  });

  const reply = response.text;

  if (!reply) {
    throw new Error("Gemini se empty response mila.");
  }

  return reply;
}