import { Type } from "@google/genai";

import { ai, GEMINI_MODEL } from "../config/gemini.js";
import { getUserMemory } from "./user-memory.service.js";

const memoryExtractionSchema = {
  type: Type.OBJECT,

  properties: {
    memories: {
      type: Type.ARRAY,

      description:
        "Long-term memory operations extracted from the user message.",

      items: {
        type: Type.OBJECT,

        properties: {
          operation: {
            type: Type.STRING,
            enum: ["set", "delete"],
            description:
              "Use set to create or update memory and delete to remove memory.",
          },

          key: {
            type: Type.STRING,
            description:
              "Short camelCase memory key such as name, company, location or favouriteLanguage.",
          },

          value: {
            type: Type.STRING,
            nullable: true,
            description:
              "Value for set operation. Use null for delete operation.",
          },

          reason: {
            type: Type.STRING,
            description:
              "Brief reason for storing or deleting this memory.",
          },
        },

        required: ["operation", "key", "reason"],
      },
    },
  },

  required: ["memories"],
};

/**
 * Natural-language user message se long-term memories extract karta hai.
 */
export async function extractMemories(userMessage) {
  const cleanMessage = userMessage?.trim();

  if (!cleanMessage) {
    return [];
  }

  /*
   * Terminal commands ko memory extractor ke paas mat bhejo.
   */
  if (cleanMessage.startsWith("/")) {
    return [];
  }

  const existingMemory = getUserMemory();

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,

      contents: [
        {
          role: "user",
          parts: [
            {
              text: buildExtractionPrompt(
                cleanMessage,
                existingMemory
              ),
            },
          ],
        },
      ],

      config: {
        responseMimeType: "application/json",
        responseSchema: memoryExtractionSchema,
        temperature: 0,
      },
    });

    const responseText = response.text?.trim();

    if (!responseText) {
      return [];
    }

    const parsedResult = JSON.parse(responseText);

    if (!Array.isArray(parsedResult?.memories)) {
      return [];
    }

    return validateExtractedMemories(
      parsedResult.memories
    );
  } catch (error) {
    /*
     * Memory extraction fail hone se main chat fail nahi hogi.
     */
    console.error(
      "Automatic memory extraction failed:",
      error instanceof Error ? error.message : error
    );

    return [];
  }
}

function buildExtractionPrompt(
  userMessage,
  existingMemory
) {
  return `
You are a long-term user-memory extraction system.

Analyze the latest user message and extract only stable information
that will be useful in future conversations.

Existing saved memory:

${JSON.stringify(existingMemory, null, 2)}

Latest user message:

${userMessage}

Rules:

1. Save stable user information such as:
   - name
   - occupation
   - company
   - general location
   - preferences
   - interests
   - learning goals
   - communication preferences
   - long-term projects

2. Do not save:
   - greetings
   - temporary questions
   - one-time requests
   - passwords
   - API keys
   - tokens
   - OTPs
   - PINs
   - bank details
   - private keys
   - authentication information
   - highly sensitive personal information

3. Use "set" when:
   - a new fact is provided
   - an existing fact changes
   - the user corrects old information

4. Use "delete" only when the user explicitly asks to forget
   or remove saved information.

5. For delete operations, value must be null.

6. Use short camelCase keys.

7. Never guess information.

8. For deleting a memory, prefer an existing memory key.

9. If nothing should be remembered, return:
   {
     "memories": []
   }
  `.trim();
}

function validateExtractedMemories(memories) {
  if (!Array.isArray(memories)) {
    return [];
  }

  const safeMemories = [];

  for (const memory of memories) {
    if (
      !memory ||
      typeof memory !== "object" ||
      Array.isArray(memory)
    ) {
      continue;
    }

    const operation = memory.operation;
    const key =
      typeof memory.key === "string"
        ? memory.key.trim()
        : "";

    const reason =
      typeof memory.reason === "string"
        ? memory.reason.trim()
        : "";

    if (!["set", "delete"].includes(operation)) {
      continue;
    }

    if (!key || key.length > 100) {
      continue;
    }

    if (!reason) {
      continue;
    }

    if (containsSensitiveKey(key)) {
      continue;
    }

    if (operation === "set") {
      const value = memory.value;

      if (
        typeof value !== "string" ||
        !value.trim() ||
        value.length > 500
      ) {
        continue;
      }

      if (containsSecretLikeValue(value)) {
        continue;
      }

      safeMemories.push({
        operation: "set",
        key,
        value: value.trim(),
        reason,
      });

      continue;
    }

    safeMemories.push({
      operation: "delete",
      key,
      value: null,
      reason,
    });
  }

  /*
   * Ek message se maximum 5 memory operations.
   */
  return safeMemories.slice(0, 5);
}

function containsSensitiveKey(key) {
  const sensitiveWords = [
    "password",
    "passcode",
    "pin",
    "otp",
    "token",
    "secret",
    "apikey",
    "accesskey",
    "privatekey",
    "creditcard",
    "debitcard",
    "cvv",
    "bankaccount",
  ];

  const normalizedKey = key
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

  return sensitiveWords.some((word) =>
    normalizedKey.includes(word)
  );
}

function containsSecretLikeValue(value) {
  const normalizedValue = value.trim();

  const secretPatterns = [
    /^AIza[a-zA-Z0-9_-]{20,}$/,
    /^sk-[a-zA-Z0-9_-]{20,}$/,
    /^ghp_[a-zA-Z0-9]{20,}$/,
    /-----BEGIN .*PRIVATE KEY-----/,
    /^\d{4,8}$/,
  ];

  return secretPatterns.some((pattern) =>
    pattern.test(normalizedValue)
  );
}