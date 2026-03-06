import { NextResponse } from "next/server";
import { connectDB, withTransaction } from "@/lib/db";
import { Staff } from "@/lib/models/Staff";
import { Inventory } from "@/lib/models/Inventory";
import { Settlement } from "@/lib/models/Settlement";
import { DebtPayment } from "@/lib/models/DebtPayment";
import {
  sendMessage,
  editMessage,
  answerCallback,
  inlineKeyboard,
  mainMenuKeyboard,
  getSession,
  setSession,
  clearSession,
  formatINR,
  formatDateShort,
} from "@/lib/telegram";
import { parseUPIScreenshot } from "@/lib/ocr";
import { computeSettlement, normalizeSettlement } from "@/lib/settlement-utils";
import { Attendance } from "@/lib/models/Attendance";

const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || "";
const TELEGRAM_BOT_USER_ID = process.env.TELEGRAM_BOT_USER_ID || "";

export async function POST(request: Request) {
  try {
    // Webhook verification
    if (WEBHOOK_SECRET) {
      const token = request.headers.get("x-telegram-bot-api-secret-token");
      if (token !== WEBHOOK_SECRET) {
        return NextResponse.json({ ok: false }, { status: 403 });
      }
    }

    const update = await request.json();

    const ALLOWED_CHAT_IDS = process.env.TELEGRAM_ALLOWED_CHAT_IDS;
    if (ALLOWED_CHAT_IDS) {
      const chatId = update.message?.chat?.id || update.callback_query?.message?.chat?.id;
      const allowed = ALLOWED_CHAT_IDS.split(",").map((id: string) => parseInt(id.trim()));
      if (chatId && !allowed.includes(chatId)) {
        return NextResponse.json({ ok: true });
      }
    }

    await connectDB();

    if (update.message) {
      await handleMessage(update.message);
    } else if (update.callback_query) {
      await handleCallback(update.callback_query);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Telegram webhook error:", error);
    return NextResponse.json({ ok: true });
  }
}

// ─── MESSAGE HANDLER ─────────────────────────────────────────
async function handleMessage(message: {
  chat: { id: number };
  text?: string;
  photo?: { file_id: string; file_size?: number }[];
}) {
  const chatId = message.chat.id;
  const text = message.text?.trim() || "";

  // Handle photo messages (UPI screenshot OCR)
  if (message.photo && message.photo.length > 0) {
    await handlePhotoMessage(chatId, message.photo);
    return;
  }

  // Check if user is in a conversation flow
  const session = await getSession(chatId);
  if (session) {
    await handleSessionInput(chatId, text, session);
    return;
  }

  // Commands
  if (text === "/start" || text === "/menu") {
    await sendMessage(
      chatId,
      "🔥 <b>Gobind Bharat Gas</b>\n\nWelcome! Choose an option below:",
      mainMenuKeyboard()
    );
    return;
  }

  if (text === "/dashboard") {
    await handleDashboard(chatId);
    return;
  }

  if (text === "/inventory") {
    await handleInventory(chatId);
    return;
  }

  if (text === "/staff") {
    await handleStaffList(chatId);
    return;
  }

  // Unknown command
  await sendMessage(
    chatId,
    "🔥 <b>Gobind Bharat Gas Bot</b>\n\nUse /menu to see all options.",
    mainMenuKeyboard()
  );
}

// ─── CALLBACK HANDLER ────────────────────────────────────────
async function handleCallback(query: {
  id: string;
  from: { id: number };
  message?: { chat: { id: number }; message_id: number };
  data?: string;
}) {
  const chatId = query.message?.chat.id;
  const messageId = query.message?.message_id;
  const data = query.data || "";

  if (!chatId || !messageId) return;
  await answerCallback(query.id);

  // Main menu
  if (data === "main_menu") {
    await clearSession(chatId);
    await editMessage(
      chatId,
      messageId,
      "🔥 <b>Gobind Bharat Gas</b>\n\nChoose an option:",
      mainMenuKeyboard()
    );
    return;
  }

  // Dashboard
  if (data === "dashboard") {
    await handleDashboardEdit(chatId, messageId);
    return;
  }

  // Inventory
  if (data === "inventory") {
    await handleInventoryEdit(chatId, messageId);
    return;
  }

  if (data.startsWith("inv_edit_")) {
    const size = data.replace("inv_edit_", "");
    await setSession(chatId, {
      step: "inv_full",
      data: { cylinderSize: size, messageId },
    });
    await sendMessage(
      chatId,
      `📦 <b>Edit ${size} Cylinder</b>\n\nEnter new <b>Full Stock</b> count:`
    );
    return;
  }

  // Staff
  if (data === "staff_list") {
    await handleStaffListEdit(chatId, messageId);
    return;
  }

  if (data === "add_staff") {
    await setSession(chatId, { step: "staff_name", data: { messageId } });
    await sendMessage(chatId, "👥 <b>Add New Staff</b>\n\nEnter staff <b>name</b>:");
    return;
  }

  if (data.startsWith("staff_detail_")) {
    const staffId = data.replace("staff_detail_", "");
    await handleStaffDetailEdit(chatId, messageId, staffId);
    return;
  }

  if (data.startsWith("staff_ledger_")) {
    const staffId = data.replace("staff_ledger_", "");
    await handleStaffLedgerEdit(chatId, messageId, staffId);
    return;
  }

  // Debt payment
  if (data.startsWith("debt_pay_")) {
    const staffId = data.replace("debt_pay_", "");
    await setSession(chatId, { step: "debt_amount", data: { staffId, messageId } });
    const staff = await Staff.findById(staffId).lean();
    await sendMessage(
      chatId,
      `💰 <b>Pay Debt for ${staff?.name || "Staff"}</b>\n\nCurrent debt: <b>${formatINR(staff?.debtBalance || 0)}</b>\n\nEnter payment amount:`
    );
    return;
  }

  // New Settlement
  if (data === "new_settlement") {
    await handleNewSettlementStart(chatId, messageId);
    return;
  }

  if (data.startsWith("settle_staff_")) {
    const staffId = data.replace("settle_staff_", "");
    const staff = await Staff.findById(staffId).lean();
    if (!staff) return;
    await setSession(chatId, {
      step: "settle_date",
      data: { staffId, staffName: staff.name, items: [], messageId },
    });
    await sendMessage(
      chatId,
      `📅 Enter settlement <b>date</b> (DD/MM/YYYY) or type <b>today</b>:`
    );
    return;
  }

  if (data.startsWith("settle_cyl_")) {
    const size = data.replace("settle_cyl_", "");
    const session = await getSession(chatId);
    if (!session) return;
    session.data.currentCylinder = size;
    session.step = "settle_qty";
    await setSession(chatId, session);
    await sendMessage(chatId, `📝 Enter <b>quantity</b> for ${size} cylinder:`);
    return;
  }

  if (data === "settle_done_cylinders") {
    const session = await getSession(chatId);
    if (!session || !(session.data.items as unknown[]).length) {
      await sendMessage(chatId, "⚠️ Add at least one cylinder first.");
      return;
    }

    // Get unique cylinder sizes (excluding full-DBC) for empty cylinder questions
    const items = session.data.items as { cylinderSize: string; quantity: number; isNewConnection?: boolean }[];
    const sizesForEmpties = Array.from(new Set(items.filter(i => !i.isNewConnection).map(i => i.cylinderSize)));

    if (sizesForEmpties.length > 0) {
      session.data.emptySizesToAsk = sizesForEmpties;
      session.data.emptyCylindersReturned = [];
      const firstSize = sizesForEmpties[0];
      session.step = `settle_empty_${firstSize}`;
      await setSession(chatId, session);
      await sendMessage(chatId, `🔄 How many <b>${firstSize}</b> empty cylinders returned? (or 0):`);
    } else {
      // All items are DBC, skip empty cylinders
      session.data.emptyCylindersReturned = [];
      session.data.transactions = [];
      session.step = "settle_transactions_menu";
      await setSession(chatId, session);
      await showTransactionsMenu(chatId, session);
    }
    return;
  }

  if (data === "settle_confirm") {
    await handleSettleConfirm(chatId);
    return;
  }

  if (data === "settle_cancel") {
    await clearSession(chatId);
    await sendMessage(chatId, "❌ Settlement cancelled.", mainMenuKeyboard());
    return;
  }

  // DBC callbacks
  if (data === "settle_dbc_yes" || data === "settle_dbc_no") {
    const session = await getSession(chatId);
    if (!session) return;
    const isNewConnection = data === "settle_dbc_yes";
    const items = (session.data.items as { cylinderSize: string; quantity: number; isNewConnection?: boolean }[]) || [];
    items.push({
      cylinderSize: session.data.currentCylinder as string,
      quantity: session.data.currentQty as number,
      isNewConnection,
    });
    session.data.items = items;
    session.step = "settle_cylinder";
    await setSession(chatId, session);
    await handleSettleCylinderSelect(chatId);
    return;
  }

  // Transaction menu callbacks
  if (data === "settle_tx_credit") {
    const session = await getSession(chatId);
    if (!session) return;
    session.data.txType = "credit";
    session.step = "settle_tx_category";
    await setSession(chatId, session);
    await sendMessage(
      chatId,
      "➕ Select <b>credit</b> category:",
      inlineKeyboard([
        [{ text: "💳 Paytm", callback_data: "settle_tx_cat_Paytm" }],
        [{ text: "💵 Cash", callback_data: "settle_tx_cat_Cash" }],
        [{ text: "📱 UPI", callback_data: "settle_tx_cat_UPI" }],
        [{ text: "📲 PhonePe", callback_data: "settle_tx_cat_PhonePe" }],
        [{ text: "📋 Other", callback_data: "settle_tx_cat_Other" }],
        [{ text: "↩️ Back", callback_data: "settle_tx_back" }],
      ])
    );
    return;
  }

  if (data === "settle_tx_debit") {
    const session = await getSession(chatId);
    if (!session) return;
    session.data.txType = "debit";
    session.step = "settle_tx_category";
    await setSession(chatId, session);
    await sendMessage(
      chatId,
      "➖ Select <b>debit</b> category:",
      inlineKeyboard([
        [{ text: "⛽ Fuel", callback_data: "settle_tx_cat_Fuel" }],
        [{ text: "💸 Discount", callback_data: "settle_tx_cat_Discount" }],
        [{ text: "↩️ Return", callback_data: "settle_tx_cat_Return" }],
        [{ text: "🔧 Maintenance", callback_data: "settle_tx_cat_Maintenance" }],
        [{ text: "📋 Other", callback_data: "settle_tx_cat_Other" }],
        [{ text: "↩️ Back", callback_data: "settle_tx_back" }],
      ])
    );
    return;
  }

  if (data.startsWith("settle_tx_cat_")) {
    const category = data.replace("settle_tx_cat_", "");
    const session = await getSession(chatId);
    if (!session) return;
    session.data.txCategory = category;
    session.step = "settle_tx_amount";
    await setSession(chatId, session);
    const txType = session.data.txType as string;
    await sendMessage(chatId, `Enter <b>${txType === "credit" ? "credit" : "debit"}</b> amount for <b>${category}</b>:`);
    return;
  }

  if (data === "settle_tx_back") {
    const session = await getSession(chatId);
    if (!session) return;
    session.step = "settle_transactions_menu";
    await setSession(chatId, session);
    await showTransactionsMenu(chatId, session);
    return;
  }

  if (data === "settle_tx_done") {
    const session = await getSession(chatId);
    if (!session) return;
    if (session.data.isOCR) {
      // Skip actual cash input, already have it from OCR
      session.step = "settle_denomination";
      await setSession(chatId, session);
      await sendMessage(
        chatId,
        `💵 Actual cash (from UPI): <b>${formatINR(session.data.actualCashReceived as number)}</b>\n\nEnter <b>cash denominations</b> (optional):\n\nFormat: <code>500x2, 200x1, 100x5</code>\n\nOr send <b>-</b> to skip.`
      );
    } else {
      session.step = "settle_actual_cash";
      await setSession(chatId, session);
      await sendMessage(chatId, "💵 Enter <b>actual cash received</b>:");
    }
    return;
  }

  // Attendance
  if (data === "attendance") {
    await handleAttendanceEdit(chatId, messageId);
    return;
  }

  if (data.startsWith("att_mark_")) {
    const parts = data.replace("att_mark_", "").split("_");
    const status = parts.pop()!;
    const staffId = parts.join("_");
    await handleAttendanceMark(chatId, messageId, staffId, status);
    return;
  }

  if (data === "att_all_present") {
    await handleAttendanceAllPresent(chatId, messageId);
    return;
  }

  // OCR payment flow
  if (data.startsWith("apply_payment_")) {
    const amount = parseFloat(data.replace("apply_payment_", ""));
    await handleOCRApplyPayment(chatId, messageId, amount);
    return;
  }

  if (data.startsWith("ocr_staff_")) {
    const parts = data.replace("ocr_staff_", "").split("_");
    const amount = parseFloat(parts.pop()!);
    const staffId = parts.join("_");
    await handleOCRStaffSelected(chatId, staffId, amount);
    return;
  }

  // Recent settlements
  if (data === "recent_settlements") {
    await handleRecentSettlementsEdit(chatId, messageId);
    return;
  }
}

// ─── SESSION INPUT HANDLER ───────────────────────────────────
async function handleSessionInput(
  chatId: number,
  text: string,
  session: { step: string; data: Record<string, unknown> }
) {
  if (text.toLowerCase() === "cancel" || text === "/cancel") {
    await clearSession(chatId);
    await sendMessage(chatId, "❌ Cancelled. Use /menu to see options.", mainMenuKeyboard());
    return;
  }

  // ── Inventory edit flow ──
  if (session.step === "inv_full") {
    const val = parseInt(text);
    if (isNaN(val) || val < 0) {
      await sendMessage(chatId, "⚠️ Enter a valid number:");
      return;
    }
    session.data.fullStock = val;
    session.step = "inv_empty";
    await setSession(chatId, session);
    await sendMessage(chatId, "Enter new <b>Empty Stock</b> count:");
    return;
  }

  if (session.step === "inv_empty") {
    const val = parseInt(text);
    if (isNaN(val) || val < 0) {
      await sendMessage(chatId, "⚠️ Enter a valid number:");
      return;
    }
    session.data.emptyStock = val;
    session.step = "inv_price";
    await setSession(chatId, session);
    await sendMessage(chatId, "Enter new <b>Price per Unit</b> (₹):");
    return;
  }

  if (session.step === "inv_price") {
    const val = parseInt(text);
    if (isNaN(val) || val < 0) {
      await sendMessage(chatId, "⚠️ Enter a valid number:");
      return;
    }
    const cylinderSize = session.data.cylinderSize as string;
    const fullStock = session.data.fullStock as number;
    const emptyStock = session.data.emptyStock as number;
    await Inventory.findOneAndUpdate(
      { cylinderSize },
      { fullStock, emptyStock, pricePerUnit: val }
    );
    await clearSession(chatId);
    await sendMessage(
      chatId,
      `✅ <b>${cylinderSize} Cylinder</b> updated!\n\nFull: ${fullStock} | Empty: ${emptyStock} | Price: ${formatINR(val)}`,
      inlineKeyboard([
        [{ text: "📦 Back to Inventory", callback_data: "inventory" }],
        [{ text: "🏠 Main Menu", callback_data: "main_menu" }],
      ])
    );
    return;
  }

  // ── Add Staff flow ──
  if (session.step === "staff_name") {
    if (!text) {
      await sendMessage(chatId, "⚠️ Name cannot be empty:");
      return;
    }
    session.data.name = text;
    session.step = "staff_phone";
    await setSession(chatId, session);
    await sendMessage(chatId, "Enter <b>phone number</b> (or send - to skip):");
    return;
  }

  if (session.step === "staff_phone") {
    session.data.phone = text === "-" ? "" : text;
    session.step = "staff_address";
    await setSession(chatId, session);
    await sendMessage(chatId, "Enter <b>address</b> (or send - to skip):");
    return;
  }

  if (session.step === "staff_address") {
    session.data.address = text === "-" ? "" : text;
    await Staff.create({
      name: session.data.name as string,
      phone: (session.data.phone as string) || "",
      address: (session.data.address as string) || "",
    });
    await clearSession(chatId);
    await sendMessage(
      chatId,
      `✅ Staff <b>${session.data.name as string}</b> added successfully!`,
      inlineKeyboard([
        [{ text: "👥 Staff List", callback_data: "staff_list" }],
        [{ text: "🏠 Main Menu", callback_data: "main_menu" }],
      ])
    );
    return;
  }

  // ── Debt payment flow ──
  if (session.step === "debt_amount") {
    const amount = parseFloat(text);
    if (isNaN(amount) || amount <= 0) {
      await sendMessage(chatId, "⚠️ Enter a valid amount (> 0):");
      return;
    }
    const staffId = session.data.staffId as string;
    const staff = await Staff.findById(staffId);
    if (!staff) {
      await clearSession(chatId);
      await sendMessage(chatId, "⚠️ Staff not found.", mainMenuKeyboard());
      return;
    }
    if (amount > staff.debtBalance) {
      await sendMessage(chatId, `⚠️ Amount exceeds debt balance (${formatINR(staff.debtBalance)}). Enter a smaller amount:`);
      return;
    }

    session.data.amount = amount;
    session.step = "debt_note";
    await setSession(chatId, session);
    await sendMessage(chatId, "📝 Enter a <b>note</b> for this payment (or send - to skip):");
    return;
  }

  if (session.step === "debt_note") {
    const note = text === "-" ? "" : text;
    const staffId = session.data.staffId as string;
    const amount = session.data.amount as number;

    try {
      await withTransaction(async (txSession) => {
        await DebtPayment.create(
          [
            {
              staff: staffId,
              amount,
              note,
              recordedBy: TELEGRAM_BOT_USER_ID || undefined,
            },
          ],
          { session: txSession }
        );
        await Staff.findByIdAndUpdate(staffId, { $inc: { debtBalance: -amount } }, { session: txSession });
      });

      const staff = await Staff.findById(staffId).lean();
      await clearSession(chatId);
      await sendMessage(
        chatId,
        `✅ <b>Debt Payment Recorded</b>\n\n💰 Amount: ${formatINR(amount)}\n👤 Staff: ${staff?.name || "Unknown"}\n📝 Note: ${note || "—"}\n🔴 Remaining Debt: ${formatINR(staff?.debtBalance || 0)}`,
        inlineKeyboard([
          [{ text: `👤 ${staff?.name || "Staff"}`, callback_data: `staff_detail_${staffId}` }],
          [{ text: "🏠 Main Menu", callback_data: "main_menu" }],
        ])
      );
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      await sendMessage(
        chatId,
        `❌ <b>Debt Payment Failed</b>\n\n${errMsg}\n\nPlease try again.`,
        mainMenuKeyboard()
      );
    }
    return;
  }

  // ── Settlement date step ──
  if (session.step === "settle_date") {
    let settlementDate: Date;
    if (text.toLowerCase() === "today") {
      settlementDate = new Date();
    } else {
      // Parse DD/MM/YYYY
      const parts = text.split("/");
      if (parts.length === 3) {
        const day = parseInt(parts[0]);
        const month = parseInt(parts[1]) - 1;
        const year = parseInt(parts[2]);
        settlementDate = new Date(year, month, day);
        if (isNaN(settlementDate.getTime())) {
          await sendMessage(chatId, "⚠️ Invalid date. Enter DD/MM/YYYY or type <b>today</b>:");
          return;
        }
      } else {
        await sendMessage(chatId, "⚠️ Invalid format. Enter DD/MM/YYYY or type <b>today</b>:");
        return;
      }
    }
    session.data.date = settlementDate.toISOString();
    session.step = "settle_cylinder";
    await setSession(chatId, session);
    await handleSettleCylinderSelect(chatId);
    return;
  }

  // ── Settlement flow ──
  if (session.step === "settle_qty") {
    const qty = parseInt(text);
    if (isNaN(qty) || qty <= 0) {
      await sendMessage(chatId, "⚠️ Enter a valid quantity (> 0):");
      return;
    }
    session.data.currentQty = qty;
    session.step = "settle_dbc";
    await setSession(chatId, session);
    await sendMessage(
      chatId,
      `Is this a <b>New Connection (DBC)</b>?\n\n${session.data.currentCylinder} × ${qty}`,
      inlineKeyboard([
        [
          { text: "📦 Regular", callback_data: "settle_dbc_no" },
          { text: "🆕 New Connection (DBC)", callback_data: "settle_dbc_yes" },
        ],
      ])
    );
    return;
  }

  // DBC question for each item (handled by callback, not text input)
  if (session.step === "settle_dbc") {
    return;
  }

  // Empty cylinder return steps
  if (session.step.startsWith("settle_empty_")) {
    const cylinderSize = session.step.replace("settle_empty_", "");
    const qty = parseInt(text);
    if (isNaN(qty) || qty < 0) {
      await sendMessage(chatId, "⚠️ Enter a valid number (>= 0):");
      return;
    }
    const emptyCylindersReturned = (session.data.emptyCylindersReturned as { cylinderSize: string; quantity: number }[]) || [];
    if (qty > 0) {
      emptyCylindersReturned.push({ cylinderSize, quantity: qty });
    }
    session.data.emptyCylindersReturned = emptyCylindersReturned;

    // Check if there are more sizes to ask about
    const remainingSizes = (session.data.emptySizesToAsk as string[]) || [];
    const nextIdx = remainingSizes.indexOf(cylinderSize) + 1;
    if (nextIdx < remainingSizes.length) {
      const nextSize = remainingSizes[nextIdx];
      session.step = `settle_empty_${nextSize}`;
      await setSession(chatId, session);
      await sendMessage(chatId, `🔄 How many <b>${nextSize}</b> empty cylinders returned? (or 0):`);
    } else {
      // Move to transactions menu
      session.data.transactions = session.data.transactions || [];
      session.step = "settle_transactions_menu";
      await setSession(chatId, session);
      await showTransactionsMenu(chatId, session);
    }
    return;
  }

  // Transaction amount input
  if (session.step === "settle_tx_amount") {
    const val = parseFloat(text);
    if (isNaN(val) || val <= 0) {
      await sendMessage(chatId, "⚠️ Enter a valid amount (> 0):");
      return;
    }
    const transactions = (session.data.transactions as { type: string; category: string; amount: number }[]) || [];
    transactions.push({
      type: session.data.txType as string,
      category: session.data.txCategory as string,
      amount: val,
    });
    session.data.transactions = transactions;
    session.step = "settle_transactions_menu";
    await setSession(chatId, session);
    await showTransactionsMenu(chatId, session);
    return;
  }

  // Actual cash received
  if (session.step === "settle_actual_cash") {
    const val = parseFloat(text) || 0;
    session.data.actualCashReceived = val;
    session.step = "settle_denomination";
    await setSession(chatId, session);
    await sendMessage(
      chatId,
      "💵 Enter <b>cash denominations</b> (optional):\n\nFormat: <code>500x2, 200x1, 100x5</code>\n\nOr send <b>-</b> to skip."
    );
    return;
  }

  // Denomination step
  if (session.step === "settle_denomination") {
    let denominations: { note: number; count: number; total: number }[] = [];
    let denominationTotal = 0;

    if (text !== "-") {
      const parts = text.split(",").map((s) => s.trim());
      for (const part of parts) {
        const match = part.match(/^(\d+)\s*[xX×]\s*(\d+)$/);
        if (match) {
          const note = parseInt(match[1]);
          const count = parseInt(match[2]);
          denominations.push({ note, count, total: note * count });
          denominationTotal += note * count;
        }
      }
    }

    session.data.denominations = denominations;
    session.data.denominationTotal = denominationTotal;
    session.step = "settle_notes";
    await setSession(chatId, session);
    await sendMessage(chatId, "📝 Enter <b>notes</b> (or send <b>-</b> to skip):");
    return;
  }

  // Notes step
  if (session.step === "settle_notes") {
    session.data.notes = text === "-" ? "" : text;

    const items = session.data.items as { cylinderSize: string; quantity: number; isNewConnection?: boolean }[];
    let grossRevenue = 0;
    const itemLines: string[] = [];

    session.data.resolvedPrices = {};
    for (const item of items) {
      const inv = await Inventory.findOne({ cylinderSize: item.cylinderSize }).lean();
      const price = inv?.pricePerUnit || 0;
      (session.data.resolvedPrices as Record<string, number>)[item.cylinderSize] = price;
      const total = item.quantity * price;
      grossRevenue += total;
      itemLines.push(
        `  ${item.cylinderSize}: ${item.quantity} × ${formatINR(price)} = ${formatINR(total)}${item.isNewConnection ? " (DBC)" : ""}`
      );
    }

    const transactions = (session.data.transactions as { type: string; category: string; amount: number }[]) || [];
    const actualCashReceived = (session.data.actualCashReceived as number) || 0;

    const computed = computeSettlement(
      items.map(i => ({
        cylinderSize: i.cylinderSize,
        quantity: i.quantity,
        pricePerUnit: (session.data.resolvedPrices as Record<string, number>)[i.cylinderSize] || 0,
        total: i.quantity * ((session.data.resolvedPrices as Record<string, number>)[i.cylinderSize] || 0),
        isNewConnection: i.isNewConnection,
      })),
      transactions.map(t => ({ type: t.type as "credit" | "debit", category: t.category, amount: t.amount })),
      actualCashReceived
    );

    const denominationTotal = (session.data.denominationTotal as number) || 0;
    const dateStr = session.data.date ? formatDateShort(session.data.date as string) : formatDateShort(new Date());
    const emptyCylindersReturned = (session.data.emptyCylindersReturned as { cylinderSize: string; quantity: number }[]) || [];

    session.data.grossRevenue = grossRevenue;
    session.data.computed = computed;
    session.step = "settle_confirm";
    await setSession(chatId, session);

    const creditTxns = transactions.filter(t => t.type === "credit");
    const debitTxns = transactions.filter(t => t.type === "debit");

    const summary = [
      `📝 <b>Settlement Summary</b>`,
      ``,
      `👤 Staff: <b>${session.data.staffName}</b>`,
      `📅 Date: ${dateStr}`,
      ``,
      `📦 <b>Cylinders:</b>`,
      ...itemLines,
      ``,
      `💰 Gross Revenue: <b>${formatINR(grossRevenue)}</b>`,
      creditTxns.length > 0 ? `\n➕ <b>Credits:</b>` : null,
      ...creditTxns.map(t => `  ${t.category}: ${formatINR(t.amount)}`),
      creditTxns.length > 0 ? `  Total Credits: <b>${formatINR(computed.totalCredits)}</b>` : null,
      debitTxns.length > 0 ? `\n➖ <b>Debits:</b>` : null,
      ...debitTxns.map(t => `  ${t.category}: ${formatINR(t.amount)}`),
      debitTxns.length > 0 ? `  Total Debits: <b>${formatINR(computed.totalDebits)}</b>` : null,
      ``,
      `📊 Net Revenue: <b>${formatINR(computed.netRevenue)}</b>`,
      `💵 Actual Cash: ${formatINR(actualCashReceived)}`,
      denominationTotal > 0 ? `🏷️ Denomination Total: ${formatINR(denominationTotal)}` : null,
      denominationTotal > 0 && denominationTotal !== actualCashReceived ? `⚠️ Denomination mismatch!` : null,
      computed.amountPending > 0
        ? `⚠️ Amount Pending: <b>${formatINR(computed.amountPending)}</b>`
        : `✅ No pending amount`,
      emptyCylindersReturned.length > 0 ? `\n🔄 <b>Empty Cylinders Returned:</b>` : null,
      ...emptyCylindersReturned.map(e => `  ${e.cylinderSize}: ${e.quantity}`),
      session.data.notes ? `\n📝 Notes: ${session.data.notes}` : null,
    ].filter(Boolean).join("\n");

    await sendMessage(
      chatId,
      summary,
      inlineKeyboard([
        [
          { text: "✅ Confirm", callback_data: "settle_confirm" },
          { text: "❌ Cancel", callback_data: "settle_cancel" },
        ],
      ])
    );
    return;
  }

}

// ─── FEATURE HANDLERS ────────────────────────────────────────

async function handleDashboard(chatId: number) {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(now.getTime() + istOffset);
  const istDateStr = istNow.toISOString().split("T")[0];
  const today = new Date(istDateStr + "T00:00:00.000+05:30");
  const endOfDay = new Date(istDateStr + "T23:59:59.999+05:30");

  const [settlements, staffCount, totalDebtAgg, inventory] = await Promise.all([
    Settlement.find({ date: { $gte: today, $lte: endOfDay } }).lean(),
    Staff.countDocuments({ isActive: true }),
    Staff.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: null, total: { $sum: "$debtBalance" } } },
    ]),
    Inventory.find({}).lean(),
  ]);

  const totalDeliveries = settlements.reduce(
    (a, s) => a + s.items.reduce((b: number, i: { quantity: number }) => b + i.quantity, 0),
    0
  );
  const totalRevenue = settlements.reduce((a, s) => a + s.grossRevenue, 0);
  const totalCredits = settlements.reduce((a, s) => {
    const n = normalizeSettlement(s as unknown as Record<string, unknown>);
    return a + ((n.totalCredits as number) || 0);
  }, 0);
  const totalDebits = settlements.reduce((a, s) => {
    const n = normalizeSettlement(s as unknown as Record<string, unknown>);
    return a + ((n.totalDebits as number) || 0);
  }, 0);
  const totalAmountPending = settlements.reduce((a, s) => {
    const n = normalizeSettlement(s as unknown as Record<string, unknown>);
    return a + ((n.amountPending as number) || 0);
  }, 0);
  const totalCash = settlements.reduce((a, s) => {
    const n = normalizeSettlement(s as unknown as Record<string, unknown>);
    return a + ((n.actualCashReceived as number) || 0);
  }, 0);
  const totalDebt = totalDebtAgg[0]?.total || 0;

  const invLines = inventory
    .map((i) => `  ${i.cylinderSize}: Full ${i.fullStock} | Empty ${i.emptyStock}`)
    .join("\n");

  const msg = [
    `📊 <b>Dashboard</b> — ${formatDateShort(new Date())}`,
    ``,
    `📦 Deliveries: <b>${totalDeliveries}</b> cylinders`,
    `💰 Revenue: <b>${formatINR(totalRevenue)}</b>`,
    `➕ Credits: <b>${formatINR(totalCredits)}</b>`,
    `➖ Debits: <b>${formatINR(totalDebits)}</b>`,
    `⚠️ Amount Pending: <b>${formatINR(totalAmountPending)}</b>`,
    `💵 Cash Collected: <b>${formatINR(totalCash)}</b>`,
    ``,
    `👥 Active Staff: ${staffCount}`,
    `🔴 Total Debt: ${formatINR(totalDebt)}`,
    ``,
    `📦 <b>Inventory:</b>`,
    invLines,
  ].join("\n");

  await sendMessage(
    chatId,
    msg,
    inlineKeyboard([
      [{ text: "🔄 Refresh", callback_data: "dashboard" }],
      [{ text: "🏠 Main Menu", callback_data: "main_menu" }],
    ])
  );
}

