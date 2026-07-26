import readline from "node:readline/promises";

import {
  stdin as input,
  stdout as output,
} from "node:process";

import {
  generateReply,
} from "./services/chat.service.js";

import {
  clearChatHistory,
  getChatHistory,
  getHistoryCount,
  getHistoryFilePath,
  loadChatHistory,
} from "./services/memory.service.js";

import {
  applyMemoryOperations,
  clearUserMemory,
  forgetMemory,
  getUserMemory,
  getUserMemoryFilePath,
  loadUserMemory,
  setMemory,
} from "./services/user-memory.service.js";

import {
  clearPendingMemoryRecords,
  clearReviewedMemoryRecords,
  getPendingMemories,
  getPendingMemoryFilePath,
  loadPendingMemories,
  markMemoriesApproved,
  markMemoriesRejected,
  markMemoryApproved,
  markMemoryRejected,
} from "./services/pending-memory.service.js";

const terminal = readline.createInterface({
  input,
  output,
});

function formatValue(value) {
  if (
    typeof value === "object" &&
    value !== null
  ) {
    return JSON.stringify(value);
  }

  return String(value);
}

function displayHistory() {
  const history = getChatHistory();

  if (
    !Array.isArray(history) ||
    history.length === 0
  ) {
    console.log("\nChat history empty hai.\n");
    return;
  }

  console.log(
    "\n------------- Chat History -------------"
  );

  for (const message of history) {
    const speaker =
      message.role === "user"
        ? "You"
        : "AI";

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
      "\nApproved long-term memory empty hai.\n"
    );

    return;
  }

  console.log(
    "\n---------- Approved Long-Term Memory ----------"
  );

  for (const [key, value] of entries) {
    console.log(
      `${key}: ${formatValue(value)}`
    );
  }

  console.log(
    "-----------------------------------------------\n"
  );
}

function displayPendingMemories(
  memories = getPendingMemories()
) {
  if (
    !Array.isArray(memories) ||
    memories.length === 0
  ) {
    console.log(
      "\nKoi pending memory nahi hai.\n"
    );

    return;
  }

  console.log(
    "\n-------------- Pending Memories --------------"
  );

  memories.forEach((memory, index) => {
    const action =
      memory.operation === "delete"
        ? `Delete: ${memory.key}`
        : `Save: ${memory.key} = ${formatValue(
            memory.value
          )}`;

    console.log(`${index + 1}. ${action}`);
    console.log(`   ID: ${memory.id}`);

    if (memory.reason) {
      console.log(
        `   Reason: ${memory.reason}`
      );
    }

    if (memory.sourceMessage) {
      console.log(
        `   Source: "${memory.sourceMessage}"`
      );
    }

    console.log();
  });

  console.log(
    "----------------------------------------------\n"
  );
}

/**
 * Extracted memory ko user se immediately approve/reject karwata hai.
 */
