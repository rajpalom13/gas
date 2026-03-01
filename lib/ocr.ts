import { GoogleGenerativeAI } from "@google/generative-ai";

export interface UPIPaymentData {
  amount: number;
  status: "success" | "failed";
  transaction_id: string;
  date: string;
  sender_name: string;
  receiver_name: string;
}

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

const PROMPT = `You are a UPI payment screenshot parser. Analyze this image of a UPI payment screenshot and extract the following fields.

Return ONLY a valid JSON object with these exact keys:
- "amount": the transaction amount as a number (no currency symbol, no commas)
- "status": either "success" or "failed"
- "transaction_id": the UPI transaction/reference ID as a string
- "date": the transaction date as a string (preserve the format shown)
- "sender_name": the name of the person/account who sent the money
- "receiver_name": the name of the person/merchant who received the money

If a field is not visible in the screenshot, use an empty string for string fields and 0 for the amount.
Do NOT include any text outside the JSON object. No markdown, no explanation.`;

export async function parseUPIScreenshot(
  imageBuffer: Buffer
): Promise<UPIPaymentData | null> {
  if (!GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY is not set");
    return null;
  }

  try {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const result = await model.generateContent([
      PROMPT,
      {
        inlineData: {
          mimeType: "image/png",
          data: imageBuffer.toString("base64"),
        },
      },
    ]);

    const text = result.response.text().trim();

    // Strip markdown code fences if present
    const jsonStr = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");

    const parsed = JSON.parse(jsonStr);

    return {
      amount: typeof parsed.amount === "number" ? parsed.amount : Number(parsed.amount) || 0,
      status: parsed.status === "failed" ? "failed" : "success",
      transaction_id: String(parsed.transaction_id || ""),
      date: String(parsed.date || ""),
      sender_name: String(parsed.sender_name || ""),
      receiver_name: String(parsed.receiver_name || ""),
    };
  } catch (error) {
    console.error("OCR parsing failed:", error);
    return null;
  }
}
