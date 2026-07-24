import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFilePath);

const dataDirectory = path.resolve(currentDirectory, "../../data");
const historyFilePath = path.join(dataDirectory, "chat-history.json");

let chatHistory = [];

/**
 * Data folder aur chat-history.json ensure karta hai.
 */
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
 * JSON file se chat history load karta hai.
 *
 * Application start hote waqt is function ko call karenge.
 */
export async function loadChatHistory() {
  await ensureHistoryFile();

  try {
    const fileContent = await fs.readFile(historyFilePath, "utf-8");

    if (!fileContent.trim()) {
      chatHistory = [];
      return chatHistory;
    }

    const parsedHistory = JSON.parse(fileContent);

    if (!Array.isArray(parsedHistory)) {
      throw new Error("Chat history ka format invalid hai.");
    }

    chatHistory = parsedHistory;

    return chatHistory;
  } catch (error) {
    console.error("Chat history load nahi ho saki:", error.message);

    /*
     * Corrupted JSON ki wajah se application crash na ho,
     * isliye empty history se start kar rahe hain.
     */
    chatHistory = [];

    await saveChatHistory();

    return chatHistory;
  }
}

/**
 * Current RAM history ko JSON file mein save karta hai.
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
 * User message history mein add aur persist karta hai.
 */
export async function addUserMessage(message) {
  chatHistory.push({
    role: "user",
    parts: [
      {
        text: message,
      },
    ],
    createdAt: new Date().toISOString(),
  });

  await saveChatHistory();
}

/**
 * Gemini response history mein add aur persist karta hai.
 */
export async function addModelMessage(message) {
  chatHistory.push({
    role: "model",
    parts: [
      {
        text: message,
      },
    ],
    createdAt: new Date().toISOString(),
  });

  await saveChatHistory();
}

/**
 * Current conversation history return karta hai.
 */
export function getChatHistory() {
  return chatHistory;
}

/**
 * Gemini ko send karne layak history return karta hai.
 *
 * createdAt Gemini API format ka part nahi hai,
 * isliye use remove karke sirf role aur parts bhejte hain.
 */
export function getGeminiChatHistory() {
  return chatHistory.map(({ role, parts }) => ({
    role,
    parts,
  }));
}

/**
 * Recent messages return karta hai.
 */
export function getRecentChatHistory(limit = 20) {
  return getGeminiChatHistory().slice(-limit);
}

/**
 * Last message remove karta hai.
 *
 * API request fail hone par user message rollback karne ke kaam aayega.
 */
export async function removeLastMessage() {
  const removedMessage = chatHistory.pop();

  await saveChatHistory();

  return removedMessage;
}

/**
 * Conversation memory clear karta hai.
 */
export async function clearChatHistory() {
  chatHistory = [];

  await saveChatHistory();
}

/**
 * Total stored messages count return karta hai.
 */
export function getHistoryCount() {
  return chatHistory.length;
}

/**
 * History file ka path debugging ke liye return karta hai.
 */
export function getHistoryFilePath() {
  return historyFilePath;
}