async function reviewNewMemories(
  pendingMemories
) {
  if (
    !Array.isArray(pendingMemories) ||
    pendingMemories.length === 0
  ) {
    return;
  }

  console.log(
    "Possible long-term memories detected:"
  );

  pendingMemories.forEach((memory, index) => {
    if (memory.operation === "set") {
      console.log(
        `${index + 1}. Save ${memory.key} = ` +
        `${formatValue(memory.value)}`
      );
    } else {
      console.log(
        `${index + 1}. Delete ${memory.key}`
      );
    }
  });

  console.log();

  const answer = await terminal.question(
    "Approve these memories? (yes/no/later): "
  );

  const normalizedAnswer = answer
    .trim()
    .toLowerCase();

  const ids = pendingMemories.map(
    (memory) => memory.id
  );

  if (
    normalizedAnswer === "yes" ||
    normalizedAnswer === "y"
  ) {
    const operations = pendingMemories.map(
      (memory) => ({
        operation: memory.operation,
        key: memory.key,
        value: memory.value,
      })
    );

    const result =
      await applyMemoryOperations(operations);

    const appliedIds = result.applied.map(
      (appliedOperation) => {
        const matchingMemory =
          pendingMemories.find(
            (memory) =>
              memory.operation ===
                appliedOperation.operation &&
              memory.key === appliedOperation.key
          );

        return matchingMemory?.id;
      }
    ).filter(Boolean);

    await markMemoriesApproved(appliedIds);

    /*
     * Operation apply na ho paayi, jaise missing delete key,
     * to record reject kar dete hain.
     */
    const unappliedIds = ids.filter(
      (id) => !appliedIds.includes(id)
    );

    if (unappliedIds.length > 0) {
      await markMemoriesRejected(unappliedIds);
    }

    if (result.applied.length > 0) {
      console.log(
        `\n${result.applied.length} memory operation(s) approved and applied.\n`
      );
    } else {
      console.log(
        "\nKoi memory operation apply nahi hui.\n"
      );
    }

    return;
  }

  if (
    normalizedAnswer === "no" ||
    normalizedAnswer === "n"
  ) {
    await markMemoriesRejected(ids);

    console.log(
      "\nDetected memories reject kar di gayi hain.\n"
    );

    return;
  }

  console.log(
    "\nMemories pending rakhi gayi hain. " +
    "Baad mein /pending command se review kar sakte ho.\n"
  );
}

async function approvePendingMemory(id) {
  const pendingMemories = getPendingMemories();

  const memory = pendingMemories.find(
    (item) => item.id === id
  );

  if (!memory) {
    console.log(
      `\nPending memory "${id}" nahi mili.\n`
    );

    return;
  }

  const result = await applyMemoryOperations([
    {
      operation: memory.operation,
      key: memory.key,
      value: memory.value,
    },
  ]);

  if (result.applied.length === 0) {
    console.log(
      "\nMemory operation apply nahi hui.\n"
    );

    return;
  }

  await markMemoryApproved(id);

  console.log(
    `\nMemory approved: ${memory.key}\n`
  );
}

async function rejectPendingMemory(id) {
  const rejected =
    await markMemoryRejected(id);

  if (!rejected) {
    console.log(
      `\nPending memory "${id}" nahi mili.\n`
    );

    return;
  }

  console.log(
    `\nMemory "${id}" reject kar di gayi.\n`
  );
}

async function approveAllPendingMemories() {
  const pendingMemories =
    getPendingMemories();

  if (pendingMemories.length === 0) {
    console.log(
      "\nKoi pending memory nahi hai.\n"
    );

    return;
  }

  const operations = pendingMemories.map(
    (memory) => ({
      operation: memory.operation,
      key: memory.key,
      value: memory.value,
    })
  );

  const result =
    await applyMemoryOperations(operations);

  const approvedIds = [];

  for (const appliedOperation of result.applied) {
    const matchingMemory =
      pendingMemories.find(
        (memory) =>
          !approvedIds.includes(memory.id) &&
          memory.operation ===
            appliedOperation.operation &&
          memory.key === appliedOperation.key
      );

    if (matchingMemory) {
      approvedIds.push(matchingMemory.id);
    }
  }

  await markMemoriesApproved(approvedIds);

  const rejectedIds = pendingMemories
    .map((memory) => memory.id)
    .filter(
      (id) => !approvedIds.includes(id)
    );

  if (rejectedIds.length > 0) {
    await markMemoriesRejected(rejectedIds);
  }

  console.log(
    `\n${result.applied.length} pending memory operation(s) approved.\n`
  );
}

async function rejectAllPendingMemories() {
  const pendingMemories =
    getPendingMemories();

  if (pendingMemories.length === 0) {
    console.log(
      "\nKoi pending memory nahi hai.\n"
    );

    return;
  }

  await markMemoriesRejected(
    pendingMemories.map(
      (memory) => memory.id
    )
  );

  console.log(
    "\nSaari pending memories reject kar di gayi hain.\n"
  );
}

