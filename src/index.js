import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { generateReply } from "./services/chat.service.js";

import {
  clearChatHistory,
  getChatHistory,
  getHistoryCount,
  getHistoryFilePath,
  loadChatHistory,
} from "./services/memory.service.js";

const terminal = readline.createInterface({
  input,
  output,
});

/**
 * Stored chat history terminal mein display karta hai.
 */
function displayHistory() {
  const history = getChatHistory();

  if (history.length === 0) {
    console.log("\nHistory empty hai.\n");
    return;
  }

  console.log("\n------------- Chat History -------------");

  for (const message of history) {
    const speaker = message.role === "user" ? "You" : "AI";
    const text = message.parts?.[0]?.text ?? "";
    const time = message.createdAt
      ? new Date(message.createdAt).toLocaleString()
      : "Unknown time";

    console.log(`[${time}] ${speaker}: ${text}`);
  }

  console.log("----------------------------------------\n");
}

async function startChat() {
  /*
   * Application start hote hi JSON file se history restore karo.
   */
  await loadChatHistory();

  console.log("=================================");
  console.log("       Gemini Memory Chat");
  console.log("=================================");
  console.log("Level 3: Persistent chat history");
  console.log(`Loaded messages: ${getHistoryCount()}`);
  console.log();
  console.log("Available commands:");
  console.log("  /history  - Conversation history dekho");
  console.log("  /reset    - Stored conversation clear karo");
  console.log("  /file     - History file ka path dekho");
  console.log("  exit      - Application close karo");
  console.log();

  while (true) {
    try {
      const userInput = await terminal.question("You: ");
      const message = userInput.trim();
      const command = message.toLowerCase();

      if (!message) {
        console.log("AI: Please koi message enter karo.\n");
        continue;
      }

      if (command === "exit") {
        console.log(
          `\nAI: Bye! ${getHistoryCount()} messages file mein saved hain.`
        );
        break;
      }

      if (command === "/reset") {
        await clearChatHistory();

        console.log("AI: Persistent chat history clear kar di gayi hai.\n");
        continue;
      }

      if (command === "/history") {
        displayHistory();
        continue;
      }

      if (command === "/file") {
        console.log(`\nHistory file: ${getHistoryFilePath()}\n`);
        continue;
      }

      process.stdout.write("AI: Thinking...\r");

      const reply = await generateReply(message);

      process.stdout.write(" ".repeat(50) + "\r");
      console.log(`AI: ${reply}\n`);
    } catch (error) {
      process.stdout.write(" ".repeat(50) + "\r");

      console.error("\nChat error:");

      if (error instanceof Error) {
        console.error(error.message);
      } else {
        console.error(error);
      }

      console.log();
    }
  }

  terminal.close();
}

startChat().catch((error) => {
  console.error("Application start nahi ho saki:", error);
  terminal.close();
  process.exitCode = 1;
});