import express from "express";
import pg from "pg";
import bcrypt from "bcryptjs";

const { Pool } = pg;

const app = express();
const PORT = process.env.PORT || 8080;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Database test
app.get("/db-test", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json({
      message: "اتصال به PostgreSQL موفق است",
      time: result.rows[0].now
    });
  } catch (error) {
    res.status(500).json({
      message: "خطا در اتصال به PostgreSQL",
      error: error.message
    });
  }
});

// Register
app.post("/register", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        message: "نام کاربری و رمز عبور الزامی است"
      });
    }

    if (username.length < 3) {
      return res.status(400).json({
        message: "نام کاربری باید حداقل ۳ کاراکتر باشد"
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        message: "رمز عبور باید حداقل ۶ کاراکتر باشد"
      });
    }

    const check = await pool.query(
      "SELECT id FROM users WHERE username = $1",
      [username]
    );

    if (check.rows.length > 0) {
      return res.status(409).json({
        message: "این نام کاربری قبلاً ثبت شده است"
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await pool.query(
      "INSERT INTO users (username, password) VALUES ($1, $2)",
      [username, hashedPassword]
    );

    res.json({
      message: "ثبت‌نام با موفقیت انجام شد"
    });
  } catch (error) {
    res.status(
