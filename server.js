require("dotenv").config();
const crypto = require("crypto");
const express = require("express");
const { Pool } = require("pg");
const cors = require("cors");
const { google } = require("googleapis");

const app = express();
app.set("trust proxy", 1);

const ADMIN_API_KEY = process.env.ADMIN_API_KEY;
const DEFAULT_ORIGINS = [
  "http://127.0.0.1:5501",
  "http://localhost:5501",
  "https://devline2025.github.io",
];
const allowedOrigins = new Set(
  (process.env.ALLOWED_ORIGINS || DEFAULT_ORIGINS.join(","))
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean),
);
const QUIZ_IDS = new Set([
  "baby_ch2",
  "baby_ch3",
  "baby_vitamin_d_ch2",
  "baby_vitamin_d_ch3",
  "pregnant_ch2",
  "pregnant_ch3",
  "pregnant_vitamin_d_ch2",
  "pregnant_vitamin_d_ch3",
]);

// === CORS 設定 ===
const corsOptions = {
  origin(origin, callback) {
    callback(null, !origin || allowedOrigins.has(origin.replace(/\/$/, "")));
  },
  methods: ["GET", "POST", "OPTIONS"],
  // Keep x-api-key temporarily so the old frontend continues working while
  // the backend is deployed first. It is ignored and can be removed later.
  allowedHeaders: ["Content-Type", "x-admin-key", "x-api-key"],
  maxAge: 86400,
};
app.use(cors(corsOptions));
app.use(express.json({ limit: "16kb" }));

function requireAllowedOrigin(req, res, next) {
  const origin = req.get("origin")?.replace(/\/$/, "");
  if (!origin || !allowedOrigins.has(origin)) {
    return res.status(403).json({ error: "Origin not allowed" });
  }
  next();
}

function requireAdmin(req, res, next) {
  const suppliedKey = req.get("x-admin-key") || "";
  if (!ADMIN_API_KEY || suppliedKey.length !== ADMIN_API_KEY.length) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const valid = crypto.timingSafeEqual(Buffer.from(suppliedKey), Buffer.from(ADMIN_API_KEY));
  if (!valid) return res.status(403).json({ error: "Forbidden" });
  next();
}

function createRateLimiter({ windowMs, max }) {
  const clients = new Map();
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, value] of clients) {
      if (value.resetAt <= now) clients.delete(key);
    }
  }, windowMs);
  cleanup.unref();

  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip;
    let state = clients.get(key);
    if (!state || state.resetAt <= now) {
      state = { count: 0, resetAt: now + windowMs };
      clients.set(key, state);
    }
    state.count += 1;

    res.set("RateLimit-Limit", String(max));
    res.set("RateLimit-Remaining", String(Math.max(0, max - state.count)));
    res.set("RateLimit-Reset", String(Math.ceil(state.resetAt / 1000)));
    if (state.count > max) {
      res.set("Retry-After", String(Math.ceil((state.resetAt - now) / 1000)));
      return res.status(429).json({ error: "Too many requests" });
    }
    next();
  };
}

const answerRateLimit = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 100 });

function validateAnswer(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const answer = {
    user_id: typeof body.user_id === "string" ? body.user_id.trim() : "",
    session_id: typeof body.session_id === "string" ? body.session_id.trim() : "",
    question_id: typeof body.question_id === "string" ? body.question_id.trim() : "",
    selected_option: typeof body.selected_option === "string" ? body.selected_option.trim() : "",
    is_correct: body.is_correct,
    quiz_id: typeof body.quiz_id === "string" ? body.quiz_id.trim() : "",
  };

  if (!answer.user_id || answer.user_id.length > 100) return null;
  if (!/^[A-Za-z0-9-]{10,100}$/.test(answer.session_id)) return null;
  if (!/^[ka]_q[1-7]$/.test(answer.question_id)) return null;
  if (!answer.selected_option || answer.selected_option.length > 500) return null;
  if (![true, false, null].includes(answer.is_correct)) return null;
  if (!QUIZ_IDS.has(answer.quiz_id)) return null;
  return answer;
}

// === PostgreSQL 連線 (存答題紀錄) ===
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("localhost") && !process.env.DATABASE_URL.includes("127.0.0.1") ? { rejectUnauthorized: false } : false,
});

// === Google Sheets 設定 (存禮卷) ===
const SHEET_ID = process.env.SHEET_ID;  // 讀取環境變數裡的 Google Sheet ID
const RANGE = "小測驗禮卷!A:E";       // ⚠️ 假設欄位是 A-E: id, voucher_url, code, used, user_id

async function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    keyFile: "credentials.json", // ⚠️ 下載的 Service Account 金鑰檔
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const client = await auth.getClient();
  return google.sheets({ version: "v4", auth: client });
}

// === 測試 API ===
app.get("/", (req, res) => {
  res.send("Quiz backend is running 🚀");
});

// === 新增答題紀錄 ===
app.post("/answers", requireAllowedOrigin, answerRateLimit, async (req, res) => {
  const answer = validateAnswer(req.body);
  if (!answer) return res.status(400).json({ error: "Invalid answer payload" });

  const { user_id, session_id, question_id, selected_option, is_correct, quiz_id } = answer;
  try {
    await pool.query(
      `INSERT INTO quiz_answers (user_id, session_id, question_id, selected_option, is_correct, quiz_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [user_id, session_id, question_id, selected_option, is_correct, quiz_id]
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

// === 讀取所有答題紀錄 ===
app.get("/answers", requireAdmin, async (req, res) => {
  const requestedLimit = Number.parseInt(req.query.limit, 10);
  const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 500) : 100;
  try {
    const result = await pool.query("SELECT * FROM quiz_answers ORDER BY id DESC LIMIT $1", [limit]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send("DB Error");
  }
});

// === 領取禮卷 (Google Sheets) ===
app.post("/getVoucher", requireAdmin, async (req, res) => {
  const user_id = typeof req.body?.user_id === "string" ? req.body.user_id.trim() : "";
  if (!user_id || user_id.length > 100) {
    return res.status(400).json({ error: "Invalid user_id" });
  }
  const sheets = await getSheetsClient();

  try {
    // 讀取整張表
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: RANGE,
    });
    const rows = result.data.values || [];

    // 1. 檢查是否已經領過
    const existing = rows.find((row) => row[4] === user_id);
    if (existing) {
      return res.json({ url: existing[1], code: existing[2] });
    }

    // 2. 找第一個還沒用的禮卷
    const index = rows.findIndex((row) => row[3] === "FALSE");
    if (index === -1) {
      return res.json({ error: "❌ 沒有剩餘的禮卷了" });
    }

    const voucher = rows[index][1];
    const code = rows[index][2];
    const rowNumber = index + 2; // Google Sheets 從 1 開始

    // 3. 更新該列 (D=TRUE, E=user_id)
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range:`小測驗禮卷!D${rowNumber}:F${rowNumber}`, 
      valueInputOption: "RAW",
      requestBody: { values: [["TRUE", user_id, new Date().toISOString()]] },
    });

    res.json({ url: voucher, code });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "伺服器錯誤" });
  }
});

// === 啟動伺服器 ===
const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`✅ Server running at http://localhost:${PORT}`);
  });
}

module.exports = { app, validateAnswer };