async function handleDashboardEdit(chatId: number, messageId: number) {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(now.getTime() + istOffset);
  const istDateStr = istNow.toISOString().split("T")[0];
  const today = new Date(istDateStr + "T00:00:00.000+05:30");
  const endOfDay = new Date(istDateStr + "T23:59:59.999+05:30");

  const [settlements, staffCount, totalDebtAgg, inventory] = await Promise.all([
    Settlement.find({ date: { $gte: today, $lte: endOfDay } }).lean(),
    Staff.countDocuments({ isActive: true }),
    Staff.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: null, total: { $sum: "$debtBalance" } } },
    ]),
    Inventory.find({}).lean(),
  ]);

  const totalDeliveries = settlements.reduce(
    (a, s) => a + s.items.reduce((b: number, i: { quantity: number }) => b + i.quantity, 0),
    0
  );
  const totalRevenue = settlements.reduce((a, s) => a + s.grossRevenue, 0);
  const totalCredits = settlements.reduce((a, s) => {
    const n = normalizeSettlement(s as unknown as Record<string, unknown>);
    return a + ((n.totalCredits as number) || 0);
  }, 0);
  const totalDebits = settlements.reduce((a, s) => {
    const n = normalizeSettlement(s as unknown as Record<string, unknown>);
    return a + ((n.totalDebits as number) || 0);
  }, 0);
  const totalAmountPending = settlements.reduce((a, s) => {
    const n = normalizeSettlement(s as unknown as Record<string, unknown>);
    return a + ((n.amountPending as number) || 0);
  }, 0);
  const totalCash = settlements.reduce((a, s) => {
    const n = normalizeSettlement(s as unknown as Record<string, unknown>);
    return a + ((n.actualCashReceived as number) || 0);
  }, 0);
  const totalDebt = totalDebtAgg[0]?.total || 0;

  const invLines = inventory
    .map((i) => `  ${i.cylinderSize}: Full ${i.fullStock} | Empty ${i.emptyStock}`)
    .join("\n");

  const msg = [
    `📊 <b>Dashboard</b> — ${formatDateShort(new Date())}`,
    ``,
    `📦 Deliveries: <b>${totalDeliveries}</b> cylinders`,
    `💰 Revenue: <b>${formatINR(totalRevenue)}</b>`,
    `➕ Credits: <b>${formatINR(totalCredits)}</b>`,
    `➖ Debits: <b>${formatINR(totalDebits)}</b>`,
    `⚠️ Amount Pending: <b>${formatINR(totalAmountPending)}</b>`,
    `💵 Cash Collected: <b>${formatINR(totalCash)}</b>`,
    ``,
    `👥 Active Staff: ${staffCount}`,
    `🔴 Total Debt: ${formatINR(totalDebt)}`,
    ``,
    `📦 <b>Inventory:</b>`,
    invLines,
  ].join("\n");

  await editMessage(
    chatId,
    messageId,
    msg,
    inlineKeyboard([
      [{ text: "🔄 Refresh", callback_data: "dashboard" }],
      [{ text: "🏠 Main Menu", callback_data: "main_menu" }],
    ])
  );
}

