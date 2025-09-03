const express = require("express");
const { Pool } = require("pg");
const cors = require("cors");

const app = express();

// === API Key 設定 ===
const API_KEY = process.env.API_KEY || "3jnDfg4nw0wSDkb4295NBJkdwhuf378S"; // 測試先給一個固定值

// === CORS 設定 ===
const corsOptions = {
  origin: ["http://127.0.0.1:5501", "http://localhost:5501", "https://devline2025.github.io"],
  methods: ["GET", "POST", "OPTIONS"],
};
app.use(cors(corsOptions));

app.use(express.json());

// === Middleware：檢查 API Key ===
app.use((req, res, next) => {
  if (req.method === "OPTIONS") return next(); // 🔥 放行預檢請求
  const apiKey = req.headers["x-api-key"];
  if (apiKey !== API_KEY) {
    return res.status(403).json({ error: "Forbidden: Invalid API key" });
  }
  next();
});

// PostgreSQL 連線
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://huang@localhost:5432/quizdatabase",
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});


// 測試 API
app.get("/", (req, res) => {
  res.send("Quiz backend is running 🚀");
});

// 新增答題紀錄
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

// 讀取所有答題紀錄
app.get("/answers", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM quiz_answers ORDER BY id DESC");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send("DB Error");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
