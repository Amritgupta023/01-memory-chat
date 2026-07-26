import { ai, GEMINI_MODEL } from "../config/gemini.js";

import {
  addModelMessage,
  addUserMessage,
  getRecentChatHistory,
  removeLastMessage,
} from "./memory.service.js";

import {
  applyMemoryOperations,
  formatUserMemoryForPrompt,
} from "./user-memory.service.js";

import { extractMemories } from "./memory-extractor.service.js";

/**
 * User message process karta hai:
 *
 * 1. Important memories extract karta hai
 * 2. Extracted memories save/update/delete karta hai
 * 3. User message chat history mein save karta hai
 * 4. Gemini se final reply generate karta hai
 * 5. Model reply chat history mein save karta hai
 */
export async function generateReply(userMessage) {
  const cleanMessage = userMessage?.trim();

  if (!cleanMessage) {
    throw new Error("Message empty nahi ho sakta.");
  }

  /*
   * Memory extraction fail hone par extractMemories()
   * empty array return karega, isliye normal chat continue rahegi.
   */
  const extractedMemories = await extractMemories(cleanMessage);

  const memoryResult = await applyMemoryOperations(
    Array.isArray(extractedMemories) ? extractedMemories : []
  );

  /*
   * Defensive check:
   * memoryResult undefined hone par bhi empty array milega.
   */
  const appliedMemoryOperations = Array.isArray(
    memoryResult?.applied
  )
    ? memoryResult.applied
    : [];

  /*
   * Current user message persistent chat history mein save karo.
   */
  await addUserMessage(cleanMessage);

  try {
    const longTermMemory = formatUserMemoryForPrompt();
    const conversationHistory = getRecentChatHistory(20);

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,

      contents: conversationHistory,

      config: {
        systemInstruction: `
You are a helpful AI assistant.

Here is the user's saved long-term memory:

${longTermMemory}

Instructions:

- Use saved memory only when it is relevant.
- Do not mention JSON files or internal memory implementation.
- Do not repeatedly mention personal information unnecessarily.
- Never invent information about the user.
- Prefer the user's latest explicitly stated information.
- Reply clearly and concisely.
- Use Hinglish when the user writes in Hindi or Hinglish.
        `.trim(),
      },
    });

    const reply = response.text?.trim();

    if (!reply) {
      throw new Error("Gemini se empty response mila.");
    }

    await addModelMessage(reply);

    /*
     * Always same response shape return karo.
     */
    return {
      reply,
      memoryOperations: appliedMemoryOperations,
    };
  } catch (error) {
    /*
     * Current user message rollback karo.
     */
    await removeLastMessage();

    throw error;
  }
}