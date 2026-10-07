import express from "express";
import { Pool } from "pg";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()"
  );
  next();
});

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  crypto.randomBytes(32).toString("hex");

const USER_COOKIE = "chikam_session";
const ADMIN_COOKIE = "chikam_admin";

const USER_SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const ADMIN_SESSION_MS = 4 * 60 * 60 * 1000;

function safeEqual(a, b) {
  const aa = Buffer.from(String(a || ""));
  const bb = Buffer.from(String(b || ""));

  if (aa.length !== bb.length) return false;

  return crypto.timingSafeEqual(aa, bb);
}

function signToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");

  const signature = crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(body)
    .digest("base64url");

  return body + "." + signature;
}

function verifyToken(token) {
  try {
    if (!token) return null;

    const parts = String(token).split(".");

    if (parts.length !== 2) return null;

    const expected = crypto
      .createHmac("sha256", SESSION_SECRET)
      .update(parts[0])
      .digest("base64url");

    if (!safeEqual(parts[1], expected)) return null;

    const payload = JSON.parse(
      Buffer.from(parts[0], "base64url").toString("utf8")
    );

    if (!payload.exp || Date.now() > payload.exp) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  const cookies = {};

  for (const part of header.split(";")) {
    const index = part.indexOf("=");

    if (index < 0) continue;

    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();

    cookies[key] = decodeURIComponent(value);
  }

  return cookies;
}

function setCookie(res, name, value, maxAge, sameSite = "Lax") {
  res.setHeader(
    "Set-Cookie",
    `${name}=${encodeURIComponent(
      value
    )}; Max-Age=${Math.floor(
      maxAge / 1000
    )}; Path=/; HttpOnly; Secure; SameSite=${sameSite}`
  );
}

function clearCookie(res, name, sameSite = "Lax") {
  res.setHeader(
    "Set-Cookie",
    `${name}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=${sameSite}`
  );
}

function getSession(req) {
  const cookies = parseCookies(req);

  const payload = verifyToken(cookies[USER_COOKIE]);

  if (!payload || !payload.userId) {
    return null;
  }

  return payload;
}

function getAdminSession(req) {
  const cookies = parseCookies(req);

  const payload = verifyToken(cookies[ADMIN_COOKIE]);

  if (!payload || payload.admin !== true) {
    return null;
  }

  return payload;
}

function requireAdmin(req, res, next) {
  if (!getAdminSession(req)) {
    return res.status(401).json({
      ok: false,
      message: "دسترسی مدیر لازم است."
    });
  }

  next();
}

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* =========================
   DATABASE
========================= */

async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(100) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      phone VARCHAR(30) UNIQUE,
      email VARCHAR(255) UNIQUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ideas (
      id SERIAL PRIMARY KEY,
      title VARCHAR(200) NOT NULL,
      description TEXT,
      solution TEXT,
      category VARCHAR(100),
      participation_type VARCHAR(100),
      username VARCHAR(100),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ads (
      id SERIAL PRIMARY KEY,
      title VARCHAR(200) NOT NULL,
      description TEXT,
      username VARCHAR(100),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    ALTER TABLE ideas
      ADD COLUMN IF NOT EXISTS username VARCHAR(100);

    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS email VARCHAR(255);

    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS phone VARCHAR(30);

    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS password_hash TEXT;
  `);
}

/* =========================
   HEALTH / DATABASE TEST
========================= */

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "CHIKAM",
    time: new Date().toISOString()
  });
});

app.get("/db-test", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW() AS now");

    res.json({
      ok: true,
      database: "connected",
      now: result.rows[0].now
    });
  } catch (error) {
    console.error("DB TEST ERROR:", error);

    res.status(500).json({
      ok: false,
      message: "خطا در اتصال پایگاه داده."
    });
  }
});

/* =========================
   REGISTER
========================= */

app.post("/register", async (req, res) => {
  try {
    const username = String(req.body.username || "").trim();
    const password = String(req.body.password || "");
    const confirmPassword = String(
      req.body.confirmPassword || ""
    );

    const phone =
      String(req.body.phone || "").trim() || null;

    const email =
      String(req.body.email || "")
        .trim()
        .toLowerCase() || null;

    if (!username || username.length < 3) {
      return res.status(400).json({
        ok: false,
        message: "نام کاربری حداقل ۳ کاراکتر باشد."
      });
    }

    if (username.length > 100) {
      return res.status(400).json({
        ok: false,
        message: "نام کاربری بیش از حد طولانی است."
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        ok: false,
        message: "رمز عبور حداقل ۶ کاراکتر باشد."
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({
        ok: false,
        message: "تکرار رمز عبور یکسان نیست."
      });
    }

    const duplicate = await pool.query(
      `SELECT username, phone, email
       FROM users
       WHERE username = $1
          OR ($2::text IS NOT NULL AND phone = $2)
          OR ($3::text IS NOT NULL AND email = $3)
       LIMIT 1`,
      [username, phone, email]
    );

    if (duplicate.rows.length) {
      const row = duplicate.rows[0];

      if (row.username === username) {
        return res.status(409).json({
          ok: false,
          message: "این نام کاربری قبلاً ثبت شده است."
        });
      }

      if (phone && row.phone === phone) {
        return res.status(409).json({
          ok: false,
          message: "این شماره تلفن قبلاً استفاده شده است."
        });
      }

      if (email && row.email === email) {
        return res.status(409).json({
          ok: false,
          message: "این ایمیل قبلاً استفاده شده است."
        });
      }
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `INSERT INTO users
        (username, password_hash, phone, email)
       VALUES
        ($1, $2, $3, $4)
       RETURNING
        id, username, phone, email, created_at`,
      [
        username,
        passwordHash,
        phone,
        email
      ]
    );

    res.status(201).json({
      ok: true,
      message: "حساب با موفقیت ایجاد شد.",
      user: result.rows[0]
    });
  } catch (error) {
    console.error("REGISTER ERROR:", error);

    res.status(500).json({
      ok: false,
      message: "خطا در ایجاد حساب."
    });
  }
});

/* =========================
   LOGIN
========================= */

app.post("/login", async (req, res) => {
  try {
    const username = String(
      req.body.username || ""
    ).trim();

    const password = String(
      req.body.password || ""
    );

    if (!username || !password) {
      return res.status(400).json({
        ok: false,
        message: "نام کاربری و رمز عبور را وارد کنید."
      });
    }

    const result = await pool.query(
      `SELECT id, username, password_hash
       FROM users
       WHERE username = $1
       LIMIT 1`,
      [username]
    );

    if (!result.rows.length) {
      return res.status(401).json({
        ok: false,
        message: "نام کاربری یا رمز عبور اشتباه است."
      });
    }

    const user = result.rows[0];

    const valid = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!valid) {
      return res.status(401).json({
        ok: false,
        message: "نام کاربری یا رمز عبور اشتباه است."
      });
    }

    const token = signToken({
      userId: user.id,
      username: user.username,
      exp: Date.now() + USER_SESSION_MS
    });

    setCookie(
      res,
      USER_COOKIE,
      token,
      USER_SESSION_MS,
      "Lax"
    );

    res.json({
      ok: true,
      message: "ورود با موفقیت انجام شد.",
      username: user.username
    });
  } catch (error) {
    console.error("LOGIN ERROR:", error);

    res.status(500).json({
      ok: false,
      message: "خطا در ورود."
    });
  }
});

/* =========================
   CURRENT USER
========================= */

app.get("/me", async (req, res) => {
  try {
    const session = getSession(req);

    if (!session) {
      return res.json({
        loggedIn: false
      });
    }

    const result = await pool.query(
      `SELECT id, username, phone, email
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [session.userId]
    );

    if (!result.rows.length) {
      clearCookie(
        res,
        USER_COOKIE,
        "Lax"
      );

      return res.json({
        loggedIn: false
      });
    }

    res.json({
      loggedIn: true,
      user: result.rows[0],
      username: result.rows[0].username
    });
  } catch (error) {
    console.error("ME ERROR:", error);

    res.status(500).json({
      ok: false,
      message: "خطا در بررسی حساب."
    });
  }
});

/* =========================
   USER LOGOUT
========================= */

app.post("/logout", (req, res) => {
  clearCookie(
    res,
    USER_COOKIE,
    "Lax"
  );

  res.json({
    ok: true,
    message: "خروج انجام شد."
  });
});

/* =========================
   IDEAS
========================= */

app.post("/ideas", async (req, res) => {
  try {
    const session = getSession(req);

    const title = String(
      req.body.title || ""
    ).trim();

    const description = String(
      req.body.description || ""
    ).trim();

    const solution = String(
      req.body.solution || ""
    ).trim();

    const category = String(
      req.body.category || ""
    ).trim();

    const participationType = String(
      req.body.participationType || ""
    ).trim();

    if (!title) {
      return res.status(400).json({
        ok: false,
        message: "عنوان
