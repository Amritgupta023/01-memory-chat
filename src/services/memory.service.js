import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

const historyFilePath = path.join(
  dataDirectory,
  "chat-history.json"
);

let chatHistory = [];

async function ensureHistoryFile() {
  await fs.mkdir(dataDirectory, {
    recursive: true,
  });

  try {
    await fs.access(historyFilePath);
  } catch {
    await fs.writeFile(
      historyFilePath,
      JSON.stringify([], null, 2),
      "utf-8"
    );
  }
}

/**
 * Application startup par chat history load karta hai.
 */
export async function loadChatHistory() {
  await ensureHistoryFile();

  try {
    const fileContent = await fs.readFile(
      historyFilePath,
      "utf-8"
    );

    if (!fileContent.trim()) {
      chatHistory = [];
      return chatHistory;
    }

    const parsedHistory = JSON.parse(fileContent);

    if (!Array.isArray(parsedHistory)) {
      throw new Error(
        "Chat history ka format invalid hai."
      );
    }

    chatHistory = parsedHistory;

    return chatHistory;
  } catch (error) {
    console.error(
      "Chat history load nahi hui:",
      error instanceof Error
        ? error.message
        : error
    );

    chatHistory = [];

    await saveChatHistory();

    return chatHistory;
  }
}

/**
 * RAM history ko JSON file mein save karta hai.
 */
export async function saveChatHistory() {
  await ensureHistoryFile();

  await fs.writeFile(
    historyFilePath,
    JSON.stringify(chatHistory, null, 2),
    "utf-8"
  );
}

/**
 * User message persistent history mein add karta hai.
 */
export async function addUserMessage(text) {
  const cleanText = text?.trim();

  if (!cleanText) {
    throw new Error(
      "User message empty nahi ho sakta."
    );
  }

  chatHistory.push({
    role: "user",

    parts: [
      {
        text: cleanText,
      },
    ],

    createdAt: new Date().toISOString(),
  });

  await saveChatHistory();
}

/**
 * Model message persistent history mein add karta hai.
 */
export async function addModelMessage(text) {
  const cleanText = text?.trim();

  if (!cleanText) {
    throw new Error(
      "Model message empty nahi ho sakta."
    );
  }

  chatHistory.push({
    role: "model",

    parts: [
      {
        text: cleanText,
      },
    ],

    createdAt: new Date().toISOString(),
  });

  await saveChatHistory();
}

export function getChatHistory() {
  return chatHistory;
}

/**
 * Recent Gemini-compatible messages return karta hai.
 *
 * createdAt Gemini ko nahi bheja jayega.
 */
export function getRecentChatHistory(limit = 12) {
  const safeLimit =
    Number.isInteger(limit) && limit > 0
      ? limit
      : 12;

  return chatHistory
    .slice(-safeLimit)
    .map(toGeminiMessage);
}

/**
 * Complete Gemini-compatible history return karta hai.
 */
export function getGeminiChatHistory() {
  return chatHistory.map(toGeminiMessage);
}

/**
 * Sabse purane messages return karta hai.
 *
 * Last keepRecentCount messages return nahi honge.
 */
export function getMessagesForSummarization(
  keepRecentCount = 12
) {
  const safeCount =
    Number.isInteger(keepRecentCount) &&
    keepRecentCount >= 0
      ? keepRecentCount
      : 12;

  if (chatHistory.length <= safeCount) {
    return [];
  }

  return chatHistory.slice(
    0,
    chatHistory.length - safeCount
  );
}

/**
 * Summary create hone ke baad older messages remove karta hai.
 *
 * Last keepRecentCount messages preserve hongi.
 */
export async function keepOnlyRecentMessages(
  keepRecentCount = 12
) {
  const safeCount =
    Number.isInteger(keepRecentCount) &&
    keepRecentCount >= 0
      ? keepRecentCount
      : 12;

  if (chatHistory.length <= safeCount) {
    return [];
  }

  const removedMessages = chatHistory.slice(
    0,
    chatHistory.length - safeCount
  );

  chatHistory =
    safeCount === 0
      ? []
      : chatHistory.slice(-safeCount);

  await saveChatHistory();

  return removedMessages;
}

/**
 * Specific number of oldest messages remove karta hai.
 */
export async function removeOldestMessages(
  count
) {
  if (
    !Number.isInteger(count) ||
    count <= 0
  ) {
    return [];
  }

  const safeCount = Math.min(
    count,
    chatHistory.length
  );

  const removedMessages = chatHistory.splice(
    0,
    safeCount
  );

  await saveChatHistory();

  return removedMessages;
}

/**
 * Failed API request mein last message rollback.
 */
export async function removeLastMessage() {
  if (chatHistory.length === 0) {
    return null;
  }

  const removedMessage = chatHistory.pop();

  await saveChatHistory();

  return removedMessage;
}

/**
 * Chat history clear.
 */
export async function clearChatHistory() {
  chatHistory = [];

  await saveChatHistory();
}

export function getHistoryCount() {
  return chatHistory.length;
}

export function getHistoryFilePath() {
  return historyFilePath;
}

function toGeminiMessage(message) {
  return {
    role: message.role,

    parts: Array.isArray(message.parts)
      ? message.parts.map((part) => ({
          text: part?.text ?? "",
        }))
      : [],
  };
}