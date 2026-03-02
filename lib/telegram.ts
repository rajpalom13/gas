import { connectDB } from "./db";
import { TelegramSession } from "./models/TelegramSession";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;

// Session management - persisted to MongoDB
interface SessionState {
  step: string;
  data: Record<string, unknown>;
  messageId?: number;
}

export async function getSession(chatId: number): Promise<SessionState | undefined> {
  await connectDB();
  const session = await TelegramSession.findOne({ chatId }).lean();
  if (!session) return undefined;
  return { step: session.step, data: session.data as Record<string, unknown> };
}

export async function setSession(chatId: number, state: SessionState) {
  await connectDB();
  await TelegramSession.findOneAndUpdate(
    { chatId },
    { step: state.step, data: state.data, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
    { upsert: true }
  );
}

export async function clearSession(chatId: number) {
  await connectDB();
  await TelegramSession.deleteOne({ chatId });
}

// Telegram API helpers
export async function sendMessage(
  chatId: number,
  text: string,
  replyMarkup?: unknown
) {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
  };
  if (replyMarkup) body.reply_markup = replyMarkup;

  const res = await fetch(`${API_BASE}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function editMessage(
  chatId: number,
  messageId: number,
  text: string,
  replyMarkup?: unknown
) {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
  };
  if (replyMarkup) body.reply_markup = replyMarkup;

  const res = await fetch(`${API_BASE}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function answerCallback(callbackQueryId: string, text?: string) {
  await fetch(`${API_BASE}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      callback_query_id: callbackQueryId,
      text: text || "",
    }),
  });
}

// Keyboard builders
export function inlineKeyboard(buttons: { text: string; callback_data: string }[][]) {
  return { inline_keyboard: buttons };
}

export function mainMenuKeyboard() {
  return inlineKeyboard([
    [
      { text: "📊 Dashboard", callback_data: "dashboard" },
      { text: "📦 Inventory", callback_data: "inventory" },
    ],
    [
      { text: "👥 Staff List", callback_data: "staff_list" },
      { text: "➕ Add Staff", callback_data: "add_staff" },
    ],
    [
      { text: "📝 New Settlement", callback_data: "new_settlement" },
      { text: "📋 Recent Settlements", callback_data: "recent_settlements" },
    ],
    [
      { text: "📅 Attendance", callback_data: "attendance" },
    ],
  ]);
}

// Format helpers
export function formatINR(amount: number): string {
  return `₹${amount.toLocaleString("en-IN")}`;
}

export function formatDateShort(date: Date | string): string {
  return new Date(date).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
