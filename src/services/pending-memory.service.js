import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFilePath);

const dataDirectory = path.resolve(
  currentDirectory,
  "../../data"
);

const pendingMemoryFilePath = path.join(
  dataDirectory,
  "pending-memory.json"
);

let pendingMemories = [];

async function ensurePendingMemoryFile() {
  await fs.mkdir(dataDirectory, {
    recursive: true,
  });

  try {
    await fs.access(pendingMemoryFilePath);
  } catch {
    await fs.writeFile(
      pendingMemoryFilePath,
      JSON.stringify([], null, 2),
      "utf-8"
    );
  }
}

/**
 * Application startup par pending memories load karta hai.
 */
export async function loadPendingMemories() {
  await ensurePendingMemoryFile();

  try {
    const fileContent = await fs.readFile(
      pendingMemoryFilePath,
      "utf-8"
    );

    if (!fileContent.trim()) {
      pendingMemories = [];
      return pendingMemories;
    }

    const parsedData = JSON.parse(fileContent);

    if (!Array.isArray(parsedData)) {
      throw new Error(
        "Pending memory file ka format invalid hai."
      );
    }

    pendingMemories = parsedData;

    return pendingMemories;
  } catch (error) {
    console.error(
      "Pending memories load nahi ho saki:",
      error instanceof Error
        ? error.message
        : error
    );

    pendingMemories = [];
    await savePendingMemories();

    return pendingMemories;
  }
}

/**
 * Pending memories JSON file mein save karta hai.
 */
export async function savePendingMemories() {
  await ensurePendingMemoryFile();

  await fs.writeFile(
    pendingMemoryFilePath,
    JSON.stringify(pendingMemories, null, 2),
    "utf-8"
  );
}

/**
 * Extracted operations pending queue mein add karta hai.
 */
export async function addPendingMemories(
  operations = [],
  sourceMessage = ""
) {
  if (
    !Array.isArray(operations) ||
    operations.length === 0
  ) {
    return [];
  }

  const newPendingMemories = operations.map(
    (operation) => ({
      id: createMemoryId(),
      operation: operation.operation,
      key: operation.key,
      value:
        operation.operation === "delete"
          ? null
          : operation.value,
      reason: operation.reason ?? "",
      sourceMessage,
      status: "pending",
      createdAt: new Date().toISOString(),
    })
  );

  pendingMemories.push(...newPendingMemories);

  await savePendingMemories();

  return newPendingMemories;
}

/**
 * Sirf pending status wali memories return karta hai.
 */
export function getPendingMemories() {
  return pendingMemories.filter(
    (memory) => memory.status === "pending"
  );
}

/**
 * Complete pending-memory records return karta hai.
 */
export function getAllPendingMemoryRecords() {
  return pendingMemories;
}

/**
 * Specific pending memory ID se find karta hai.
 */
export function getPendingMemoryById(id) {
  return pendingMemories.find(
    (memory) =>
      memory.id === id &&
      memory.status === "pending"
  );
}

/**
 * Memory ko approved mark karta hai.
 */
export async function markMemoryApproved(id) {
  const memory = pendingMemories.find(
    (item) => item.id === id
  );

  if (!memory || memory.status !== "pending") {
    return false;
  }

  memory.status = "approved";
  memory.reviewedAt = new Date().toISOString();

  await savePendingMemories();

  return true;
}

/**
 * Memory ko rejected mark karta hai.
 */
export async function markMemoryRejected(id) {
  const memory = pendingMemories.find(
    (item) => item.id === id
  );

  if (!memory || memory.status !== "pending") {
    return false;
  }

  memory.status = "rejected";
  memory.reviewedAt = new Date().toISOString();

  await savePendingMemories();

  return true;
}

/**
 * Multiple memories approved mark karta hai.
 */
export async function markMemoriesApproved(ids = []) {
  const idSet = new Set(ids);
  const approvedIds = [];

  for (const memory of pendingMemories) {
    if (
      idSet.has(memory.id) &&
      memory.status === "pending"
    ) {
      memory.status = "approved";
      memory.reviewedAt = new Date().toISOString();
      approvedIds.push(memory.id);
    }
  }

  if (approvedIds.length > 0) {
    await savePendingMemories();
  }

  return approvedIds;
}

/**
 * Multiple memories rejected mark karta hai.
 */
export async function markMemoriesRejected(ids = []) {
  const idSet = new Set(ids);
  const rejectedIds = [];

  for (const memory of pendingMemories) {
    if (
      idSet.has(memory.id) &&
      memory.status === "pending"
    ) {
      memory.status = "rejected";
      memory.reviewedAt = new Date().toISOString();
      rejectedIds.push(memory.id);
    }
  }

  if (rejectedIds.length > 0) {
    await savePendingMemories();
  }

  return rejectedIds;
}

/**
 * Saare pending records clear karta hai.
 *
 * Approved/rejected audit records bhi remove ho jayenge.
 */
export async function clearPendingMemoryRecords() {
  pendingMemories = [];
  await savePendingMemories();
}

/**
 * Sirf reviewed records remove karta hai.
 * Pending records safe rahenge.
 */
export async function clearReviewedMemoryRecords() {
  pendingMemories = pendingMemories.filter(
    (memory) => memory.status === "pending"
  );

  await savePendingMemories();
}

/**
 * Pending-memory file ka path return karta hai.
 */
export function getPendingMemoryFilePath() {
  return pendingMemoryFilePath;
}

function createMemoryId() {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random()
    .toString(36)
    .slice(2, 8);

  return `mem_${timestamp}_${randomPart}`;
}