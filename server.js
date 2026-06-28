require("dotenv").config();
const express = require("express");
const { Pool } = require("pg");
const cors = require("cors");
const { google } = require("googleapis");

const app = express();

// === API Key 設定 ===
const API_KEY = process.env.API_KEY;

// === CORS 設定 ===
const corsOptions = {
  origin: ["http://127.0.0.1:5501", "http://localhost:5501", "https://devline2025.github.io"],
  methods: ["GET", "POST", "OPTIONS"],
};
app.use(cors(corsOptions));

app.use(express.json());

// === Middleware：檢查 API Key ===
app.use((req, res, next) => {
  if (req.method === "OPTIONS") return next(); // 預檢請求直接放行
  const apiKey = req.headers["x-api-key"];
  if (apiKey !== API_KEY) {
    return res.status(403).json({ error: "Forbidden: Invalid API key" });
  }
  next();
});

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
app.post("/answers", async (req, res) => {
  const { user_id, session_id, question_id, selected_option, is_correct } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO quiz_answers (user_id, session_id, question_id, selected_option, is_correct, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *`,
      [user_id, session_id, question_id, selected_option, is_correct]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).send("DB Error");
  }
});

// === 讀取所有答題紀錄 ===
app.get("/answers", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM quiz_answers ORDER BY id DESC");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send("DB Error");
  }
});

// === 領取禮卷 (Google Sheets) ===
app.post("/getVoucher", async (req, res) => {
  const { user_id } = req.body; // 使用測驗前的編號
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
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
