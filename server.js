import express from "express";
import { Pool } from "pg";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const app = express();
const PORT = Number(process.env.PORT || 8080);

app.disable("x-powered-by");

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

/* =========================
   ENVIRONMENT
========================= */

const DATABASE_URL = process.env.DATABASE_URL;

const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  crypto.randomBytes(32).toString("hex");

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";

/* =========================
   DATABASE
========================= */

const pool = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 5,
    })
  : null;

/* =========================
   COOKIE FUNCTIONS
========================= */

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

function safeEqual(a, b) {
  const aa = Buffer.from(String(a || ""));
  const bb = Buffer.from(String(b || ""));

  if (aa.length !== bb.length) {
    return false;
  }

  return crypto.timingSafeEqual(aa, bb);
}

function sign(value) {
  return crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(value)
    .digest("hex");
}

function createToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");

  return body + "." + sign(body);
}

function verifyToken(token) {
  try {
    if (!token || !token.includes(".")) {
      return null;
    }

    const index = token.lastIndexOf(".");

    const body = token.slice(0, index);
    const signature = token.slice(index + 1);

    if (!safeEqual(signature, sign(body))) {
      return null;
    }

    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8")
    );

    if (!payload.exp || Date.now() > payload.exp) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

function setCookie(res, name, value, maxAge, sameSite = "Lax") {
  res.setHeader(
    "Set-Cookie",
    `${name}=${encodeURIComponent(
      value
    )}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=${sameSite}`
  );
}

function clearCookie(res, name, sameSite = "Lax") {
  res.setHeader(
    "Set-Cookie",
    `${name}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=${sameSite}`
  );
}

function getUser(req) {
  const cookies = parseCookies(req);

  return verifyToken(cookies.chikam_session);
}

function getAdmin(req) {
  const cookies = parseCookies(req);

  return verifyToken(cookies.chikam_admin);
}

/* =========================
   DATABASE INITIALIZATION
========================= */

async function initDb() {
  if (!pool) {
    console.warn("DATABASE_URL is not set.");
    return;
  }

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

    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS email VARCHAR(255);

    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS phone VARCHAR(30);

    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS password_hash TEXT;

    ALTER TABLE ideas
    ADD COLUMN IF NOT EXISTS username VARCHAR(100);
  `);
}

/* =========================
   HEALTH
========================= */

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "capable-elegance",
    time: new Date().toISOString(),
  });
});

/* =========================
   DATABASE TEST
========================= */

app.get("/db-test", async (req, res) => {
  if (!pool) {
    return res.status(500).json({
      ok: false,
      error: "DATABASE_URL is missing",
    });
  }

  try {
    const result = await pool.query("SELECT NOW() AS now");

    res.json({
      ok: true,
      database: "connected",
      now: result.rows[0].now,
    });
  } catch (error) {
    console.error("DB TEST ERROR:", error);

    res.status(500).json({
      ok: false,
      error: "Database connection failed",
    });
  }
});

/* =========================
   REGISTER
========================= */

app.post("/register", async (req, res) => {
  try {
    if (!pool) {
      return res.status(500).json({
        ok: false,
        message: "Database is not configured.",
      });
    }

    const username = String(req.body.username || "").trim();
    const password = String(req.body.password || "");
    const confirmPassword = String(
      req.body.confirmPassword || ""
    );

    const phone =
      String(req.body.phone || "").trim() || null;

    const email =
      String(req.body.email || "").trim().toLowerCase() || null;

    if (username.length < 3 || username.length > 100) {
      return res.status(400).json({
        ok: false,
        message:
          "نام کاربری باید بین ۳ تا ۱۰۰ کاراکتر باشد.",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        ok: false,
        message:
          "رمز عبور باید حداقل ۶ کاراکتر باشد.",
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({
        ok: false,
        message:
          "تکرار رمز عبور یکسان نیست.",
      });
    }

    const duplicate = await pool.query(
      `
      SELECT username, phone, email
      FROM users
      WHERE LOWER(username) = LOWER($1)
         OR ($2::text IS NOT NULL AND phone = $2)
         OR ($3::text IS NOT NULL AND LOWER(email) = LOWER($3))
      LIMIT 1
      `,
      [username, phone, email]
    );

    if (duplicate.rows.length) {
      const row = duplicate.rows[0];

      if (
        row.username &&
        row.username.toLowerCase() ===
          username.toLowerCase()
      ) {
        return res.status(409).json({
          ok: false,
          message:
            "این نام کاربری قبلاً استفاده شده است.",
        });
      }

      if (phone && row.phone === phone) {
        return res.status(409).json({
          ok: false,
          message:
            "این شماره تلفن قبلاً برای یک حساب ثبت شده است.",
        });
      }

      return res.status(409).json({
        ok: false,
        message:
          "این ایمیل قبلاً ثبت شده است.",
      });
    }

    const passwordHash = await bcrypt.hash(
      password,
      12
    );

    const result = await pool.query(
      `
      INSERT INTO users
      (username, password_hash, phone, email)
      VALUES ($1, $2, $3, $4)
      RETURNING id, username, phone, email, created_at
      `,
      [
        username,
        passwordHash,
        phone,
        email,
      ]
    );

    res.status(201).json({
      ok: true,
      message:
        "حساب با موفقیت ایجاد شد.",
      user: result.rows[0],
    });
  } catch (error) {
    console.error(
      "REGISTER ERROR:",
      error
    );

    res.status(500).json({
      ok: false,
      message:
        "خطا در ایجاد حساب.",
    });
  }
});

/* =========================
   LOGIN
========================= */

app.post("/login", async (req, res) => {
  try {
    if (!pool) {
      return res.status(500).json({
        ok: false,
        message:
          "Database is not configured.",
      });
    }

    const username =
      String(req.body.username || "").trim();

    const password =
      String(req.body.password || "");

    if (!username || !password) {
      return res.status(400).json({
        ok: false,
        message:
          "نام کاربری و رمز عبور را وارد کنید.",
      });
    }

    const result = await pool.query(
      `
      SELECT id, username, password_hash
      FROM users
      WHERE LOWER(username) = LOWER($1)
      LIMIT 1
      `,
      [username]
    );

    if (!result.rows.length) {
      return res.status(401).json({
        ok: false,
        message:
          "نام کاربری یا رمز عبور اشتباه است.",
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
        message:
          "نام کاربری یا رمز عبور اشتباه است.",
      });
    }

    const token = createToken({
      type: "user",
      id: user.id,
      username: user.username,
      exp:
        Date.now() +
        7 * 24 * 60 * 60 * 1000,
    });

    setCookie(
      res,
      "chikam_session",
      token,
      7 * 24 * 60 * 60,
      "Lax"
    );

    res.json({
      ok: true,
      message: "ورود موفق بود.",
      username: user.username,
    });
  } catch (error) {
    console.error(
      "LOGIN ERROR:",
      error
    );

    res.status(500).json({
      ok: false,
      message:
        "خطا در ورود.",
    });
  }
});

/* =========================
   CURRENT USER
========================= */

app.get("/me", (req, res) => {
  const user = getUser(req);

  if (!user) {
    return res.json({
      loggedIn: false,
    });
  }

  res.json({
    loggedIn: true,
    username: user.username,
  });
});

/* =========================
   LOGOUT
========================= */

app.post("/logout", (req, res) => {
  clearCookie(
    res,
    "chikam_session",
    "Lax"
  );

  res.json({
    ok: true,
  });
});

/* =========================
   GET IDEAS
========================= */

app.get("/ideas", async (req, res) => {
  try {
    if (!pool) {
      return res.status(500).json({
        ok: false,
        message:
          "Database is not configured.",
      });
    }

    const result = await pool.query(`
      SELECT
        id,
        title,
        description,
        solution,
        category,
        participation_type,
        username,
        created_at
      FROM ideas
      ORDER BY id DESC
      LIMIT 100
    `);

    res.json({
      ok: true,
      ideas: result.rows,
    });
  } catch (error) {
    console.error(
      "IDEAS GET ERROR:",
      error
    );

    res.status(500).json({
      ok: false,
      message:
        "خطا در دریافت ایده‌ها.",
    });
  }
});

/* =========================
   CREATE IDEA
========================= */

app.post("/ideas", async (req, res) => {
  try {
    if (!pool) {
      return res.status(500).json({
        ok: false,
        message:
          "Database is not configured.",
      });
    }

    const user = getUser(req);

    if (!user) {
      return res.status(401).json({
        ok: false,
        message:
          "برای ثبت ایده ابتدا وارد حساب شوید.",
      });
    }

    const title =
      String(req.body.title || "").trim();

    const description =
      String(
        req.body.description || ""
      ).trim();

    const solution =
      String(
        req.body.solution || ""
      ).trim();

    const category =
      String(
        req.body.category || ""
      ).trim();

    const participationType =
      String(
        req.body.participationType || ""
      ).trim();

    if (!title) {
      return res.status(400).json({
        ok: false,
        message:
          "عنوان ایده را وارد کنید.",
      });
    }

    const result = await pool.query(
      `
      INSERT INTO ideas
      (
        title,
        description,
        solution,
        category,
        participation_type,
        username
      )
      VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING *
      `,
      [
        title,
        description,
        solution,
        category,
        participationType,
        user.username,
      ]
    );

    res.status(201).json({
      ok: true,
      message:
        "ایده با موفقیت ثبت شد.",
      idea: result.rows[0],
    });
  } catch (error) {
    console.error(
      "IDEAS POST ERROR:",
      error
    );

    res.status(500).json({
      ok: false,
      message:
        "خطا در ثبت ایده.",
    });
  }
});

/* =========================
   ADMIN LOGIN
========================= */

app.post("/admin/login", (req, res) => {
  const username =
    String(req.body.username || "");

  const password =
    String(req.body.password || "");

  if (!ADMIN_PASSWORD) {
    return res.status(503).json({
      ok: false,
      message:
        "ADMIN_PASSWORD در Railway تنظیم نشده است.",
    });
  }

  if (
    !safeEqual(
      username,
      ADMIN_USERNAME
    ) ||
    !safeEqual(
      password,
      ADMIN_PASSWORD
    )
  ) {
    return res.status(401).json({
      ok: false,
      message:
        "اطلاعات مدیریت صحیح نیست.",
    });
  }

  const token = createToken({
    type: "admin",
    username: ADMIN_USERNAME,
    exp:
      Date.now() +
      4 * 60 * 60 * 1000,
  });

  setCookie(
    res,
    "chikam_admin",
    token,
    4 * 60 * 60,
    "Strict"
  );

  res.json({
    ok: true,
  });
});

/* =========================
   ADMIN LOGOUT
========================= */

app.post("/admin/logout", (req, res) => {
  clearCookie(
    res,
    "chikam_admin",
    "Strict"
  );

  res.json({
    ok: true,
  });
});

/* =========================
   ADMIN PANEL API
========================= */

app.get("/admin/panel", async (req, res) => {
  try {
    const admin = getAdmin(req);

    if (!admin) {
      return res.status(401).json({
        ok: false,
        message: "Unauthorized",
      });
    }

    if (!pool) {
      return res.status(500).json({
        ok: false,
        message:
          "Database is not configured.",
      });
    }

    const [
      users,
      ideas,
      ads,
    ] = await Promise.all([
      pool.query(`
        SELECT
          id,
          username,
          phone,
          email,
          created_at
        FROM users
        ORDER BY id DESC
        LIMIT 500
      `),

      pool.query(`
        SELECT
          id,
          title,
          category,
          participation_type,
          username,
          created_at
        FROM ideas
        ORDER BY id DESC
        LIMIT 500
      `),

      pool.query(`
        SELECT
          id,
          title,
          description,
          username,
          created_at
        FROM ads
        ORDER BY id DESC
        LIMIT 200
      `),
    ]);

    res.json({
      ok: true,
      users: users.rows,
      ideas: ideas.rows,
      ads: ads.rows,
    });
  } catch (error) {
    console.error(
      "ADMIN PANEL ERROR:",
      error
    );

    res.status(500).json({
      ok: false,
      message:
        "خطا در پنل مدیریت.",
    });
  }
});

/* =========================
   MAIN PAGE
========================= */

function page() {
  return `<!doctype html>
<html lang="fa" dir="rtl">

<head>

<meta charset="utf-8">

<meta
  name="viewport"
  content="width=device-width,initial-scale=1"
>

<meta
  name="description"
  content="چیکام؛ هر ایده آغاز یک مسیر"
>

<title>
چیکام | هر ایده آغاز یک مسیر
</title>

<style>

:root{
  --bg:#07111f;
  --card:#0d1b2d;
  --card2:#10243a;
  --line:#203751;
  --text:#eef6ff;
  --muted:#9fb2c7;
  --green:#31d07c;
  --green2:#18a85d;
  --gold:#f2c45c;
  --danger:#ff6675;
  --shadow:0 18px 50px rgba(0,0,0,.25);
}

*{
  box-sizing:border-box;
}

body{
  margin:0;
  font-family:
    Tahoma,
    Arial,
    sans-serif;

  background:
    radial-gradient(
      circle at 50% -10%,
      #163858 0,
      #07111f 45%
    );

  color:var(--text);
  line-height:1.8;
}

a{
  color:inherit;
  text-decoration:none;
}

.wrap{
  width:min(1120px,92%);
  margin:auto;
}

.top{
  position:sticky;
  top:0;
  z-index:10;

  background:
    rgba(7,17,31,.88);

  backdrop-filter:blur(14px);

  border-bottom:
    1px solid rgba(255,255,255,.07);
}

.nav{
  height:72px;

  display:flex;
  align-items:center;
  justify-content:space-between;

  gap:20px;
}

.brand{
  display:flex;
  align-items:center;

  gap:11px;

  font-weight:800;
  font-size:22px;
}

.logo{
  width:44px;
  height:44px;

  border-radius:14px;

  background:
    linear-gradient(
      135deg,
      var(--green),
      #55f0aa
    );

  display:grid;
  place-items:center;

  box-shadow:
    0 10px 25px
    rgba(49,208,124,.22);
}

.logo svg{
  width:29px;
  height:29px;
}

.nav-actions{
  display:flex;
  gap:8px;
  align-items:center;
}

.btn{
  border:
    1px solid var(--line);

  background:#0b1828;

  color:var(--text);

  border-radius:12px;

  padding:9px 15px;

  cursor:pointer;

  font:inherit;

  transition:.2s;
}

.btn:hover{
  transform:translateY(-1px);
}

.btn.primary{
  background:
    linear-gradient(
      135deg,
      var(--green),
      var(--green2)
    );

  border:0;

  color:#03150c;

  font-weight:800;
}

.hero{
  padding:
    70px
    0
    35px;

  text-align:center;
}

.hero h1{
  font-size:
    clamp(
      32px,
      6vw,
      62px
    );

  margin:
    0
    0
    12px;

  letter-spacing:-1px;
}

.hero p{
  color:var(--muted);

  font-size:18px;

  margin:
    0
    auto
    28px;

  max-width:720px;
}

.glow{
  color:var(--green);
}

.grid{
  display:grid;

  grid-template-columns:
    1fr 1fr;

  gap:22px;
}

.card{
  background:
    linear-gradient(
      180deg,
      rgba(16,36,58,.95),
      rgba(10,25,42,.95)
    );

  border:
    1px solid var(--line);

  border-radius:22px;

  padding:24px;

  box-shadow:var(--shadow);
}

.wide{
  grid-column:1/-1;
}

.card h2{
  margin-top:0;
  font-size:22px;
}

.label{
  display:block;

  color:#cbd9e8;

  font-size:14px;

  margin:
    13px
    0
    6px;
}

input,
textarea,
select{
  width:100%;

  border:
    1px solid #29435e;

  background:#081523;

  color:var(--text);

  border-radius:12px;

  padding:12px;

  font:inherit;

  outline:none;
}

textarea{
  min-height:120px;
  resize:vertical;
}

input:focus,
textarea:focus,
select:focus{
  border-color:
    var(--green);
}

.password{
  position:relative;
}

.password input{
  padding-left:48px;
}

.eye{
  position:absolute;

  left:7px;
  top:7px;

  height:40px;
  width:40px;

  border:0;

  background:transparent;

  color:#9fb2c7;

  cursor:pointer;
}

.row{
  display:grid;

  grid-template-columns:
    1fr 1fr;

  gap:12px;
}

.msg{
  margin-top:12px;

  min-height:25px;

  color:var(--muted);
}

.msg.ok{
  color:var(--green);
}

.msg.err{
  color:var(--danger);
}

.idea{
  border-top:
    1px solid var(--line);

  padding:
    18px 0;
}

.idea:first-child{
  border-top:0;
}

.idea h3{
  margin:0 0 5px;
}

.meta{
  color:#7f96ad;
  font-size:13px;
}

.tag{
  display:inline-block;

  border:
    1px solid #31506e;

  border-radius:999px;

  padding:
    2px 9px;

  margin:
    5px 0;

  color:#b8cadc;

  font-size:12px;
}

.ad{
  min-height:92px;

  display:grid;
  place-items:center;

  border:
    1px dashed #31506e;

  border-radius:18px;

  color:#7890a7;

  margin:
    18px 0;
}

.social{
  display:flex;
  gap:9px;
  flex-wrap:wrap;
}

.social a{
  border:
    1px solid var(--line);

  padding:
    8px 12px;

  border-radius:10px;

  color:#c9d8e8;
}

.note{
  color:var(--muted);
  font-size:13px;
}

.hidden{
  display:none!important;
}

.modal{
  position:fixed;
  inset:0;

  background:
    rgba(0,0,0,.72);

  display:grid;
  place-items:center;

  padding:18px;

  z-index:30;
}

.modalbox{
  width:min(520px,100%);

  max-height:92vh;

  overflow:auto;
}

.close{
  float:left;
}

.footer{
  margin-top:45px;

  padding:
    35px 0;

  border-top:
    1px solid var(--line);

  color:var(--muted);
}

.footergrid{
  display:grid;

  grid-template-columns:
    2fr 1fr 1fr;

  gap:25px;
}

.small{
  font-size:12px;
}

@media(max-width:760px){

  .grid,
  .footergrid,
  .row{
    grid-template-columns:1fr;
  }

  .wide{
    grid-column:auto;
  }

  .nav{
    height:64px;
  }

  .hero{
    padding-top:45px;
  }

  .card{
    padding:18px;
  }

  .brand span{
    font-size:19px;
  }

  .nav-actions .btn{
    padding:
      7px 9px;

    font-size:12px;
  }
}

</style>

</head>

<body>

<header class="top">

<div class="wrap nav">

<a class="brand" href="/">

<span class="logo">

<svg
  viewBox="0 0 32 32"
  fill="none"
>

<path
  d="M8 22V10l8-5 8 5v12l-8 5-8-5Z"
  stroke="#062015"
  stroke-width="2.4"
/>

<path
  d="M11 16h10M16 10v12"
  stroke="#062015"
  stroke-width="2.4"
  stroke-linecap="round"
/>

</svg>

</span>

<span>
چیکام
</span>

</a>

<div class="nav-actions">

<span
  id="navUser"
  class="note"
></span>

<button
  class="btn"
  onclick="openRegister()"
>
ثبت‌نام
</button>

<button
  class="btn primary"
  id="loginBtn"
  onclick="openLogin()"
>
ورود
</button>

<button
  class="btn hidden"
  id="logoutBtn"
  onclick="logout()"
>
خروج
</button>

<button
  class="btn"
  onclick="openAdmin()"
>
مدیریت
</button>

</div>

</div>

</header>


<main class="wrap">

<section class="hero">

<h1>

هر ایده

<span class="glow">
آغاز یک مسیر
</span>

</h1>

<p>
چیکام محیطی برای ثبت ایده،
پیدا کردن همراه و تبدیل فکرهای خوب
به مسیرهای واقعی است.
</p>

<button
  class="btn primary"
  onclick="focusIdea()"
>
شروع یک ایده
</button>

</section>


<div class="ad">

فضای تبلیغات و معرفی
— در نسخه عمومی قابل فعال‌سازی است

</div>


<section class="grid">


<div
  class="card"
  id="ideaCard"
>

<h2>
ثبت یک ایده
</h2>

<p class="note">
برای ثبت ایده باید وارد حساب کاربری باشید.
</p>


<label class="label">
عنوان ایده
</label>

<input
  id="ideaTitle"
  placeholder="عنوان کوتاه و روشن ایده"
>


<label
  class="label"
  for="ideaDescription"
>
توضیحات تکمیلی
</label>

<textarea
  id="ideaDescription"
  placeholder="توضیحات تکمیلی درباره ایده، مشکل، هدف، راه‌حل پیشنهادی، مراحل اجرا، نیازمندی‌ها و سایر نکات مهم را وارد کنید."
></textarea>


<label class="label">
راه‌حل یا پیشنهاد
</label>

<textarea
  id="ideaSolution"
  placeholder="راه‌حل یا پیشنهاد شما"
></textarea>


<div class="row">

<div>

<label class="label">
دسته‌بندی
</label>

<input
  id="ideaCategory"
  placeholder="مثلاً فناوری، کسب‌وکار، آموزش"
>

</div>


<div>

<label class="label">
نوع مشارکت
</label>

<select id="participationType">

<option value="">
نوع مشارکت را انتخاب کنید
</option>

<option>
همکاری
</option>

<option>
سرمایه‌گذاری
</option>

<option>
ارائه تخصص
</option>

<option>
ایده و پیشنهاد
</option>

</select>

</div>

</div>


<button
  class="btn primary"
  style="margin-top:15px"
  onclick="submitIdea()"
>
ثبت ایده
</button>

<div
  id="ideaMessage"
  class="msg"
></div>

</div>


<div class="card">

<h2>
درباره چیکام
</h2>

<p>
چیکام فقط محلی برای نمایش ایده‌ها نیست.
هدف این است که هر ایده بتواند
مسیر خودش را پیدا کند،
همراه مناسب جذب کند و
مرحله‌به‌مرحله رشد کند.
</p>

<p class="note">
هر ایده آغاز یک مسیر است؛
چیکام تلاش می‌کند این مسیر را
منظم‌تر، قابل مشاهده‌تر و
قابل توسعه‌تر کند.
</p>

</div>


<div class="card wide">

<h2>
ایده‌های اخیر
</h2>

<div id="ideasList">

<p class="note">
در حال دریافت ایده‌ها...
</p>

</div>

</div>

</section>

</main>


<footer class="footer">

<div class="wrap footergrid">


<div>

<div class="brand">

<span class="logo">

<svg
  viewBox="0 0 32 32"
  fill="none"
>

<path
  d="M8 22V10l8-5 8 5v12l-8 5-8-5Z"
  stroke="#062015"
  stroke-width="2.4"
/>

<path
  d="M11 16h10M16 10v12"
  stroke="#062015"
  stroke-width="2.4"
  stroke-linecap="round"
/>

</svg>

</span>

<span>
چیکام
</span>

</div>

<p>
هر ایده آغاز یک مسیر.
</p>

</div>


<div>

<b>
شبکه‌های اجتماعی
</b>

<p class="small">
پس از مشخص شدن حساب‌های رسمی چیکام،
لینک‌های واقعی این بخش قرار می‌گیرند.
</p>

<div class="social">

<a
  href="#"
  onclick="return false"
>
Instagram
</a>

<a
  href="#"
  onclick="return false"
>
Telegram
</a>

<a
  href="#"
  onclick="return false"
>
X
</a>

</div>

</div>


<div>

<b>
اطلاعات
</b>

<p class="small">
درباره ما
</p>

<p class="small">
حریم خصوصی
</p>

<p class="small">
شرایط استفاده
</p>

</div>


</div>

</footer>


<div
  id="modal"
  class="modal hidden"
>

<div
  class="card modalbox"
>

<button
  class="btn close"
  onclick="closeModal()"
>
بستن
</button>

<div id="modalContent"></div>

</div>

</div>


<script>

function byId(id){
  return document.getElementById(id);
}


function showModal(html){

  byId("modalContent").innerHTML = html;

  byId("modal")
    .classList
    .remove("hidden");

}


function closeModal(){

  byId("modal")
    .classList
    .add("hidden");

}


function eye(id){

  const x = byId(id);

  x.type =
    x.type === "password"
      ? "text"
      : "password";

}


function openRegister(){

  showModal(

    '<h2>ایجاد حساب</h2>' +

    '<p class="note">' +
    'نام کاربری و رمز عبور الزامی است. شماره تلفن اختیاری است.' +
    '</p>' +

    '<label class="label">' +
    'نام کاربری' +
    '</label>' +

    '<input id="rUser" autocomplete="username">' +

    '<label class="label">' +
    'رمز عبور' +
    '</label>' +

    '<div class="password">' +

    '<input id="rPass" type="password" autocomplete="new-password">' +

    '<button class="eye" onclick="eye(\\'rPass\\')">' +
    '◉' +
    '</button>' +

    '</div>' +

    '<label class="label">' +
    'تکرار رمز عبور' +
    '</label>' +

    '<div class="password">' +

    '<input id="rConfirm" type="password" autocomplete="new-password">' +

    '<button class="eye" onclick="eye(\\'rConfirm\\')">' +
    '◉' +
    '</button>' +

    '</div>' +

    '<label class="label">' +
    'شماره تلفن (اختیاری)' +
    '</label>' +

    '<input id="rPhone" autocomplete="tel">' +

    '<label class="label">' +
    'ایمیل (اختیاری)' +
    '</label>' +

    '<input id="rEmail" type="email" autocomplete="email">' +

    '<button class="btn primary" style="margin-top:15px" onclick="register()">' +
    'ایجاد حساب' +
    '</button>' +

    '<div id="rMsg" class="msg"></div>'

  );

}


function openLogin(){

  showModal(

    '<h2>ورود به چیکام</h2>' +

    '<label class="label">' +
    'نام کاربری' +
    '</label>' +

    '<input id="lUser" autocomplete="username">' +

    '<label class="label">' +
    'رمز عبور' +
    '</label>' +

    '<div class="password">' +

    '<input id="lPass" type="password" autocomplete="current-password">' +

    '<button class="eye" onclick="eye(\\'lPass\\')">' +
    '◉' +
    '</button>' +

    '</div>' +

    '<button class="btn primary" style="margin-top:15px" onclick="login()">' +
    'ورود' +
    '</button>' +

    '<div id="lMsg" class="msg"></div>'

  );

}


function openAdmin(){

  showModal(

    '<h2>ورود مدیریت</h2>' +

    '<label class="label">' +
    'نام کاربری مدیریت' +
    '</label>' +

    '<input id="aUser" autocomplete="username">' +

    '<label class="label">' +
    'رمز مدیریت' +
    '</label>' +

    '<div class="password">' +

    '<input id="aPass" type="password">' +

    '<button class="eye" onclick="eye(\\'aPass\\')">' +
    '◉' +
    '</button>' +

    '</div>' +

    '<button class="btn primary" style="margin-top:15px" onclick="adminLogin()">' +
    'ورود مدیریت' +
    '</button>' +

    '<div id="aMsg" class="msg"></div>'

  );

}


async function register(){

  const msg = byId("rMsg");

  msg.className = "msg";
  msg.textContent = "در حال ثبت...";

  try{

    const body = {

      username:
        byId("rUser").value,

      password:
        byId("rPass").value,

      confirmPassword:
        byId("rConfirm").value,

      phone:
        byId("rPhone").value,

      email:
        byId("rEmail").value

    };


    const r =
      await fetch(
        "/register",
        {
          method:"POST",

          headers:{
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify(body)
        }
      );


    const d =
      await r.json();


    msg.textContent =
      d.message || "";

    msg.className =
      r.ok
        ? "msg ok"
        : "msg err";


    if(r.ok){

      setTimeout(
        openLogin,
        700
      );

    }

  }
  catch(e){

    msg.textContent =
      "ارتباط با سرور برقرار نشد.";

    msg.className =
      "msg err";

  }

}


async function login(){

  const msg =
    byId("lMsg");

  msg.className = "msg";

  msg.textContent =
    "در حال ورود...";


  try{

    const r =
      await fetch(
        "/login",
        {
          method:"POST",

          headers:{
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify({

              username:
                byId("lUser").value,

              password:
                byId("lPass").value

            })

        }
      );


    const d =
      await r.json();


    msg.textContent =
      d.message || "";

    msg.className =
      r.ok
        ? "msg ok"
        : "msg err";


    if(r.ok){

      closeModal();

      refreshMe();

    }

  }
  catch(e){

    msg.textContent =
      "ارتباط با سرور برقرار نشد.";

    msg.className =
      "msg err";

  }

}


async function logout(){

  await fetch(
    "/logout",
    {
      method:"POST"
    }
  );

  refreshMe();

}


async function refreshMe(){

  try{

    const r =
      await fetch("/me");

    const d =
      await r.json();


    if(d.loggedIn){

      byId("navUser").textContent =
        "سلام، " + d.username;

      byId("loginBtn")
        .classList
        .add("hidden");

      byId("logoutBtn")
        .classList
        .remove("hidden");

    }
    else{

      byId("navUser").textContent =
        "";

      byId("loginBtn")
        .classList
        .remove("hidden");

      byId("logoutBtn")
        .classList
        .add("hidden");

    }

  }
  catch(e){

  }

}


async function submitIdea(){

  const msg =
    byId("ideaMessage");

  msg.className =
    "msg";

  msg.textContent =
    "در حال ثبت...";


  const body = {

    title:
      byId("ideaTitle").value,

    description:
      byId("ideaDescription").value,

    solution:
      byId("ideaSolution").value,

    category:
      byId("ideaCategory").value,

    participationType:
      byId("participationType").value

  };


  try{

    const r =
      await fetch(
        "/ideas",
        {
          method:"POST",

          headers:{
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify(body)
        }
      );


    const d =
      await r.json();


    msg.textContent =
      d.message || "";

    msg.className =
      r.ok
        ? "msg ok"
        : "msg err";


    if(r.ok){

      byId("ideaTitle").value =
        "";

      byId("ideaDescription").value =
        "";

      byId("ideaSolution").value =
        "";

      byId("ideaCategory").value =
        "";

      byId("participationType").value =
        "";

      loadIdeas();

    }

  }
  catch(e){

    msg.textContent =
      "ارتباط با سرور برقرار نشد.";

    msg.className =
      "msg err";

  }

}


async function loadIdeas(){

  const box =
    byId("ideasList");


  try{

    const r =
      await fetch("/ideas");

    const d =
      await r.json();


    if(
      !d.ok ||
      !d.ideas.length
    ){

      box.innerHTML =
        '<p class="note">' +
        'هنوز ایده‌ای ثبت نشده است.' +
        '</p>';

      return;

    }


    box.innerHTML =
      d.ideas
        .map(function(i){

          return (

            '<article class="idea">' +

            '<h3>' +
            escapeHtml(i.title) +
            '</h3>' +

            '<div class="meta">' +

            escapeHtml(
              i.username ||
              "کاربر چیکام"
            ) +

            ' · ' +

            new Date(
              i.created_at
            ).toLocaleString(
              "fa-IR"
            ) +

            '</div>' +

            (
              i.category
                ? '<span class="tag">' +
                  escapeHtml(
                    i.category
                  ) +
                  '</span> '
                : ""
            ) +

            (
              i.participation_type
                ? '<span class="tag">' +
                  escapeHtml(
                    i.participation_type
                  ) +
                  '</span>'
                : ""
            ) +

            (
              i.description
                ? '<p>' +
                  escapeHtml(
                    i.description
                  ) +
                  '</p>'
                : ""
            ) +

            '</article>'

          );

        })
        .join("");

  }
  catch(e){

    box.innerHTML =
      '<p class="msg err">' +
      'دریافت ایده‌ها ممکن نشد.' +
      '</p>';

  }

}


function escapeHtml(v){

  return String(v || "")
    .replace(
      /[&<>\"']/g,
      function(c){

        return {

          "&":"&amp;",
          "<":"&lt;",
          ">":"&gt;",
          "\"":"&quot;",
          "'":"&#039;"

        }[c];

      }
    );

}


async function adminLogin(){

  const msg =
    byId("aMsg");

  msg.textContent =
    "در حال ورود...";


  try{

    const r =
      await fetch(
        "/admin/login",
        {
          method:"POST",

          headers:{
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify({

              username:
                byId("aUser").value,

              password:
                byId("aPass").value

            })

        }
      );


    const d =
      await r.json();


    if(!r.ok){

      msg.textContent =
        d.message ||
        "خطا";

      msg.className =
        "msg err";

      return;

    }


    closeModal();

    window.location.href =
      "/admin";

  }
  catch(e){

    msg.textContent =
      "ارتباط با سرور برقرار نشد.";

    msg.className =
      "msg err";

  }

}


function focusIdea(){

  byId("ideaCard")
    .scrollIntoView({
      behavior:"smooth"
    });

}


byId("modal")
  .addEventListener(
    "click",
    function(e){

      if(
        e.target ===
        byId("modal")
      ){

        closeModal();

      }

    }
  );


refreshMe();

loadIdeas();

</script>

</body>

</html>`;
}


/* =========================
   HOME ROUTE
========================= */

app.get("/", (req, res) => {
  res
    .type("html")
    .send(page());
});


/* =========================
   ADMIN PAGE
========================= */

app.get("/admin", (req, res) => {

  if (!getAdmin(req)) {
    return res.redirect("/");
  }

  res.type("html").send(`
<!doctype html>

<html lang="fa" dir="rtl">

<head>

<meta charset="utf-8">

<meta
  name="viewport"
  content="width=device-width,initial-scale=1"
>

<title>
مدیریت چیکام
</title>

<style>

body{
  margin:0;
  background:#07111f;
  color:#eef6ff;
  font-family:Tahoma,Arial;
  padding:25px;
}

.box{
  max-width:1100px;
  margin:auto;
  background:#0d1b2d;
  border:1px solid #203751;
  border-radius:20px;
  padding:25px;
}

table{
  width:100%;
  border-collapse:collapse;
  margin:20px 0;
}

th,
td{
  padding:9px;
  border-bottom:1px solid #203751;
  text-align:right;
}

button{
  background:#31d07c;
  border:0;
  padding:10px 15px;
  border-radius:10px;
  cursor:pointer;
}

</style>

</head>

<body>

<div class="box">

<h1>
پنل مدیریت چیکام
</h1>

<button onclick="logout()">
خروج
</button>

<div id="data">
در حال دریافت اطلاعات...
</div>

</div>

<script>

async function logout(){

  await fetch(
    "/admin/logout",
    {
      method:"POST"
    }
  );

  location.href="/";

}


async function load(){

  const r =
    await fetch(
      "/admin/panel"
    );


  if(!r.ok){

    location.href="/";

    return;

  }


  const d =
    await r.json();


  document.getElementById(
    "data"
  ).innerHTML =

    "<h2>کاربران (" +
    d.users.length +
    ")</h2>" +

    table(
      d.users,
      [
        "id",
        "username",
        "phone",
        "email",
        "created_at"
      ]
    ) +

    "<h2>ایده‌ها (" +
    d.ideas.length +
    ")</h2>" +

    table(
      d.ideas,
      [
        "id",
        "title",
        "category",
        "participation_type",
        "username",
        "created_at"
      ]
    ) +

    "<h2>تبلیغات (" +
    d.ads.length +
    ")</h2>" +

    table(
      d.ads,
      [
        "id",
        "title",
        "username",
        "created_at"
      ]
    );

}


function table(rows, keys){

  if(!rows.length){

    return "<p>موردی وجود ندارد.</p>";

  }


  return (

    "<table>" +

    "<tr>" +

    keys
      .map(
        function(k){
          return "<th>" +
            k +
            "</th>";
        }
      )
      .join("") +

    "</tr>" +

    rows
      .map(
        function(x){

          return (

            "<tr>" +

            keys
              .map(
                function(k){

                  return (
                    "<td>" +
                    esc(x[k]) +
                    "</td>"
                  );

                }
              )
              .join("") +

            "</tr>"

          );

        }
      )
      .join("") +

    "</table>"

  );

}


function esc(v){

  return String(
    v == null ? "" : v
  ).replace(
    /[&<>\"']/g,
    function(c){

      return {

        "&":"&amp;",
        "<":"&lt;",
        ">":"&gt;",
        "\"":"&quot;",
        "'":"&#039;"

      }[c];

    }
  );

}


load();

</script>

</body>

</html>
`);
});


/* =========================
   404
========================= */

app.use((req, res) => {

  res.status(404).json({
    ok:false,
    message:"Not found"
  });

});


/* =========================
   START SERVER
========================= */

async function start(){

  try{

    await initDb();

    app.listen(
      PORT,
      "0.0.0.0",
      () => {

        console.log(
          "CHIKAM server running on port " +
          PORT
        );

      }
    );

  }
  catch(error){

    console.error(
      "STARTUP ERROR:",
      error
    );

    process.exit(1);

  }

}


start();