async function handleInventory(chatId: number) {
  const inventory = await Inventory.find({}).sort({ cylinderSize: 1 }).lean();
  const lines = inventory.map(
    (i) =>
      `📦 <b>${i.cylinderSize}</b>\n   Full: ${i.fullStock} | Empty: ${i.emptyStock} | Price: ${formatINR(i.pricePerUnit)}`
  );

  await sendMessage(
    chatId,
    `📦 <b>Inventory</b>\n\n${lines.join("\n\n")}`,
    inlineKeyboard([
      ...inventory.map((i) => [
        { text: `✏️ Edit ${i.cylinderSize}`, callback_data: `inv_edit_${i.cylinderSize}` },
      ]),
      [{ text: "🏠 Main Menu", callback_data: "main_menu" }],
    ])
  );
}

async function handleInventoryEdit(chatId: number, messageId: number) {
  const inventory = await Inventory.find({}).sort({ cylinderSize: 1 }).lean();
  const lines = inventory.map(
    (i) =>
      `📦 <b>${i.cylinderSize}</b>\n   Full: ${i.fullStock} | Empty: ${i.emptyStock} | Price: ${formatINR(i.pricePerUnit)}`
  );

  await editMessage(
    chatId,
    messageId,
    `📦 <b>Inventory</b>\n\n${lines.join("\n\n")}`,
    inlineKeyboard([
      ...inventory.map((i) => [
        { text: `✏️ Edit ${i.cylinderSize}`, callback_data: `inv_edit_${i.cylinderSize}` },
      ]),
      [{ text: "🏠 Main Menu", callback_data: "main_menu" }],
    ])
  );
}

