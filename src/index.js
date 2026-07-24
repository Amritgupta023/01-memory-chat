import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { generateReply } from "./services/chat.service.js";
import {
  clearChatHistory,
  getChatHistory,
  getHistoryCount,
} from "./services/memory.service.js";

const terminal = readline.createInterface({
  input,
  output,
});

console.log("=================================");
console.log("       Gemini Memory Chat");
console.log("=================================");
console.log("Level 2: Short-term conversation memory");
console.log();
console.log("Available commands:");
console.log("  /history  - Conversation history dekho");
console.log("  /reset    - Conversation memory clear karo");
console.log("  exit      - Application close karo");
console.log();

function displayHistory() {
  const history = getChatHistory();

  if (history.length === 0) {
    console.log("\nHistory empty hai.\n");
    return;
  }

  console.log("\n--------- Chat History ---------");

  for (const message of history) {
    const speaker = message.role === "user" ? "You" : "AI";
    const text = message.parts[0]?.text ?? "";

    console.log(`${speaker}: ${text}`);
  }

  console.log("--------------------------------\n");
}

async function startChat() {
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
          `\nAI: Bye! Total ${getHistoryCount()} messages memory mein the.`
        );
        break;
      }

      if (command === "/reset") {
        clearChatHistory();
        console.log("AI: Short-term memory clear kar di gayi hai.\n");
        continue;
      }

      if (command === "/history") {
        displayHistory();
        continue;
      }

      process.stdout.write("AI: Thinking...\r");

      const reply = await generateReply(message);

      process.stdout.write(" ".repeat(40) + "\r");
      console.log(`AI: ${reply}\n`);
    } catch (error) {
      process.stdout.write(" ".repeat(40) + "\r");

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