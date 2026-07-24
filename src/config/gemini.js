import "dotenv/config";
import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  throw new Error(
    "GEMINI_API_KEY missing hai. Project ke root mein .env file check karo."
  );
}

export const ai = new GoogleGenAI({
  apiKey,
});

export const GEMINI_MODEL = "gemini-3.6-flash";