async function handleStaffList(chatId: number) {
  const staff = await Staff.find({ isActive: true }).sort({ name: 1 }).lean();

  if (staff.length === 0) {
    await sendMessage(
      chatId,
      "👥 <b>Staff</b>\n\nNo staff members yet.",
      inlineKeyboard([
        [{ text: "➕ Add Staff", callback_data: "add_staff" }],
        [{ text: "🏠 Main Menu", callback_data: "main_menu" }],
      ])
    );
    return;
  }

  const lines = staff.map(
    (s, i) =>
      `${i + 1}. <b>${s.name}</b>${s.debtBalance > 0 ? ` — ⚠️ Debt: ${formatINR(s.debtBalance)}` : " — ✅ No debt"}`
  );

  await sendMessage(
    chatId,
    `👥 <b>Staff</b> (${staff.length})\n\n${lines.join("\n")}`,
    inlineKeyboard([
      ...staff.map((s) => [
        { text: `👤 ${s.name}`, callback_data: `staff_detail_${s._id}` },
      ]),
      [{ text: "➕ Add Staff", callback_data: "add_staff" }],
      [{ text: "🏠 Main Menu", callback_data: "main_menu" }],
    ])
  );
}

async function handleStaffListEdit(chatId: number, messageId: number) {
  const staff = await Staff.find({ isActive: true }).sort({ name: 1 }).lean();

  if (staff.length === 0) {
    await editMessage(
      chatId,
      messageId,
      "👥 <b>Staff</b>\n\nNo staff members yet.",
      inlineKeyboard([
        [{ text: "➕ Add Staff", callback_data: "add_staff" }],
        [{ text: "🏠 Main Menu", callback_data: "main_menu" }],
      ])
    );
    return;
  }

  const lines = staff.map(
    (s, i) =>
      `${i + 1}. <b>${s.name}</b>${s.debtBalance > 0 ? ` — ⚠️ Debt: ${formatINR(s.debtBalance)}` : " — ✅ No debt"}`
  );

  await editMessage(
    chatId,
    messageId,
    `👥 <b>Staff</b> (${staff.length})\n\n${lines.join("\n")}`,
    inlineKeyboard([
      ...staff.map((s) => [
        { text: `👤 ${s.name}`, callback_data: `staff_detail_${s._id}` },
      ]),
      [{ text: "➕ Add Staff", callback_data: "add_staff" }],
      [{ text: "🏠 Main Menu", callback_data: "main_menu" }],
    ])
  );
}

