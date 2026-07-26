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

export async function generateReply(userMessage) {
  const cleanMessage = userMessage?.trim();

  if (!cleanMessage) {
    throw new Error("Message empty nahi ho sakta.");
  }

  await addUserMessage(cleanMessage);

  try {
    const conversationHistory = getRecentChatHistory(20);
    const longTermMemory = formatUserMemoryForPrompt();

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: conversationHistory,

      config: {
        systemInstruction: `
You are a helpful AI assistant.

Here is long-term information explicitly saved about the user:

${longTermMemory}

Instructions:

- Use saved user information only when relevant.
- Do not repeatedly mention stored information unnecessarily.
- Do not invent facts that are not present in memory or chat history.
- If chat history conflicts with saved memory, mention the conflict instead
  of silently assuming one is correct.
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

    return reply;
  } catch (error) {
    await removeLastMessage();
    throw error;
  }
}