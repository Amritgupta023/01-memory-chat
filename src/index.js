import readline from "node:readline/promises";
import {
  stdin as input,
  stdout as output,
} from "node:process";

import { generateReply } from "./services/chat.service.js";

import {
  clearChatHistory,
  getChatHistory,
  getHistoryCount,
  getHistoryFilePath,
  loadChatHistory,
} from "./services/memory.service.js";

import {
  clearUserMemory,
  forgetMemory,
  getUserMemory,
  getUserMemoryFilePath,
  loadUserMemory,
  setMemory,
} from "./services/user-memory.service.js";

const terminal = readline.createInterface({
  input,
  output,
});

function displayHistory() {
  const history = getChatHistory();

  if (!Array.isArray(history) || history.length === 0) {
    console.log("\nChat history empty hai.\n");
    return;
  }

  console.log(
    "\n------------- Chat History -------------"
  );

  for (const message of history) {
    const speaker =
      message.role === "user" ? "You" : "AI";

    const text =
      message.parts?.[0]?.text ?? "";

    console.log(`${speaker}: ${text}`);
  }

  console.log(
    "----------------------------------------\n"
  );
}

function displayUserMemory() {
  const memory = getUserMemory();
  const entries = Object.entries(memory ?? {});

  if (entries.length === 0) {
    console.log(
      "\nLong-term memory empty hai.\n"
    );

    return;
  }

  console.log(
    "\n------------ Long-Term Memory -----------"
  );

  for (const [key, value] of entries) {
    console.log(
      `${key}: ${formatValue(value)}`
    );
  }

  console.log(
    "-----------------------------------------\n"
  );
}

function formatValue(value) {
  if (
    typeof value === "object" &&
    value !== null
  ) {
    return JSON.stringify(value);
  }

  return String(value);
}

async function handleRememberCommand(message) {
  const commandContent = message
    .slice("/remember".length)
    .trim();

  if (!commandContent) {
    console.log(
      "Usage: /remember key=value\n" +
      "Example: /remember name=Amrit\n"
    );

    return;
  }

  const separatorIndex =
    commandContent.indexOf("=");

  if (separatorIndex === -1) {
    console.log(
      "Invalid format. Use: /remember key=value\n"
    );

    return;
  }

  const key = commandContent
    .slice(0, separatorIndex)
    .trim();

  const rawValue = commandContent
    .slice(separatorIndex + 1)
    .trim();

  if (!key || !rawValue) {
    console.log(
      "Key aur value dono required hain.\n"
    );

    return;
  }

  const value = rawValue.includes(",")
    ? rawValue
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : rawValue;

  await setMemory(key, value);

  console.log(
    `AI: Maine "${key}" long-term memory mein save kar liya.\n`
  );
}

async function handleForgetCommand(message) {
  const key = message
    .slice("/forget".length)
    .trim();

  if (!key) {
    console.log(
      "Usage: /forget key\n" +
      "Example: /forget company\n"
    );

    return;
  }

  const wasDeleted = await forgetMemory(key);

  if (!wasDeleted) {
    console.log(
      `AI: "${key}" naam ki memory nahi mili.\n`
    );

    return;
  }

  console.log(
    `AI: Maine "${key}" memory se delete kar diya.\n`
  );
}

function displayMemoryOperations(
  memoryOperations
) {
  if (
    !Array.isArray(memoryOperations) ||
    memoryOperations.length === 0
  ) {
    return;
  }

  for (const memory of memoryOperations) {
    if (memory.operation === "set") {
      console.log(
        `Memory saved: ${memory.key} = ` +
        `${formatValue(memory.value)}`
      );

      continue;
    }

    if (memory.operation === "delete") {
      console.log(
        `Memory deleted: ${memory.key}`
      );
    }
  }

  console.log();
}

async function startChat() {
  await Promise.all([
    loadChatHistory(),
    loadUserMemory(),
  ]);

  console.log("=================================");
  console.log("       Gemini Memory Chat");
  console.log("=================================");
  console.log(
    "Level 5: Automatic memory extraction"
  );
  console.log(
    `Chat messages loaded: ${getHistoryCount()}`
  );
  console.log(
    `Long-term memories loaded: ${
      Object.keys(getUserMemory() ?? {}).length
    }`
  );

  console.log("\nAvailable commands:");
  console.log(
    "  /history              - Chat history dekho"
  );
  console.log(
    "  /reset                - Chat history clear karo"
  );
  console.log(
    "  /remember key=value   - Memory manually save karo"
  );
  console.log(
    "  /memory               - Long-term memory dekho"
  );
  console.log(
    "  /forget key           - Specific memory delete karo"
  );
  console.log(
    "  /clear-memory         - Complete memory clear karo"
  );
  console.log(
    "  /files                - Storage paths dekho"
  );
  console.log(
    "  exit                  - Application close karo"
  );
  console.log();

  while (true) {
    try {
      const userInput =
        await terminal.question("You: ");

      const message = userInput.trim();
      const command = message.toLowerCase();

      if (!message) {
        console.log(
          "AI: Please koi message enter karo.\n"
        );

        continue;
      }

      if (command === "exit") {
        console.log("\nAI: Bye!");
        break;
      }

      if (command === "/history") {
        displayHistory();
        continue;
      }

      if (command === "/reset") {
        await clearChatHistory();

        console.log(
          "AI: Chat history clear kar di gayi hai.\n"
        );

        continue;
      }

      if (command === "/memory") {
        displayUserMemory();
        continue;
      }

      if (
        command === "/remember" ||
        command.startsWith("/remember ")
      ) {
        await handleRememberCommand(message);
        continue;
      }

      if (
        command === "/forget" ||
        command.startsWith("/forget ")
      ) {
        await handleForgetCommand(message);
        continue;
      }

      if (command === "/clear-memory") {
        await clearUserMemory();

        console.log(
          "AI: Complete long-term memory clear kar di gayi hai.\n"
        );

        continue;
      }

      if (command === "/files") {
        console.log(
          `\nChat history: ${getHistoryFilePath()}`
        );

        console.log(
          `User memory: ${getUserMemoryFilePath()}\n`
        );

        continue;
      }

      process.stdout.write(
        "AI: Thinking...\r"
      );

      const result =
        await generateReply(message);

      process.stdout.write(
        `${" ".repeat(80)}\r`
      );

      /*
       * Defensive handling:
       * generateReply string ya incomplete object return kare
       * tab bhi application crash nahi hogi.
       */
      const reply =
        typeof result === "string"
          ? result
          : result?.reply;

      const memoryOperations =
        typeof result === "object" &&
        result !== null &&
        Array.isArray(result.memoryOperations)
          ? result.memoryOperations
          : [];

      displayMemoryOperations(
        memoryOperations
      );

      console.log(
        `AI: ${reply ?? "No response received"}\n`
      );
    } catch (error) {
      process.stdout.write(
        `${" ".repeat(80)}\r`
      );

      console.error("\nChat error:");

      console.error(
        error instanceof Error
          ? error.message
          : error
      );

      console.log();
    }
  }

  terminal.close();
}

startChat().catch((error) => {
  console.error(
    "Application start nahi ho saki:",
    error instanceof Error
      ? error.message
      : error
  );

  terminal.close();
  process.exitCode = 1;
});