async function handleStaffDetailEdit(
  chatId: number,
  messageId: number,
  staffId: string
) {
  const staff = await Staff.findById(staffId).lean();
  if (!staff) {
    await editMessage(chatId, messageId, "Staff not found.");
    return;
  }

  const recentSettlements = await Settlement.find({ staff: staffId })
    .sort({ date: -1 })
    .limit(3)
    .lean();

  const settlementLines = recentSettlements.length
    ? recentSettlements
        .map((s) => {
          const n = normalizeSettlement(s as unknown as Record<string, unknown>);
          const pending = (n.amountPending as number) || 0;
          return `  ${formatDateShort(s.date)} — Revenue: ${formatINR(s.grossRevenue)}${pending > 0 ? ` ⚠️ Pending: ${formatINR(pending)}` : ""}`;
        })
        .join("\n")
    : "  No settlements yet";

  const msg = [
    `👤 <b>${staff.name}</b>`,
    ``,
    `📞 Phone: ${staff.phone || "Not set"}`,
    `📍 Address: ${staff.address || "Not set"}`,
    `💰 Debt: <b>${staff.debtBalance > 0 ? `⚠️ ${formatINR(staff.debtBalance)}` : "✅ ₹0"}</b>`,
    ``,
    `📋 <b>Recent Settlements:</b>`,
    settlementLines,
  ].join("\n");

  const buttons: { text: string; callback_data: string }[][] = [
    [{ text: "📋 Full Ledger", callback_data: `staff_ledger_${staffId}` }],
  ];

  if (staff.debtBalance > 0) {
    buttons.push([{ text: "💰 Pay Debt", callback_data: `debt_pay_${staffId}` }]);
  }

  buttons.push(
    [{ text: "👥 Back to Staff", callback_data: "staff_list" }],
    [{ text: "🏠 Main Menu", callback_data: "main_menu" }]
  );

  await editMessage(chatId, messageId, msg, inlineKeyboard(buttons));
}

