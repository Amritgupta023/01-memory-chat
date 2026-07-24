const chatHistory = [];

/**
 * User message ko temporary memory mein save karta hai.
 */
export function addUserMessage(message) {
  chatHistory.push({
    role: "user",
    parts: [
      {
        text: message,
      },
    ],
  });
}

/**
 * Gemini response ko temporary memory mein save karta hai.
 */
export function addModelMessage(message) {
  chatHistory.push({
    role: "model",
    parts: [
      {
        text: message,
      },
    ],
  });
}

/**
 * Current conversation history return karta hai.
 */
export function getChatHistory() {
  return chatHistory;
}

/**
 * Conversation reset karta hai.
 */
export function clearChatHistory() {
  chatHistory.length = 0;
}

/**
 * History mein total messages count return karta hai.
 */
export function getHistoryCount() {
  return chatHistory.length;
}