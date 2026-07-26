import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFilePath);

const dataDirectory = path.resolve(currentDirectory, "../../data");
const memoryFilePath = path.join(dataDirectory, "user-memory.json");

let userMemory = {};

/**
 * data folder aur user-memory.json ensure karta hai.
 */
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
 * Application start hone par saved user memory load karta hai.
 */
export async function loadUserMemory() {
  await ensureMemoryFile();

  try {
    const fileContent = await fs.readFile(memoryFilePath, "utf-8");

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
      throw new Error("User memory ka format invalid hai.");
    }

    userMemory = parsedMemory;

    return userMemory;
  } catch (error) {
    console.error("User memory load nahi ho saki:", error.message);

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

/**
 * Complete user memory return karta hai.
 */
export function getUserMemory() {
  return userMemory;
}

/**
 * Ek memory key add ya update karta hai.
 *
 * Example:
 * setMemory("name", "Amrit")
 */
export async function setMemory(key, value) {
  const cleanKey = key?.trim();

  if (!cleanKey) {
    throw new Error("Memory key empty nahi ho sakti.");
  }

  userMemory[cleanKey] = value;

  await saveUserMemory();

  return userMemory;
}

/**
 * Kisi memory ko delete karta hai.
 */
export async function forgetMemory(key) {
  const cleanKey = key?.trim();

  if (!cleanKey) {
    throw new Error("Memory key empty nahi ho sakti.");
  }

  if (!(cleanKey in userMemory)) {
    return false;
  }

  delete userMemory[cleanKey];

  await saveUserMemory();

  return true;
}

/**
 * Complete long-term memory clear karta hai.
 */
export async function clearUserMemory() {
  userMemory = {};

  await saveUserMemory();
}

/**
 * Memory ko system prompt ke liye readable text banata hai.
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

/**
 * Debugging ke liye memory file path.
 */
export function getUserMemoryFilePath() {
  return memoryFilePath;
}