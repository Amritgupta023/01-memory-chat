import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ai,
} from "../config/gemini.js";

import {
  getUserMemory,
} from "./user-memory.service.js";

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

const semanticIndexFilePath = path.join(
  dataDirectory,
  "semantic-memory-index.json"
);

const EMBEDDING_MODEL = "gemini-embedding-001";
const EMBEDDING_DIMENSIONS = 768;

const DEFAULT_TOP_K = 5;
const DEFAULT_SIMILARITY_THRESHOLD = 0.35;

const emptySemanticIndex = {
  model: EMBEDDING_MODEL,
  dimensions: EMBEDDING_DIMENSIONS,
  records: [],
  createdAt: null,
  updatedAt: null,
};

let semanticIndex = {
  ...emptySemanticIndex,
  records: [],
};

/**
 * semantic-memory-index.json create karta hai
 * agar file already exist nahi karti.
 */
async function ensureSemanticIndexFile() {
  await fs.mkdir(dataDirectory, {
    recursive: true,
  });

  try {
    await fs.access(semanticIndexFilePath);
  } catch {
    await fs.writeFile(
      semanticIndexFilePath,
      JSON.stringify(
        emptySemanticIndex,
        null,
        2
      ),
      "utf-8"
    );
  }
}

/**
 * Application startup par semantic index load karta hai.
 */
export async function loadSemanticMemoryIndex() {
  await ensureSemanticIndexFile();

  try {
    const fileContent = await fs.readFile(
      semanticIndexFilePath,
      "utf-8"
    );

    if (!fileContent.trim()) {
      semanticIndex = createEmptyIndex();

      await saveSemanticMemoryIndex();

      return semanticIndex;
    }

    const parsedIndex = JSON.parse(fileContent);

    if (
      typeof parsedIndex !== "object" ||
      parsedIndex === null ||
      Array.isArray(parsedIndex)
    ) {
      throw new Error(
        "Semantic memory index format invalid hai."
      );
    }

    semanticIndex = {
      model:
        typeof parsedIndex.model === "string"
          ? parsedIndex.model
          : EMBEDDING_MODEL,

      dimensions:
        Number.isInteger(parsedIndex.dimensions)
          ? parsedIndex.dimensions
          : EMBEDDING_DIMENSIONS,

      records:
        Array.isArray(parsedIndex.records)
          ? parsedIndex.records.filter(
              isValidSemanticRecord
            )
          : [],

      createdAt:
        parsedIndex.createdAt ?? null,

      updatedAt:
        parsedIndex.updatedAt ?? null,
    };

    /*
     * Model ya dimensions change hone par old vectors
     * compatible nahi rahenge.
     */
    if (
      semanticIndex.model !== EMBEDDING_MODEL ||
      semanticIndex.dimensions !==
        EMBEDDING_DIMENSIONS
    ) {
      semanticIndex = createEmptyIndex();

      await saveSemanticMemoryIndex();
    }

    return getSemanticMemoryIndexState();
  } catch (error) {
    console.error(
      "Semantic memory index load nahi hua:",
      error instanceof Error
        ? error.message
        : error
    );

    semanticIndex = createEmptyIndex();

    await saveSemanticMemoryIndex();

    return getSemanticMemoryIndexState();
  }
}

/**
 * Current semantic index ko JSON file mein save karta hai.
 */
export async function saveSemanticMemoryIndex() {
  await ensureSemanticIndexFile();

  await fs.writeFile(
    semanticIndexFilePath,
    JSON.stringify(
      semanticIndex,
      null,
      2
    ),
    "utf-8"
  );
}

/**
 * Approved user-memory.json ko semantic index ke saath
 * synchronize karta hai.
 *
 * - New memory ka embedding generate hoga
 * - Updated memory ka embedding regenerate hoga
 * - Deleted memory index se remove hogi
 */
