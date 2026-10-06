import express from "express";
import pg from "pg";
import bcrypt from "bcryptjs";

const { Pool } = pg;

const app = express();
const PORT = process.env.PORT || 8080;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// =========================
// DATABASE TEST
// =========================

app.get("/db-test", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");

    res.json({
      message: "اتصال به PostgreSQL موفق است",
      time: result.rows[0].now
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "خطا در اتصال به PostgreSQL",
      error: error.message
    });
  }
});

// =========================
// REGISTER
// =========================

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

    const existingUser = await pool.query(
      "SELECT id FROM users WHERE username = $1",
      [username]
    );

    if (existingUser.rows.length > 0) {
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
    console.error(error);

    res.status(500).json({
      message: "خطا در ثبت‌نام",
      error: error.message
    });
  }
});

// =========================
// LOGIN
// =========================

app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        message: "نام کاربری و رمز عبور را وارد کنید"
      });
    }

    const result = await pool.query(
      "SELECT * FROM users WHERE username = $1",
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        message: "نام کاربری یا رمز عبور اشتباه است"
      });
    }

    const user = result.rows[0];

    const passwordMatch = await bcrypt.compare(
      password,
      user.password
    );

    if (!passwordMatch) {
      return res.status(401).json({
        message: "نام کاربری یا رمز عبور اشتباه است"
      });
    }

    res.json({
      message: "ورود موفق بود",
      user: {
        id: user.id,
        username: user.username
      }
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "خطا در ورود",
      error: error.message
    });
  }
});

// =========================
// CREATE IDEA
// =========================

app.post("/ideas", async (req, res) => {
  try {
    const {
      title,
      description,
      solution,
      category,
      participation_type
    } = req.body;

    if (!title || !description) {
      return res.status(400).json({
        message: "عنوان و شرح ایده الزامی است"
      });
    }

    const result = await pool.query(
      `INSERT INTO ideas
      (title, description, solution, category, participation_type, status, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, CURRENT_DATE)
      RETURNING *`,
      [
        title,
        description,
        solution || null,
        category || null,
        participation_type || null,
        "open"
      ]
    );

    res.json({
      message: "ایده با موفقیت ثبت شد",
      idea: result.rows[0]
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "خطا در ثبت ایده",
      error: error.message
    });
  }
});

// =========================
// GET IDEAS
// =========================

app.get("/ideas", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM ideas ORDER BY id DESC"
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "خطا در دریافت ایده‌ها",
      error: error.message
    });
  }
});

// =========================
// HOME PAGE
// =========================

app.get("/", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="fa" dir="rtl">

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width, initial-scale=1.0"
>

<title>چیکام | ایده و مشارکت</title>

<style>

* {
  box-sizing: border-box;
}

body {
  margin