async function handleStaffLedgerEdit(
  chatId: number,
  messageId: number,
  staffId: string
) {
  const staff = await Staff.findById(staffId).lean();
  if (!staff) return;

  const settlements = await Settlement.find({ staff: staffId })
    .sort({ date: -1 })
    .limit(10)
    .lean();

  const totalRevenue = settlements.reduce((a, s) => a + s.grossRevenue, 0);
  const totalAmountPending = settlements.reduce((a, s) => {
    const n = normalizeSettlement(s as unknown as Record<string, unknown>);
    return a + ((n.amountPending as number) || 0);
  }, 0);

  const lines = settlements.map((s) => {
    const n = normalizeSettlement(s as unknown as Record<string, unknown>);
    const pending = (n.amountPending as number) || 0;
    const cylinders = s.items
      .map((i: { quantity: number; cylinderSize: string }) => `${i.quantity}×${i.cylinderSize}`)
      .join(", ");
    return `${formatDateShort(s.date)} | ${cylinders} | ${formatINR(s.grossRevenue)}${pending > 0 ? ` | ⚠️${formatINR(pending)}` : ""}`;
  });

  const msg = [
    `📋 <b>Ledger: ${staff.name}</b>`,
    ``,
    `💰 Total Revenue: ${formatINR(totalRevenue)}`,
    `⚠️ Total Pending: ${formatINR(totalAmountPending)}`,
    `🔴 Current Debt: ${formatINR(staff.debtBalance)}`,
    ``,
    `<b>Last ${settlements.length} Settlements:</b>`,
    lines.length ? lines.join("\n") : "No settlements",
  ].join("\n");

  await editMessage(
    chatId,
    messageId,
    msg,
    inlineKeyboard([
      [{ text: `👤 ${staff.name}`, callback_data: `staff_detail_${staffId}` }],
      [{ text: "👥 Staff List", callback_data: "staff_list" }],
      [{ text: "🏠 Main Menu", callback_data: "main_menu" }],
    ])
  );
}

async function handleNewSettlementStart(chatId: number, messageId: number) {
  const staff = await Staff.find({ isActive: true }).sort({ name: 1 }).lean();

  if (staff.length === 0) {
    await editMessage(
      chatId,
      messageId,
      "⚠️ No staff members found. Add staff first.",
      inlineKeyboard([
        [{ text: "➕ Add Staff", callback_data: "add_staff" }],
        [{ text: "🏠 Main Menu", callback_data: "main_menu" }],
      ])
    );
    return;
  }

  await editMessage(
    chatId,
    messageId,
    "📝 <b>New Settlement</b>\n\nSelect staff member:",
    inlineKeyboard([
      ...staff.map((s) => [
        { text: `👤 ${s.name}`, callback_data: `settle_staff_${s._id}` },
      ]),
      [{ text: "❌ Cancel", callback_data: "main_menu" }],
    ])
  );
}

async function handleSettleCylinderSelect(chatId: number) {
  const session = await getSession(chatId);
  if (!session) return;

  const items = session.data.items as { cylinderSize: string; quantity: number; isNewConnection?: boolean }[];
  const inventory = await Inventory.find({}).sort({ cylinderSize: 1 }).lean();

  const currentItems = items.length
    ? `\n\n📦 Added so far:\n${items.map((i) => `  ${i.quantity}× ${i.cylinderSize}${i.isNewConnection ? " (DBC)" : ""}`).join("\n")}`
    : "";

  await sendMessage(
    chatId,
    `📝 Settlement for <b>${session.data.staffName}</b>\n\nSelect cylinder to add:${currentItems}`,
    inlineKeyboard([
      ...inventory.map((i) => [
        {
          text: `${i.cylinderSize} — ${formatINR(i.pricePerUnit)} (${i.fullStock} avail)`,
          callback_data: `settle_cyl_${i.cylinderSize}`,
        },
      ]),
      [{ text: "✅ Done Adding", callback_data: "settle_done_cylinders" }],
      [{ text: "❌ Cancel", callback_data: "settle_cancel" }],
    ])
  );
}

