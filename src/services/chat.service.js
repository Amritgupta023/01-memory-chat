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
  extractMemories,
} from "./memory-extractor.service.js";

import {
  addPendingMemories,
} from "./pending-memory.service.js";

import {
  formatConversationSummaryForPrompt,
  generateUpdatedSummary,
} from "./conversation-summary.service.js";

import {
  formatRelevantMemoriesForPrompt,
  retrieveRelevantMemories,
} from "./semantic-memory.service.js";

const RECENT_MESSAGE_LIMIT = 12;
const SUMMARY_TRIGGER_LIMIT = 18;

const SEMANTIC_MEMORY_TOP_K = 5;
const SEMANTIC_SIMILARITY_THRESHOLD = 0.35;

/**
 * Old messages ko running summary mein
 * compress karta hai.
 */
async function summarizeHistoryIfNeeded() {
  const historyCount = getHistoryCount();

  if (
    historyCount <
    SUMMARY_TRIGGER_LIMIT
  ) {
    return {
      summarized: false,
      summarizedMessageCount: 0,
    };
  }

  const messagesToSummarize =
    getMessagesForSummarization(
      RECENT_MESSAGE_LIMIT
    );

  if (
    messagesToSummarize.length === 0
  ) {
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

  const noSummaryText =
    "No earlier conversation summary is available.";

  const summaryWasCreated =
    Boolean(updatedSummary?.trim()) &&
    (
      updatedSummary !==
        previousSummary ||
      previousSummary !== noSummaryText
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
 * Level 8 complete chat flow:
 *
 * 1. Possible long-term memories extract
 * 2. Extracted memories pending queue mein
 * 3. User message chat history mein
 * 4. Older history summarize
 * 5. Query embedding generate
 * 6. Relevant approved memories retrieve
 * 7. Summary + recent history + relevant memory
 *    ke saath Gemini response
 */
export async function generateReply(
  userMessage
) {
  const cleanMessage =
    userMessage?.trim();

  if (!cleanMessage) {
    throw new Error(
      "Message empty nahi ho sakta."
    );
  }

  /*
   * Step 1:
   * Natural-language message se possible
   * long-term memories extract karo.
   */
  const extractedMemories =
    await extractMemories(cleanMessage);

  /*
   * Step 2:
   * Extracted memories directly approve nahi hongi.
   * Level 6 approval workflow follow hoga.
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
   * User message persistent history mein.
   */
  await addUserMessage(cleanMessage);

  try {
    /*
     * Step 4:
     * Old conversation summarize karo.
     */
    const summaryResult =
      await summarizeHistoryIfNeeded();

    /*
     * Step 5:
     * User query ke according only relevant
     * approved memories retrieve karo.
     */
    const relevantMemories =
      await retrieveRelevantMemories(
        cleanMessage,
        {
          topK:
            SEMANTIC_MEMORY_TOP_K,

          similarityThreshold:
            SEMANTIC_SIMILARITY_THRESHOLD,
        }
      );

    const formattedRelevantMemories =
      formatRelevantMemoriesForPrompt(
        relevantMemories
      );

    /*
     * Step 6:
     * Earlier conversation summary.
     */
    const conversationSummary =
      formatConversationSummaryForPrompt();

    /*
     * Step 7:
     * Recent raw messages.
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

Relevant approved long-term user memories retrieved for the current message:

${formattedRelevantMemories}

Summary of the earlier conversation:

${conversationSummary}

Instructions:

- Use retrieved memories only when they are relevant to the current request.
- The retrieved memories are approved long-term user facts.
- Do not assume that non-retrieved memories do not exist.
- Use the conversation summary for earlier conversational context.
- Use recent raw messages for immediate context.
- Prefer the user's latest explicit statement when information conflicts.
- Do not mention embeddings, vector search, similarity scores, JSON files or internal memory implementation.
- Do not claim that pending memories have been approved.
- Never invent personal information.
- Reply clearly and concisely.
- Use Hinglish when the user writes in Hindi or Hinglish.
          `.trim(),
        },
      });

    const reply =
      response.text?.trim();

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
        updated:
          summaryResult.summarized,

        summarizedMessageCount:
          summaryResult
            .summarizedMessageCount,
      },

      semanticMemory: {
        retrievedCount:
          relevantMemories.length,

        memories:
          relevantMemories.map(
            (memory) => ({
              key: memory.key,
              value: memory.value,

              similarity:
                Number(
                  memory.similarity.toFixed(4)
                ),
            })
          ),
      },
    };
  } catch (error) {
    await removeLastMessage();

    throw error;
  }
}