export async function syncSemanticMemoryIndex() {
  const approvedMemory =
    getUserMemory() ?? {};

  const memoryEntries = Object.entries(
    approvedMemory
  );

  /*
   * Approved memory empty ho to index bhi empty.
   */
  if (memoryEntries.length === 0) {
    const hadRecords =
      semanticIndex.records.length > 0;

    semanticIndex.records = [];

    if (hadRecords) {
      semanticIndex.updatedAt =
        new Date().toISOString();

      await saveSemanticMemoryIndex();
    }

    return {
      added: 0,
      updated: 0,
      removed: hadRecords ? 1 : 0,
      total: 0,
    };
  }

  const currentMemoryKeys = new Set(
    memoryEntries.map(([key]) => key)
  );

  const existingRecordsByKey = new Map(
    semanticIndex.records.map(
      (record) => [record.key, record]
    )
  );

  const memoriesToEmbed = [];
  let addedCount = 0;
  let updatedCount = 0;

  for (const [key, value] of memoryEntries) {
    const serializedValue =
      serializeMemoryValue(value);

    const text = createMemoryText(
      key,
      value
    );

    const existingRecord =
      existingRecordsByKey.get(key);

    const memoryChanged =
      !existingRecord ||
      existingRecord.serializedValue !==
        serializedValue ||
      existingRecord.text !== text ||
      !Array.isArray(
        existingRecord.embedding
      ) ||
      existingRecord.embedding.length !==
        EMBEDDING_DIMENSIONS;

    if (!memoryChanged) {
      continue;
    }

    memoriesToEmbed.push({
      key,
      value,
      serializedValue,
      text,
      existingRecord,
    });

    if (existingRecord) {
      updatedCount += 1;
    } else {
      addedCount += 1;
    }
  }

  let generatedEmbeddings = [];

  if (memoriesToEmbed.length > 0) {
    generatedEmbeddings =
      await generateDocumentEmbeddings(
        memoriesToEmbed.map(
          (memory) => memory.text
        )
      );
  }

  const changedRecords = memoriesToEmbed.map(
    (memory, index) => {
      const now = new Date().toISOString();

      return {
        id:
          memory.existingRecord?.id ??
          createSemanticMemoryId(),

        key: memory.key,

        value: memory.value,

        serializedValue:
          memory.serializedValue,

        text: memory.text,

        embedding:
          generatedEmbeddings[index],

        model: EMBEDDING_MODEL,

        dimensions:
          EMBEDDING_DIMENSIONS,

        createdAt:
          memory.existingRecord?.createdAt ??
          now,

        updatedAt: now,
      };
    }
  );

  const changedRecordsByKey = new Map(
    changedRecords.map(
      (record) => [record.key, record]
    )
  );

  /*
   * Deleted approved memories remove hongi.
   */
  const retainedRecords =
    semanticIndex.records.filter(
      (record) =>
        currentMemoryKeys.has(record.key) &&
        !changedRecordsByKey.has(record.key)
    );

  const previousKeys = new Set(
    semanticIndex.records.map(
      (record) => record.key
    )
  );

  const removedCount = [
    ...previousKeys,
  ].filter(
    (key) => !currentMemoryKeys.has(key)
  ).length;

  semanticIndex.records = [
    ...retainedRecords,
    ...changedRecords,
  ].sort((first, second) =>
    first.key.localeCompare(second.key)
  );

  const indexChanged =
    addedCount > 0 ||
    updatedCount > 0 ||
    removedCount > 0;

  if (indexChanged) {
    const now = new Date().toISOString();

    semanticIndex.model =
      EMBEDDING_MODEL;

    semanticIndex.dimensions =
      EMBEDDING_DIMENSIONS;

    semanticIndex.createdAt =
      semanticIndex.createdAt ?? now;

    semanticIndex.updatedAt = now;

    await saveSemanticMemoryIndex();
  }

  return {
    added: addedCount,
    updated: updatedCount,
    removed: removedCount,
    total: semanticIndex.records.length,
  };
}

/**
 * User query ke liye top relevant approved memories retrieve karta hai.
 */