async function handleSettleConfirm(chatId: number) {
  const session = await getSession(chatId);
  if (!session) return;

  const sessionData = session.data;
  const staffId = sessionData.staffId as string;
  const items = sessionData.items as { cylinderSize: string; quantity: number; isNewConnection?: boolean }[];
  const date = sessionData.date as string | undefined;
  const notes = sessionData.notes as string | undefined;
  const denominations = sessionData.denominations as { note: number; count: number; total: number }[] | undefined;
  const denominationTotal = sessionData.denominationTotal as number | undefined;
  const resolvedPrices = sessionData.resolvedPrices as Record<string, number> | undefined;

  try {
    let resultGrossRevenue = 0;
    let resultAmountPending = 0;
    let resultActualCash = 0;

    await withTransaction(async (txSession) => {
      // Build V3 settlement items with prices and DBC
      const processedItems = [];
      for (const item of items) {
        const price = resolvedPrices?.[item.cylinderSize];
        let pricePerUnit: number;

        const inv = await Inventory.findOne({ cylinderSize: item.cylinderSize }).session(txSession);
        if (!inv) continue;
        if (inv.fullStock < item.quantity) {
          throw new Error(`Insufficient stock for ${item.cylinderSize}: available ${inv.fullStock}, requested ${item.quantity}`);
        }
        pricePerUnit = price !== undefined ? price : inv.pricePerUnit;

        processedItems.push({
          cylinderSize: item.cylinderSize,
          quantity: item.quantity,
          pricePerUnit,
          total: item.quantity * pricePerUnit,
          isNewConnection: item.isNewConnection || false,
        });

        await Inventory.findOneAndUpdate(
          { cylinderSize: item.cylinderSize },
          { $inc: { fullStock: -item.quantity, emptyStock: item.quantity } },
          { session: txSession }
        );
      }

      const transactions = (sessionData.transactions as { type: string; category: string; amount: number }[]) || [];
      const actualCashReceived = (sessionData.actualCashReceived as number) || (sessionData.actualCash as number) || 0;
      const emptyCylindersReturned = (sessionData.emptyCylindersReturned as { cylinderSize: string; quantity: number }[]) || [];

      const computed = computeSettlement(
        processedItems,
        transactions.map(t => ({ type: t.type as "credit" | "debit", category: t.category, amount: t.amount })),
        actualCashReceived
      );

      resultGrossRevenue = computed.grossRevenue;
      resultAmountPending = computed.amountPending;
      resultActualCash = actualCashReceived;

      await Settlement.create(
        [
          {
            staff: staffId,
            date: date ? new Date(date) : new Date(),
            items: processedItems,
            grossRevenue: computed.grossRevenue,
            transactions: transactions,
            totalCredits: computed.totalCredits,
            totalDebits: computed.totalDebits,
            netRevenue: computed.netRevenue,
            actualCashReceived,
            amountPending: computed.amountPending,
            emptyCylindersReturned,
            notes: notes || "",
            denominations: denominations || [],
            denominationTotal: denominationTotal || 0,
            schemaVersion: 3,
            // Legacy fields for backward compat
            addPayment: computed.addPayment,
            reducePayment: computed.reducePayment,
            expenses: computed.expenses,
            expectedCash: computed.expectedCash,
            actualCash: actualCashReceived,
            shortage: computed.shortage,
            createdBy: TELEGRAM_BOT_USER_ID || undefined,
          },
        ],
        { session: txSession }
      );

      // Update staff debt
      if (computed.amountPending > 0) {
        await Staff.findByIdAndUpdate(staffId, { $inc: { debtBalance: computed.amountPending } }, { session: txSession });
      }
    });

    await clearSession(chatId);

    await sendMessage(
      chatId,
      `✅ <b>Settlement Created!</b>\n\n💰 Revenue: ${formatINR(resultGrossRevenue)}\n💵 Cash: ${formatINR(resultActualCash)}${resultAmountPending > 0 ? `\n⚠️ Pending: ${formatINR(resultAmountPending)} added to debt` : "\n✅ No pending amount"}`,
      inlineKeyboard([
        [{ text: "📝 New Settlement", callback_data: "new_settlement" }],
        [{ text: "📊 Dashboard", callback_data: "dashboard" }],
        [{ text: "🏠 Main Menu", callback_data: "main_menu" }],
      ])
    );
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    await sendMessage(
      chatId,
      `❌ <b>Settlement Failed</b>\n\n${errMsg}\n\nPlease try again.`,
      mainMenuKeyboard()
    );
  }
}

// ─── OCR / PHOTO HANDLERS ───────────────────────────────────

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";

