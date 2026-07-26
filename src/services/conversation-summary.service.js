import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ai,
  GEMINI_MODEL,
} from "../config/gemini.js";

const currentFilePath = fileURLToPath(
  import.meta.url
);

const currentDirectory = path.dirname(
  currentFilePath
);

const dataDirectory = path.resolve(
  currentDirectory,
  "../../data"
);

const summaryFilePath = path.join(
  dataDirectory,
  "conversation-summary.json"
);

const emptySummaryState = {
  summary: "",
  summarizedMessageCount: 0,
  createdAt: null,
  updatedAt: null,
};

let summaryState = {
  ...emptySummaryState,
};

/**
 * conversation-summary.json ensure karta hai.
 */
async function ensureSummaryFile() {
  await fs.mkdir(dataDirectory, {
    recursive: true,
  });

  try {
    await fs.access(summaryFilePath);
  } catch {
    await fs.writeFile(
      summaryFilePath,
      JSON.stringify(emptySummaryState, null, 2),
      "utf-8"
    );
  }
}

/**
 * Application startup par summary load karta hai.
 */
export async function loadConversationSummary() {
  await ensureSummaryFile();

  try {
    const fileContent = await fs.readFile(
      summaryFilePath,
      "utf-8"
    );

    if (!fileContent.trim()) {
      summaryState = {
        ...emptySummaryState,
      };

      await saveConversationSummary();

      return summaryState;
    }

    const parsedSummary = JSON.parse(fileContent);

    if (
      typeof parsedSummary !== "object" ||
      parsedSummary === null ||
      Array.isArray(parsedSummary)
    ) {
      throw new Error(
        "Conversation summary format invalid hai."
      );
    }

    summaryState = {
      summary:
        typeof parsedSummary.summary === "string"
          ? parsedSummary.summary
          : "",

      summarizedMessageCount:
        Number.isInteger(
          parsedSummary.summarizedMessageCount
        )
          ? parsedSummary.summarizedMessageCount
          : 0,

      createdAt:
        parsedSummary.createdAt ?? null,

      updatedAt:
        parsedSummary.updatedAt ?? null,
    };

    return summaryState;
  } catch (error) {
    console.error(
      "Conversation summary load nahi hui:",
      error instanceof Error
        ? error.message
        : error
    );

    summaryState = {
      ...emptySummaryState,
    };

    await saveConversationSummary();

    return summaryState;
  }
}

/**
 * Current summary state ko JSON file mein save karta hai.
 */
export async function saveConversationSummary() {
  await ensureSummaryFile();

  await fs.writeFile(
    summaryFilePath,
    JSON.stringify(summaryState, null, 2),
    "utf-8"
  );
}

/**
 * Complete summary state return karta hai.
 */
export function getConversationSummaryState() {
  return {
    ...summaryState,
  };
}

/**
 * Sirf summary text return karta hai.
 */
export function getConversationSummary() {
  return summaryState.summary;
}

/**
 * Messages ko human-readable transcript mein convert karta hai.
 */
function formatMessagesForSummary(messages = []) {
  return messages
    .map((message) => {
      const speaker =
        message.role === "user"
          ? "User"
          : "Assistant";

      const text = Array.isArray(message.parts)
        ? message.parts
            .map((part) => part?.text ?? "")
            .filter(Boolean)
            .join("\n")
        : "";

      return `${speaker}: ${text}`;
    })
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Existing summary aur older messages ko merge karke
 * updated summary generate karta hai.
 */
export async function generateUpdatedSummary(
  messages = []
) {
  if (
    !Array.isArray(messages) ||
    messages.length === 0
  ) {
    return summaryState.summary;
  }

  const transcript =
    formatMessagesForSummary(messages);

  if (!transcript.trim()) {
    return summaryState.summary;
  }

  const existingSummary =
    summaryState.summary.trim();

  try {
    const response =
      await ai.models.generateContent({
        model: GEMINI_MODEL,

        contents: [
          {
            role: "user",
            parts: [
              {
                text: buildSummaryPrompt({
                  existingSummary,
                  transcript,
                }),
              },
            ],
          },
        ],

        config: {
          temperature: 0.2,

          systemInstruction: `
You are a conversation summarization system.

Create a compact, factual and useful running summary.

The summary will be used as context in future AI conversations.

Do not invent information.
Do not include passwords, API keys, tokens, OTPs or private secrets.
Do not include unnecessary greetings or repetitive statements.
Preserve unresolved questions, decisions, goals and important context.
          `.trim(),
        },
      });

    const updatedSummary =
      response.text?.trim();

    if (!updatedSummary) {
      throw new Error(
        "Gemini se empty conversation summary mili."
      );
    }

    const now = new Date().toISOString();

    summaryState = {
      summary: updatedSummary,

      summarizedMessageCount:
        summaryState.summarizedMessageCount +
        messages.length,

      createdAt:
        summaryState.createdAt ?? now,

      updatedAt: now,
    };

    await saveConversationSummary();

    return updatedSummary;
  } catch (error) {
    console.error(
      "Conversation summarization failed:",
      error instanceof Error
        ? error.message
        : error
    );

    /*
     * Summarization failure se main chat crash nahi honi chahiye.
     */
    return summaryState.summary;
  }
}

function buildSummaryPrompt({
  existingSummary,
  transcript,
}) {
  return `
Update the running conversation summary.

Existing summary:

${
  existingSummary ||
  "No previous conversation summary exists."
}

New conversation messages:

${transcript}

Create one updated summary containing:

- important topics discussed
- important user requests
- decisions that were made
- completed work
- unresolved questions
- current project state
- relevant preferences mentioned in the conversation
- technical errors and fixes that may matter later

Rules:

1. Merge the existing summary with the new messages.
2. Do not duplicate information.
3. Prefer the latest information when facts conflict.
4. Clearly distinguish completed work from planned work.
5. Do not store passwords, API keys, tokens, OTPs or secrets.
6. Ignore greetings and small talk.
7. Keep the summary compact but sufficiently detailed.
8. Do not mention that you are generating a summary.
  `.trim();
}

/**
 * Summary reset karta hai.
 */
export async function clearConversationSummary() {
  summaryState = {
    ...emptySummaryState,
  };

  await saveConversationSummary();
}

/**
 * Summary ko main Gemini prompt ke liye format karta hai.
 */
export function formatConversationSummaryForPrompt() {
  const summary = summaryState.summary.trim();

  if (!summary) {
    return "No earlier conversation summary is available.";
  }

  return summary;
}

export function getConversationSummaryFilePath() {
  return summaryFilePath;
}