export async function retrieveRelevantMemories(
  query,
  options = {}
) {
  const cleanQuery = query?.trim();

  if (!cleanQuery) {
    return [];
  }

  const topK =
    Number.isInteger(options.topK) &&
    options.topK > 0
      ? options.topK
      : DEFAULT_TOP_K;

  const similarityThreshold =
    typeof options.similarityThreshold ===
      "number"
      ? options.similarityThreshold
      : DEFAULT_SIMILARITY_THRESHOLD;

  /*
   * Latest approved memory ke according index update karo.
   */
  await syncSemanticMemoryIndex();

  if (semanticIndex.records.length === 0) {
    return [];
  }

  try {
    const queryEmbedding =
      await generateQueryEmbedding(
        cleanQuery
      );

    const rankedMemories =
      semanticIndex.records
        .map((record) => ({
          id: record.id,
          key: record.key,
          value: record.value,
          text: record.text,

          similarity: cosineSimilarity(
            queryEmbedding,
            record.embedding
          ),
        }))
        .filter(
          (memory) =>
            Number.isFinite(
              memory.similarity
            ) &&
            memory.similarity >=
              similarityThreshold
        )
        .sort(
          (first, second) =>
            second.similarity -
            first.similarity
        )
        .slice(0, topK);

    return rankedMemories;
  } catch (error) {
    /*
     * Embedding retrieval fail hone se main chat
     * completely fail nahi hogi.
     */
    console.error(
      "Semantic memory retrieval failed:",
      error instanceof Error
        ? error.message
        : error
    );

    return [];
  }
}

/**
 * Semantic results ko main Gemini system prompt
 * ke liye format karta hai.
 */
export function formatRelevantMemoriesForPrompt(
  relevantMemories = []
) {
  if (
    !Array.isArray(relevantMemories) ||
    relevantMemories.length === 0
  ) {
    return "No relevant approved long-term memories were retrieved.";
  }

  return relevantMemories
    .map(
      (memory) =>
        `- ${memory.key}: ${formatMemoryValue(
          memory.value
        )}`
    )
    .join("\n");
}

/**
 * Debugging/terminal display ke liye index state.
 */
export function getSemanticMemoryIndexState() {
  return {
    model: semanticIndex.model,

    dimensions:
      semanticIndex.dimensions,

    recordCount:
      semanticIndex.records.length,

    createdAt:
      semanticIndex.createdAt,

    updatedAt:
      semanticIndex.updatedAt,

    records: semanticIndex.records.map(
      (record) => ({
        id: record.id,
        key: record.key,
        value: record.value,
        text: record.text,
        dimensions:
          record.embedding.length,
        createdAt:
          record.createdAt,
        updatedAt:
          record.updatedAt,
      })
    ),
  };
}

/**
 * Manual semantic search debugging command ke liye.
 */
export async function searchSemanticMemories(
  query,
  options = {}
) {
  return retrieveRelevantMemories(
    query,
    {
      topK: options.topK ?? 5,

      similarityThreshold:
        options.similarityThreshold ?? 0,
    }
  );
}

/**
 * Complete index rebuild karta hai.
 */
export async function rebuildSemanticMemoryIndex() {
  semanticIndex = createEmptyIndex();

  await saveSemanticMemoryIndex();

  return syncSemanticMemoryIndex();
}

/**
 * Complete semantic index clear karta hai.
 *
 * Approved user memory delete nahi hogi.
 */
export async function clearSemanticMemoryIndex() {
  semanticIndex = createEmptyIndex();

  await saveSemanticMemoryIndex();
}

export function getSemanticMemoryIndexFilePath() {
  return semanticIndexFilePath;
}

async function generateDocumentEmbeddings(
  texts
) {
  if (
    !Array.isArray(texts) ||
    texts.length === 0
  ) {
    return [];
  }

  const response =
    await ai.models.embedContent({
      model: EMBEDDING_MODEL,

      contents: texts,

      config: {
        taskType:
          "RETRIEVAL_DOCUMENT",

        outputDimensionality:
          EMBEDDING_DIMENSIONS,
      },
    });

  const embeddings =
    response.embeddings;

  if (
    !Array.isArray(embeddings) ||
    embeddings.length !== texts.length
  ) {
    throw new Error(
      "Memory embeddings ka response invalid hai."
    );
  }

  return embeddings.map(
    (embedding, index) => {
      const values = embedding?.values;

      if (
        !Array.isArray(values) ||
        values.length !==
          EMBEDDING_DIMENSIONS
      ) {
        throw new Error(
          `Memory embedding ${index + 1} invalid hai.`
        );
      }

      return normalizeVector(values);
    }
  );
}

