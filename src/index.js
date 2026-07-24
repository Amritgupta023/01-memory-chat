import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { generateReply } from "./services/chat.service.js";

const terminal = readline.createInterface({
  input,
  output,
});

console.log("=================================");
console.log("      Gemini Memory Chat");
console.log("=================================");
console.log("Level 1: Basic chatbot — no memory");
console.log('Exit karne ke liye "exit" likho.\n');

async function startChat() {
  while (true) {
    try {
      const userMessage = await terminal.question("You: ");

      const normalizedMessage = userMessage.trim().toLowerCase();

      if (normalizedMessage === "exit") {
        console.log("\nAI: Bye! Chat close ho rahi hai.");
        break;
      }

      if (!userMessage.trim()) {
        console.log("AI: Please koi message enter karo.\n");
        continue;
      }

      process.stdout.write("AI: Thinking...\r");

      const reply = await generateReply(userMessage);

      process.stdout.write(" ".repeat(30) + "\r");
      console.log(`AI: ${reply}\n`);
    } catch (error) {
      process.stdout.write(" ".repeat(30) + "\r");

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

startChat();