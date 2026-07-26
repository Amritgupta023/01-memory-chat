import { ai, GEMINI_MODEL } from "../config/gemini.js";

import {
  addModelMessage,
  addUserMessage,
  getRecentChatHistory,
  removeLastMessage,
} from "./memory.service.js";

import {
  formatUserMemoryForPrompt,
} from "./user-memory.service.js";

import {
  extractMemories,
} from "./memory-extractor.service.js";

import {
  addPendingMemories,
} from "./pending-memory.service.js";

/**
 * User message process karta hai.
 *
 * Level 6 difference:
 * Extracted memories directly user-memory.json mein save nahi hoti.
 * Pehle pending-memory.json mein jaati hain.
 */
export async function generateReply(userMessage) {
  const cleanMessage = userMessage?.trim();

  if (!cleanMessage) {
    throw new Error(
      "Message empty nahi ho sakta."
    );
  }

  /*
   * Step 1:
   * Natural-language message se possible memories extract karo.
   */
  const extractedMemories =
    await extractMemories(cleanMessage);

  /*
   * Step 2:
   * Extracted memories ko pending state mein rakho.
   */
  const newPendingMemories =
    await addPendingMemories(
      Array.isArray(extractedMemories)
        ? extractedMemories
        : [],
      cleanMessage
    );

  /*
   * Step 3:
   * Current user message chat history mein save karo.
   */
  await addUserMessage(cleanMessage);

  try {
    /*
     * Sirf approved long-term memory prompt mein jayegi.
     * Pending memories abhi Gemini personalization mein use nahi hongi.
     */
    const longTermMemory =
      formatUserMemoryForPrompt();

    const conversationHistory =
      getRecentChatHistory(20);

    const response =
      await ai.models.generateContent({
        model: GEMINI_MODEL,

        contents: conversationHistory,

        config: {
          systemInstruction: `
You are a helpful AI assistant.

Here is the user's approved long-term memory:

${longTermMemory}

Instructions:

- Only treat the approved memory above as persistent user information.
- You may still use information from the current conversation normally.
- Do not mention JSON files or internal memory implementation.
- Do not claim that pending information has already been saved.
- Never invent information about the user.
- Prefer the user's latest explicitly stated information.
- Reply clearly and concisely.
- Use Hinglish when the user writes in Hindi or Hinglish.
          `.trim(),
        },
      });

    const reply = response.text?.trim();

    if (!reply) {
      throw new Error(
        "Gemini se empty response mila."
      );
    }

    await addModelMessage(reply);

    return {
      reply,
      pendingMemories: Array.isArray(
        newPendingMemories
      )
        ? newPendingMemories
        : [],
    };
  } catch (error) {
    /*
     * AI response fail ho to current user chat message rollback hoga.
     *
     * Pending extraction record ko audit/debugging ke liye rehne
     * diya gaya hai.
     */
    await removeLastMessage();

    throw error;
  }
}