async function handlePhotoMessage(
  chatId: number,
  photo: { file_id: string; file_size?: number }[]
) {
  // Use the largest resolution (last element)
  const fileId = photo[photo.length - 1].file_id;

  await sendMessage(chatId, "🔍 Reading payment screenshot...");

  try {
    // Get file path from Telegram
    const fileRes = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`
    );
    const fileData = await fileRes.json();
    const filePath = fileData.result?.file_path;

    if (!filePath) {
      await sendMessage(chatId, "⚠️ Could not download the image. Please try again.");
      return;
    }

    // Download the image
    const imageRes = await fetch(
      `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`
    );

    // Validate image download
    if (!imageRes.ok) {
      await sendMessage(chatId, "⚠️ Could not download the image. Please try again.");
      return;
    }

    const contentType = imageRes.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
      await sendMessage(chatId, "⚠️ The file does not appear to be an image. Please send a screenshot.");
      return;
    }

    const imageBuffer = Buffer.from(await imageRes.arrayBuffer());

    // Run OCR
    const result = await parseUPIScreenshot(imageBuffer, contentType);

    if (!result) {
      await sendMessage(
        chatId,
        "❌ Could not read a UPI payment from this image. Please send a clear UPI payment screenshot.",
        mainMenuKeyboard()
      );
      return;
    }

    // Reject failed transactions
    if (result.status === "failed") {
      await sendMessage(
        chatId,
        "❌ This appears to be a <b>failed</b> UPI transaction. Only successful payments can be applied to settlements.",
        mainMenuKeyboard()
      );
      return;
    }

    const msg = [
      `📸 <b>Payment Detected:</b>`,
      ``,
      `💰 Amount: <b>${formatINR(result.amount)}</b>`,
      `✅ Status: ${result.status}`,
      `🔢 TxnID: <code>${result.transaction_id}</code>`,
      `📅 Date: ${result.date}`,
      `👤 From: ${result.sender_name}`,
      `👤 To: ${result.receiver_name}`,
    ].join("\n");

    await sendMessage(
      chatId,
      msg,
      inlineKeyboard([
        [
          { text: "✅ Apply to Settlement", callback_data: `apply_payment_${result.amount}` },
          { text: "❌ Cancel", callback_data: "main_menu" },
        ],
      ])
    );
  } catch (error) {
    console.error("Photo message handling error:", error);
    await sendMessage(
      chatId,
      "❌ Could not read the payment screenshot. Please try a clearer image.",
      mainMenuKeyboard()
    );
  }
}

async function handleOCRApplyPayment(
  chatId: number,
  messageId: number,
  amount: number
) {
  const staff = await Staff.find({ isActive: true }).sort({ name: 1 }).lean();

  if (staff.length === 0) {
    await editMessage(
      chatId,
      messageId,
      "⚠️ No staff members found. Add staff first.",
      inlineKeyboard([
        [{ text: "➕ Add Staff", callback_data: "add_staff" }],
        [{ text: "🏠 Main Menu", callback_data: "main_menu" }],
      ])
    );
    return;
  }

  await editMessage(
    chatId,
    messageId,
    `📝 <b>Apply Payment: ${formatINR(amount)}</b>\n\nSelect staff member:`,
    inlineKeyboard([
      ...staff.map((s) => [
        { text: `👤 ${s.name}`, callback_data: `ocr_staff_${s._id}_${amount}` },
      ]),
      [{ text: "❌ Cancel", callback_data: "main_menu" }],
    ])
  );
}

async function handleOCRStaffSelected(chatId: number, staffId: string, amount: number) {
  const staff = await Staff.findById(staffId).lean();
  if (!staff) return;

  await setSession(chatId, {
    step: "settle_date",
    data: { staffId, staffName: staff.name, items: [], actualCashReceived: amount, isOCR: true },
  });

  await sendMessage(chatId, `📅 Enter settlement <b>date</b> (DD/MM/YYYY) or type <b>today</b>:`);
}

async function showTransactionsMenu(chatId: number, session: { step: string; data: Record<string, unknown> }) {
  const transactions = (session.data.transactions as { type: string; category: string; amount: number }[]) || [];
  const totalCredits = transactions.filter(t => t.type === "credit").reduce((a, t) => a + t.amount, 0);
  const totalDebits = transactions.filter(t => t.type === "debit").reduce((a, t) => a + t.amount, 0);

  let txSummary = "";
  if (transactions.length > 0) {
    txSummary = "\n\n📊 <b>Transactions so far:</b>\n" +
      transactions.map(t => `  ${t.type === "credit" ? "➕" : "➖"} ${t.category}: ${formatINR(t.amount)}`).join("\n") +
      `\n\nTotal Credits: ${formatINR(totalCredits)} | Total Debits: ${formatINR(totalDebits)}`;
  }

  await sendMessage(
    chatId,
    `💰 <b>Add Transactions</b>${txSummary}\n\nAdd credits (payments received) or debits (expenses/discounts):`,
    inlineKeyboard([
      [
        { text: "➕ Add Credit", callback_data: "settle_tx_credit" },
        { text: "➖ Add Debit", callback_data: "settle_tx_debit" },
      ],
      [{ text: "✅ Done", callback_data: "settle_tx_done" }],
    ])
  );
}

// ─── ATTENDANCE HANDLERS ────────────────────────────────────

async function handleAttendanceEdit(chatId: number, messageId: number) {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(now.getTime() + istOffset);
  const istDateStr = istNow.toISOString().split("T")[0];
  const today = new Date(istDateStr + "T00:00:00.000+05:30");
  const endOfDay = new Date(istDateStr + "T23:59:59.999+05:30");

  const [staff, attendance] = await Promise.all([
    Staff.find({ isActive: true }).sort({ name: 1 }).lean(),
    Attendance.find({ date: { $gte: today, $lte: endOfDay } }).lean(),
  ]);

  if (staff.length === 0) {
    await editMessage(chatId, messageId, "📅 <b>Attendance</b>\n\nNo staff members.", mainMenuKeyboard());
    return;
  }

  const attendanceMap = new Map<string, string>();
  for (const a of attendance) {
    attendanceMap.set(a.staff.toString(), a.status);
  }

  const present = staff.filter(s => attendanceMap.get(s._id.toString()) === "present").length;
  const absent = staff.filter(s => attendanceMap.get(s._id.toString()) === "absent").length;
  const halfDay = staff.filter(s => attendanceMap.get(s._id.toString()) === "half-day").length;
  const unmarked = staff.length - present - absent - halfDay;

  const lines = staff.map(s => {
    const status = attendanceMap.get(s._id.toString());
    const emoji = status === "present" ? "✅" : status === "absent" ? "❌" : status === "half-day" ? "🟡" : "⬜";
    return `${emoji} ${s.name}`;
  });

  const msg = [
    `📅 <b>Attendance</b> — ${formatDateShort(new Date())}`,
    ``,
    `✅ ${present} Present | ❌ ${absent} Absent | 🟡 ${halfDay} Half-day | ⬜ ${unmarked} Unmarked`,
    ``,
    ...lines,
  ].join("\n");

  const buttons: { text: string; callback_data: string }[][] = [];
  for (const s of staff) {
    const currentStatus = attendanceMap.get(s._id.toString());
    buttons.push([
      { text: `${currentStatus === "present" ? "✅" : ""} ${s.name} P`, callback_data: `att_mark_${s._id}_present` },
      { text: `${currentStatus === "absent" ? "❌" : ""} A`, callback_data: `att_mark_${s._id}_absent` },
      { text: `${currentStatus === "half-day" ? "🟡" : ""} H`, callback_data: `att_mark_${s._id}_half-day` },
    ]);
  }
  buttons.push([{ text: "✅ Mark All Present", callback_data: "att_all_present" }]);
  buttons.push([{ text: "🔄 Refresh", callback_data: "attendance" }]);
  buttons.push([{ text: "🏠 Main Menu", callback_data: "main_menu" }]);

  await editMessage(chatId, messageId, msg, inlineKeyboard(buttons));
}

async function handleAttendanceMark(chatId: number, messageId: number, staffId: string, status: string) {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(now.getTime() + istOffset);
  const istDateStr = istNow.toISOString().split("T")[0];
  const today = new Date(istDateStr + "T00:00:00.000+05:30");

  await Attendance.findOneAndUpdate(
    { staff: staffId, date: today },
    { status, markedBy: "telegram" },
    { upsert: true }
  );

  // Refresh the attendance view
  await handleAttendanceEdit(chatId, messageId);
}

async function handleAttendanceAllPresent(chatId: number, messageId: number) {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(now.getTime() + istOffset);
  const istDateStr = istNow.toISOString().split("T")[0];
  const today = new Date(istDateStr + "T00:00:00.000+05:30");

  const staff = await Staff.find({ isActive: true }).lean();

  const bulkOps = staff.map(s => ({
    updateOne: {
      filter: { staff: s._id, date: today },
      update: { status: "present", markedBy: "telegram" },
      upsert: true,
    },
  }));

  if (bulkOps.length > 0) {
    await Attendance.bulkWrite(bulkOps);
  }

  await handleAttendanceEdit(chatId, messageId);
}

async function handleRecentSettlementsEdit(chatId: number, messageId: number) {
  const settlements = await Settlement.find({})
    .populate("staff", "name")
    .sort({ date: -1 })
    .limit(5)
    .lean();

  if (settlements.length === 0) {
    await editMessage(
      chatId,
      messageId,
      "📋 <b>Recent Settlements</b>\n\nNo settlements yet.",
      inlineKeyboard([
        [{ text: "📝 New Settlement", callback_data: "new_settlement" }],
        [{ text: "🏠 Main Menu", callback_data: "main_menu" }],
      ])
    );
    return;
  }

  const lines = settlements.map((s) => {
    const staffName = (s.staff as unknown as { name: string })?.name || "Unknown";
    const cylinders = s.items
      .map((i: { quantity: number; cylinderSize: string }) => `${i.quantity}×${i.cylinderSize}`)
      .join(", ");
    const pending = (normalizeSettlement(s as unknown as Record<string, unknown>).amountPending as number) || 0;
    return [
      `📅 ${formatDateShort(s.date)} — <b>${staffName}</b>`,
      `   📦 ${cylinders} | 💰 ${formatINR(s.grossRevenue)}${pending > 0 ? ` | ⚠️ ${formatINR(pending)}` : ""}`,
    ].join("\n");
  });

  await editMessage(
    chatId,
    messageId,
    `📋 <b>Recent Settlements</b>\n\n${lines.join("\n\n")}`,
    inlineKeyboard([
      [{ text: "📝 New Settlement", callback_data: "new_settlement" }],
      [{ text: "🔄 Refresh", callback_data: "recent_settlements" }],
      [{ text: "🏠 Main Menu", callback_data: "main_menu" }],
    ])
  );
}
