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

const memoryFilePath = path.join(
  dataDirectory,
  "user-memory.json"
);

let userMemory = {};

async function ensureMemoryFile() {
  await fs.mkdir(dataDirectory, {
    recursive: true,
  });

  try {
    await fs.access(memoryFilePath);
  } catch {
    await fs.writeFile(
      memoryFilePath,
      JSON.stringify({}, null, 2),
      "utf-8"
    );
  }
}

/**
 * user-memory.json se memory load karta hai.
 */
export async function loadUserMemory() {
  await ensureMemoryFile();

  try {
    const fileContent = await fs.readFile(
      memoryFilePath,
      "utf-8"
    );

    if (!fileContent.trim()) {
      userMemory = {};
      return userMemory;
    }

    const parsedMemory = JSON.parse(fileContent);

    if (
      typeof parsedMemory !== "object" ||
      parsedMemory === null ||
      Array.isArray(parsedMemory)
    ) {
      throw new Error(
        "User memory ka format invalid hai."
      );
    }

    userMemory = parsedMemory;

    return userMemory;
  } catch (error) {
    console.error(
      "User memory load nahi ho saki:",
      error instanceof Error
        ? error.message
        : error
    );

    userMemory = {};

    await saveUserMemory();

    return userMemory;
  }
}

/**
 * Current memory ko JSON file mein save karta hai.
 */
export async function saveUserMemory() {
  await ensureMemoryFile();

  await fs.writeFile(
    memoryFilePath,
    JSON.stringify(userMemory, null, 2),
    "utf-8"
  );
}

export function getUserMemory() {
  return userMemory;
}

/**
 * Manual memory set/update.
 */
export async function setMemory(key, value) {
  const cleanKey = normalizeMemoryKey(key);

  if (!cleanKey) {
    throw new Error(
      "Memory key empty nahi ho sakti."
    );
  }

  if (!isValidMemoryValue(value)) {
    throw new Error(
      "Memory value valid nahi hai."
    );
  }

  userMemory[cleanKey] = value;

  await saveUserMemory();

  return userMemory;
}

/**
 * Specific memory delete.
 */
export async function forgetMemory(key) {
  const cleanKey = normalizeMemoryKey(key);

  if (!cleanKey) {
    throw new Error(
      "Memory key empty nahi ho sakti."
    );
  }

  if (!(cleanKey in userMemory)) {
    return false;
  }

  delete userMemory[cleanKey];

  await saveUserMemory();

  return true;
}

/**
 * Complete long-term memory clear.
 */
export async function clearUserMemory() {
  userMemory = {};

  await saveUserMemory();
}

/**
 * Automatic extractor ki multiple operations apply karta hai.
 *
 * Ye function hamesha object return karega:
 *
 * {
 *   applied: [],
 *   skipped: []
 * }
 */
export async function applyMemoryOperations(
  operations = []
) {
  const applied = [];
  const skipped = [];

  if (
    !Array.isArray(operations) ||
    operations.length === 0
  ) {
    return {
      applied,
      skipped,
    };
  }

  for (const item of operations) {
    if (
      !item ||
      typeof item !== "object" ||
      Array.isArray(item)
    ) {
      skipped.push({
        item,
        reason: "Invalid memory operation",
      });

      continue;
    }

    const operation = item.operation;
    const key = normalizeMemoryKey(item.key);

    if (!key) {
      skipped.push({
        item,
        reason: "Invalid or empty key",
      });

      continue;
    }

    if (operation === "set") {
      if (!isValidMemoryValue(item.value)) {
        skipped.push({
          item,
          reason: "Invalid memory value",
        });

        continue;
      }

      userMemory[key] = item.value;

      applied.push({
        operation: "set",
        key,
        value: item.value,
      });

      continue;
    }

    if (operation === "delete") {
      if (!(key in userMemory)) {
        skipped.push({
          item,
          reason: "Memory key does not exist",
        });

        continue;
      }

      delete userMemory[key];

      applied.push({
        operation: "delete",
        key,
      });

      continue;
    }

    skipped.push({
      item,
      reason: "Unsupported memory operation",
    });
  }

  if (applied.length > 0) {
    await saveUserMemory();
  }

  return {
    applied,
    skipped,
  };
}

/**
 * Memory ko Gemini system prompt ke liye format karta hai.
 */
export function formatUserMemoryForPrompt() {
  const entries = Object.entries(userMemory);

  if (entries.length === 0) {
    return "No long-term information is currently known about the user.";
  }

  return entries
    .map(([key, value]) => {
      const formattedValue =
        typeof value === "object"
          ? JSON.stringify(value)
          : String(value);

      return `- ${key}: ${formattedValue}`;
    })
    .join("\n");
}

export function getUserMemoryFilePath() {
  return memoryFilePath;
}

function normalizeMemoryKey(key) {
  if (typeof key !== "string") {
    return "";
  }

  const words = key
    .trim()
    .replace(/[^a-zA-Z0-9_\-\s]/g, "")
    .split(/[_\-\s]+/)
    .filter(Boolean);

  if (words.length === 0) {
    return "";
  }

  return words
    .map((word, index) => {
      const lowerWord = word.toLowerCase();

      if (index === 0) {
        return lowerWord;
      }

      return (
        lowerWord.charAt(0).toUpperCase() +
        lowerWord.slice(1)
      );
    })
    .join("");
}

function isValidMemoryValue(value) {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === "string") {
    return (
      value.trim().length > 0 &&
      value.length <= 500
    );
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }

  if (Array.isArray(value)) {
    return (
      value.length <= 20 &&
      value.every((item) =>
        ["string", "number", "boolean"].includes(
          typeof item
        )
      )
    );
  }

  return false;
}