async function handleRememberCommand(message) {
  const commandContent = message
    .slice("/remember".length)
    .trim();

  if (!commandContent) {
    console.log(
      "Usage: /remember key=value\n"
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
    `AI: "${key}" manually save kar liya.\n`
  );
}

async function handleForgetCommand(message) {
  const key = message
    .slice("/forget".length)
    .trim();

  if (!key) {
    console.log(
      "Usage: /forget key\n"
    );

    return;
  }

  const deleted = await forgetMemory(key);

  console.log(
    deleted
      ? `\nMemory "${key}" delete kar di gayi.\n`
      : `\nMemory "${key}" nahi mili.\n`
  );
}

async function startChat() {
  await Promise.all([
    loadChatHistory(),
    loadUserMemory(),
    loadPendingMemories(),
  ]);

  console.log("=================================");
  console.log("       Gemini Memory Chat");
  console.log("=================================");
  console.log(
    "Level 6: Memory approval and rejection"
  );
  console.log(
    `Chat messages: ${getHistoryCount()}`
  );
  console.log(
    `Approved memories: ${
      Object.keys(getUserMemory() ?? {}).length
    }`
  );
  console.log(
    `Pending memories: ${
      getPendingMemories().length
    }`
  );

  console.log("\nCommands:");
  console.log(
    "  /history              - Chat history"
  );
  console.log(
    "  /reset                - Clear chat history"
  );
  console.log(
    "  /memory               - Approved memories"
  );
  console.log(
    "  /pending              - Pending memories"
  );
  console.log(
    "  /approve <id>         - Approve one memory"
  );
  console.log(
    "  /reject <id>          - Reject one memory"
  );
  console.log(
    "  /approve-all          - Approve all pending"
  );
  console.log(
    "  /reject-all           - Reject all pending"
  );
  console.log(
    "  /remember key=value   - Manual memory"
  );
  console.log(
    "  /forget key           - Delete approved memory"
  );
  console.log(
    "  /clear-memory         - Clear approved memory"
  );
  console.log(
    "  /clear-reviewed       - Clear reviewed audit records"
  );
  console.log(
    "  /clear-pending-file   - Clear all pending records"
  );
  console.log(
    "  /files                - Show data file paths"
  );
  console.log(
    "  exit                  - Close application"
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

      if (command === "/memory") {
        displayUserMemory();
        continue;
      }

      if (command === "/pending") {
        displayPendingMemories();
        continue;
      }

      if (command === "/reset") {
        await clearChatHistory();

        console.log(
          "\nChat history clear kar di gayi.\n"
        );

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

      if (
        command.startsWith("/approve ")
      ) {
        const id = message
          .slice("/approve".length)
          .trim();

        await approvePendingMemory(id);
        continue;
      }

      if (
        command.startsWith("/reject ")
      ) {
        const id = message
          .slice("/reject".length)
          .trim();

        await rejectPendingMemory(id);
        continue;
      }

      if (command === "/approve-all") {
        await approveAllPendingMemories();
        continue;
      }

      if (command === "/reject-all") {
        await rejectAllPendingMemories();
        continue;
      }

      if (command === "/clear-memory") {
        await clearUserMemory();

        console.log(
          "\nApproved memory clear kar di gayi.\n"
        );

        continue;
      }

      if (command === "/clear-reviewed") {
        await clearReviewedMemoryRecords();

        console.log(
          "\nReviewed records clear kar diye gaye.\n"
        );

        continue;
      }

      if (
        command === "/clear-pending-file"
      ) {
        await clearPendingMemoryRecords();

        console.log(
          "\nPending-memory file clear kar di gayi.\n"
        );

        continue;
      }

      if (command === "/files") {
        console.log(
          `\nChat history: ${getHistoryFilePath()}`
        );

        console.log(
          `User memory: ${getUserMemoryFilePath()}`
        );

        console.log(
          `Pending memory: ${getPendingMemoryFilePath()}\n`
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

      const reply =
        typeof result === "string"
          ? result
          : result?.reply;

      const pendingMemories =
        Array.isArray(result?.pendingMemories)
          ? result.pendingMemories
          : [];

      console.log(
        `AI: ${reply ?? "No response received"}\n`
      );

      await reviewNewMemories(
        pendingMemories
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