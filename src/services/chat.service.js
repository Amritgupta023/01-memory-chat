import {
  ai,
  GEMINI_MODEL,
} from "../config/gemini.js";

import {
  addModelMessage,
  addUserMessage,
  getHistoryCount,
  getMessagesForSummarization,
  getRecentChatHistory,
  keepOnlyRecentMessages,
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

import {
  formatConversationSummaryForPrompt,
  generateUpdatedSummary,
} from "./conversation-summary.service.js";

const RECENT_MESSAGE_LIMIT = 12;
const SUMMARY_TRIGGER_LIMIT = 18;

/**
 * Old messages ko summary mein compress karta hai.
 */
async function summarizeHistoryIfNeeded() {
  const historyCount = getHistoryCount();

  if (historyCount < SUMMARY_TRIGGER_LIMIT) {
    return {
      summarized: false,
      summarizedMessageCount: 0,
    };
  }

  const messagesToSummarize =
    getMessagesForSummarization(
      RECENT_MESSAGE_LIMIT
    );

  if (messagesToSummarize.length === 0) {
    return {
      summarized: false,
      summarizedMessageCount: 0,
    };
  }

  const previousSummary =
    formatConversationSummaryForPrompt();

  const updatedSummary =
    await generateUpdatedSummary(
      messagesToSummarize
    );

  /*
   * Summary generation fail hone par previous aur updated summary
   * same ho sakti hai. Initial summary empty ho aur output bhi empty
   * ho to messages remove nahi karne chahiye.
   */
  const summaryWasCreated =
    Boolean(updatedSummary?.trim()) &&
    (
      updatedSummary !== previousSummary ||
      previousSummary !==
        "No earlier conversation summary is available."
    );

  if (!summaryWasCreated) {
    return {
      summarized: false,
      summarizedMessageCount: 0,
    };
  }

  await keepOnlyRecentMessages(
    RECENT_MESSAGE_LIMIT
  );

  return {
    summarized: true,
    summarizedMessageCount:
      messagesToSummarize.length,
  };
}

/**
 * Complete chat flow.
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
   * Long-term memory candidates extract karo.
   */
  const extractedMemories =
    await extractMemories(cleanMessage);

  /*
   * Step 2:
   * Memories ko approval ke liye pending rakho.
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
   * Current user message history mein add karo.
   */
  await addUserMessage(cleanMessage);

  try {
    /*
     * Step 4:
     * Zarurat padne par old messages summarize karo.
     */
    const summaryResult =
      await summarizeHistoryIfNeeded();

    /*
     * Step 5:
     * Approved long-term memory load karo.
     */
    const longTermMemory =
      formatUserMemoryForPrompt();

    /*
     * Step 6:
     * Conversation summary load karo.
     */
    const conversationSummary =
      formatConversationSummaryForPrompt();

    /*
     * Step 7:
     * Sirf recent raw messages Gemini ko bhejo.
     */
    const recentConversation =
      getRecentChatHistory(
        RECENT_MESSAGE_LIMIT
      );

    const response =
      await ai.models.generateContent({
        model: GEMINI_MODEL,

        contents: recentConversation,

        config: {
          systemInstruction: `
You are a helpful AI assistant.

Approved long-term user memory:

${longTermMemory}

Summary of the earlier conversation:

${conversationSummary}

Instructions:

- Use approved long-term memory only when relevant.
- Use the conversation summary to understand earlier context.
- Use recent raw messages for immediate conversational context.
- Prefer recent explicit information when it conflicts with the summary.
- Do not mention internal JSON files, summarization or memory implementation.
- Do not claim pending memories are approved.
- Do not invent user details.
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

      pendingMemories:
        Array.isArray(newPendingMemories)
          ? newPendingMemories
          : [],

      summary: {
        updated: summaryResult.summarized,

        summarizedMessageCount:
          summaryResult.summarizedMessageCount,
      },
    };
  } catch (error) {
    /*
     * Last user message history mein exist karta ho to rollback.
     */
    await removeLastMessage();

    throw error;
  }
}