async function generateQueryEmbedding(
  query
) {
  const response =
    await ai.models.embedContent({
      model: EMBEDDING_MODEL,

      contents: query,

      config: {
        taskType:
          "RETRIEVAL_QUERY",

        outputDimensionality:
          EMBEDDING_DIMENSIONS,
      },
    });

  const values =
    response.embeddings?.[0]?.values;

  if (
    !Array.isArray(values) ||
    values.length !==
      EMBEDDING_DIMENSIONS
  ) {
    throw new Error(
      "Query embedding response invalid hai."
    );
  }

  return normalizeVector(values);
}

/**
 * Reduced 768-dimension embedding-001 vectors ko
 * manually normalize karta hai.
 */
function normalizeVector(vector) {
  const magnitude = Math.sqrt(
    vector.reduce(
      (sum, value) =>
        sum + value * value,
      0
    )
  );

  if (!Number.isFinite(magnitude)) {
    throw new Error(
      "Embedding vector mein invalid values hain."
    );
  }

  if (magnitude === 0) {
    return vector.map(() => 0);
  }

  return vector.map(
    (value) => value / magnitude
  );
}

/**
 * Cosine similarity:
 *
 * -1 = opposite
 *  0 = unrelated
 *  1 = highly similar
 */
function cosineSimilarity(
  firstVector,
  secondVector
) {
  if (
    !Array.isArray(firstVector) ||
    !Array.isArray(secondVector) ||
    firstVector.length === 0 ||
    firstVector.length !==
      secondVector.length
  ) {
    return 0;
  }

  let dotProduct = 0;
  let firstMagnitude = 0;
  let secondMagnitude = 0;

  for (
    let index = 0;
    index < firstVector.length;
    index += 1
  ) {
    const firstValue =
      firstVector[index];

    const secondValue =
      secondVector[index];

    dotProduct +=
      firstValue * secondValue;

    firstMagnitude +=
      firstValue * firstValue;

    secondMagnitude +=
      secondValue * secondValue;
  }

  if (
    firstMagnitude === 0 ||
    secondMagnitude === 0
  ) {
    return 0;
  }

  return (
    dotProduct /
    (
      Math.sqrt(firstMagnitude) *
      Math.sqrt(secondMagnitude)
    )
  );
}

function createMemoryText(key, value) {
  const readableKey = key
    .replace(
      /([a-z0-9])([A-Z])/g,
      "$1 $2"
    )
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();

  return `User memory about ${readableKey}: ${formatMemoryValue(
    value
  )}`;
}

function serializeMemoryValue(value) {
  if (
    typeof value === "object" &&
    value !== null
  ) {
    return JSON.stringify(value);
  }

  return String(value);
}

function formatMemoryValue(value) {
  if (Array.isArray(value)) {
    return value.join(", ");
  }

  if (
    typeof value === "object" &&
    value !== null
  ) {
    return JSON.stringify(value);
  }

  return String(value);
}

function isValidSemanticRecord(record) {
  return Boolean(
    record &&
      typeof record === "object" &&
      !Array.isArray(record) &&
      typeof record.id === "string" &&
      typeof record.key === "string" &&
      typeof record.text === "string" &&
      Array.isArray(record.embedding) &&
      record.embedding.every(
        (value) =>
          typeof value === "number" &&
          Number.isFinite(value)
      )
  );
}

function createSemanticMemoryId() {
  const timestamp =
    Date.now().toString(36);

  const randomPart = Math.random()
    .toString(36)
    .slice(2, 8);

  return `semantic_${timestamp}_${randomPart}`;
}

function createEmptyIndex() {
  return {
    model: EMBEDDING_MODEL,
    dimensions: EMBEDDING_DIMENSIONS,
    records: [],
    createdAt: null,
    updatedAt: null,
  };
}