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

app.use(express.json({ limit: "1mb" }));

// -----------------------------
// ابزارهای کمکی
// -----------------------------

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL,
      phone TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ideas (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      solution TEXT,
      category TEXT,
      participation_type TEXT DEFAULT 'همکاری',
      status TEXT DEFAULT 'open',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ads (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      contact TEXT,
      status TEXT DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

// -----------------------------
// صفحه اصلی
// -----------------------------

app.get("/", (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="description" content="چیکام؛ هر ایده آغاز یک مسیر">
<title>چیکام — هر ایده آغاز یک مسیر</title>

<style>
* {
  box-sizing: border-box;
}

html {
  scroll-behavior: smooth;
}

body {
  margin: 0;
  font-family: Tahoma, Arial, sans-serif;
  background:
    radial-gradient(circle at top right, rgba(61, 124, 255, 0.10), transparent 32%),
    radial-gradient(circle at bottom left, rgba(0, 200, 150, 0.08), transparent 30%),
    #f5f7fb;
  color: #182230;
  min-height: 100vh;
}

button,
input,
textarea,
select {
  font-family: inherit;
}

button {
  cursor: pointer;
}

.topbar {
  position: sticky;
  top: 0;
  z-index: 20;
  background: rgba(255,255,255,0.92);
  backdrop-filter: blur(14px);
  border-bottom: 1px solid #e5e9f0;
}

.topbar-inner {
  max-width: 1120px;
  margin: auto;
  min-height: 70px;
  padding: 0 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.brand-mark {
  width: 42px;
  height: 42px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  color: white;
  font-weight: bold;
  font-size: 20px;
  background: linear-gradient(135deg, #315efb, #14b89a);
  box-shadow: 0 8px 22px rgba(49,94,251,.20);
}

.brand-title {
  font-size: 20px;
  font-weight: 800;
}

.brand-subtitle {
  font-size: 11px;
  color: #7b8493;
  margin-top: 3px;
}

main {
  max-width: 1120px;
  margin: auto;
  padding: 28px 20px 60px;
}

.hero {
  min-height: 340px;
  border-radius: 30px;
  padding: 54px 38px;
  display: flex;
  align-items: center;
  position: relative;
  overflow: hidden;
  color: white;
  background:
    radial-gradient(circle at 80% 20%, rgba(255,255,255,.20), transparent 25%),
    linear-gradient(135deg, #172554, #2454c6 55%, #087f73);
  box-shadow: 0 25px 60px rgba(31,52,99,.18);
}

.hero-content {
  max-width: 720px;
  position: relative;
  z-index: 2;
}

.hero-label {
  display: inline-block;
  padding: 7px 13px;
  border: 1px solid rgba(255,255,255,.25);
  background: rgba(255,255,255,.10);
  border-radius: 999px;
  font-size: 12px;
  margin-bottom: 18px;
}

.hero h1 {
  font-size: clamp(32px, 5vw, 54px);
  margin: 0 0 15px;
  line-height: 1.2;
}

.hero p {
  margin: 0;
  line-height: 2;
  color: rgba(255,255,255,.88);
  max-width: 680px;
  font-size: 16px;
}

.hero-symbol {
  position: absolute;
  left: 5%;
  bottom: -55px;
  width: 230px;
  height: 230px;
  border: 1px solid rgba(255,255,255,.14);
  border-radius: 50%;
}

.hero-symbol::before,
.hero-symbol::after {
  content: "";
  position: absolute;
  border: 1px solid rgba(255,255,255,.12);
  border-radius: 50%;
}

.hero-symbol::before {
  inset: 28px;
}

.hero-symbol::after {
  inset: 65px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 22px;
  margin-top: 22px;
}

.section {
  background: rgba(255,255,255,.96);
  border: 1px solid #e6eaf1;
  border-radius: 24px;
  padding: 25px;
  box-shadow: 0 12px 35px rgba(20,30,50,.06);
}

.section.full {
  margin-top: 22px;
}

.section h2 {
  margin: 0 0 8px;
  font-size: 20px;
}

.section-desc {
  color: #778092;
  font-size: 13px;
  line-height: 1.9;
  margin-bottom: 20px;
}

.auth-box {
  max-width: 520px;
  margin: auto;
}

.input-group {
  position: relative;
  margin-bottom: 12px;
}

input,
textarea,
select {
  width: 100%;
  border: 1px solid #dfe4ec;
  background: #fbfcfe;
  border-radius: 13px;
  padding: 14px 15px;
  font-size: 14px;
  outline: none;
  transition: .2s;
  color: #182230;
}

input:focus,
textarea:focus,
select:focus {
  border-color: #4268f5;
  box-shadow: 0 0 0 4px rgba(66,104,245,.09);
  background: white;
}

.password-wrap {
  position: relative;
  margin-bottom: 14px;
}

.password-wrap input {
  padding-left: 48px;
}

.eye-btn {
  position: absolute;
  left: 7px;
  top: 7px;
  width: 40px;
  height: 40px;
  border: 0;
  background: transparent;
  border-radius: 10px;
  font-size: 18px;
}

.auth-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.main-button,
.secondary-button,
.ad-button {
  border: 0;
  border-radius: 13px;
  padding: 13px 16px;
  font-weight: bold;
  font-size: 14px;
  transition: .2s;
}

.main-button {
  color: white;
  background: linear-gradient(135deg, #315efb, #4268f5);
}

.secondary-button {
  color: #2448bb;
  background: #edf2ff;
}

.ad-button {
  width: 100%;
  color: white;
  background: linear-gradient(135deg, #0b8f78, #13b58f);
}

.main-button:hover,
.secondary-button:hover,
.ad-button:hover {
  transform: translateY(-1px);
  filter: brightness(.98);
}

.message {
  min-height: 22px;
  margin-top: 12px;
  font-size: 13px;
  color: #667085;
}

.message.success {
  color: #16805c;
}

.message.error {
  color: #c43b48;
}

.ad-card {
  border-radius: 18px;
  padding: 20px;
  background: linear-gradient(135deg, #f0fdf9, #f4f7ff);
  border: 1px solid #dfeae8;
}

.ad-icon {
  font-size: 28px;
  margin-bottom: 8px;
}

.idea-form {
  display: grid;
  gap: 12px;
}

.idea-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

textarea {
  min-height: 105px;
  resize: vertical;
}

.ideas-list {
  display: grid;
  gap: 14px;
  margin-top: 18px;
}

.idea-card {
  border: 1px solid #e6eaf1;
  border-radius: 18px;
  padding: 18px;
  background: #fff;
}

.idea-top {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: start;
}

.idea-title {
  font-size: 17px;
  font-weight: 800;
}

.badge {
  display: inline-flex;
  padding: 5px 9px;
  border-radius: 999px;
  font-size: 11px;
  white-space: nowrap;
}

.badge.green {
  background: #e7f8f1;
  color: #16805c;
}

.badge.yellow {
  background: #fff6db;
  color: #9a7200;
}

.badge.red {
  background: #ffe9eb;
  color: #c43b48;
}

.idea-text {
  color: #687386;
  line-height: 1.9;
  font-size: 13px;
  margin-top: 10px;
}

.empty {
  text-align: center;
  padding: 35px 15px;
  color: #8992a1;
  border: 1px dashed #dce1e9;
  border-radius: 17px;
}

footer {
  text-align: center;
  color: #8992a1;
  font-size: 12px;
  padding: 30px 20px;
}

@media (max-width: 760px) {
  .grid,
  .idea-grid {
    grid-template-columns: 1fr;
  }

  .hero {
    min-height: 300px;
    padding: 38px 25px;
    border-radius: 24px;
  }

  .hero h1 {
    font-size: 34px;
  }

  .section {
    padding: 20px;
  }

  .topbar-inner {
    min-height: 62px;
  }
}
</style>
</head>

<body>

<header class="topbar">
  <div class="topbar-inner">
    <div class="brand">
      <div class="brand-mark">چ</div>
      <div>
        <div class="brand-title">چیکام</div>
        <div class="brand-subtitle">هر ایده آغاز یک مسیر</div>
      </div>
    </div>
  </div>
</header>

<main>

<section class="hero">
  <div class="hero-content">
    <div class="hero-label">فضای ایده‌ها و همکاری</div>
    <h1>هر ایده آغاز یک مسیر</h1>
    <p>
      ایده‌ات را مطرح کن، آن را توسعه بده و با دیگران
      برای ساختنش همراه شو. چیکام برای تبدیل ایده‌های
      ساده به مسیرهای واقعی ساخته می‌شود.
    </p>
  </div>
  <div class="hero-symbol"></div>
</section>

<div class="grid">

<section class="section">
  <h2>📢 تبلیغات کاربران</h2>
  <div class="section-desc">
    فضای معرفی محصولات، خدمات و پروژه‌ها در چیکام.
  </div>

  <div class="ad-card">
    <div class="ad-icon">📣</div>
    <strong>محصول یا خدمات خود را معرفی کنید</strong>
    <p class="section-desc">
      این بخش برای تبلیغات کاربران و معرفی محصولات،
      خدمات و پروژه‌ها در نظر گرفته شده است.
    </p>
    <button class="ad-button" onclick="showAdMessage()">
      ثبت تبلیغ
    </button>
  </div>

  <div id="adMessage" class="message"></div>
</section>

<section class="section">
  <div class="auth-box">

    <h2>حساب کاربری</h2>

    <div class="section-desc">
      برای ورود یا ثبت‌نام، از همین دو کادر استفاده کنید.
    </div>

    <!-- فقط دو کادر -->
    <div class="input-group">
      <input
        id="authUsername"
        type="text"
        placeholder="نام کاربری"
        autocomplete="username"
      >
    </div>

    <div class="password-wrap">
      <input
        id="authPassword"
        type="password"
        placeholder="رمز عبور"
        autocomplete="current-password"
      >
      <button
        class="eye-btn"
        type="button"
        onclick="togglePassword('authPassword', this)"
        aria-label="نمایش رمز عبور"
      >👁️</button>
    </div>

    <!-- ورود و ثبت نام زیر دو کادر -->
    <div class="auth-actions">
      <button class="main-button" onclick="loginUser()">
        ورود
      </button>

      <button class="secondary-button" onclick="registerUser()">
        ثبت‌نام
      </button>
    </div>

    <div id="authMessage" class="message"></div>

  </div>
</section>

</div>

<section class="section full">
  <h2>💡 ثبت ایده</h2>

  <div class="section-desc">
    ایده خود را ثبت کنید تا در فضای چیکام قرار بگیرد.
  </div>

  <div class="idea-form">

    <input
      id="ideaTitle"
      type="text"
      placeholder="عنوان ایده"
    >

    <textarea
      id="ideaDescription"
      placeholder="توضیح ایده"
    ></textarea>

    <textarea
      id="ideaSolution"
      placeholder="راه‌حل یا پیشنهاد"
    ></textarea>

    <div class="idea-grid">

      <input
        id="ideaCategory"
        type="text"
        placeholder="دسته‌بندی"
      >

      <select id="ideaParticipation">
        <option value="همکاری">نوع مشارکت: همکاری</option>
        <option value="سرمایه‌گذاری">سرمایه‌گذاری</option>
        <option value="مشاوره">مشاوره</option>
        <option value="توسعه">توسعه</option>
        <option value="سایر">سایر</option>
      </select>

    </div>

    <button class="main-button" onclick="createIdea()">
      ثبت ایده
    </button>

    <div id="ideaMessage" class="message"></div>

  </div>
</section>

<section class="section full">
  <h2>🌱 ایده‌های چیکام</h2>
  <div class="section-desc">
    ایده‌های ثبت‌شده در این بخش نمایش داده می‌شوند.
  </div>

  <div id="ideasList" class="ideas-list">
    <div class="empty">در حال بارگذاری ایده‌ها...</div>
  </div>
</section>

</main>

<footer>
  چیکام — هر ایده آغاز یک مسیر
</footer>

<script>

function togglePassword(id, button) {
  const input = document.getElementById(id);

  if (input.type === "password") {
    input.type = "text";
    button.textContent = "🙈";
  } else {
    input.type = "password";
    button.textContent = "👁️";
  }
}

function setMessage(id, text, type = "") {
  const el = document.getElementById(id);
  el.textContent = text;
  el.className = "message " + type;
}

async function loginUser() {
  const username =
    document.getElementById("authUsername").value.trim();

  const password =
    document.getElementById("authPassword").value;

  if (!username || !password) {
    setMessage(
      "authMessage",
      "نام کاربری و رمز عبور را وارد کنید.",
      "error"
    );
    return;
  }

  try {
    const response = await fetch("/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        username,
        password
      })
    });

    const data = await response.json();

    if (!response.ok) {
      setMessage(
        "authMessage",
        data.message || "ورود انجام نشد.",
        "error"
      );
      return;
    }

    setMessage(
      "authMessage",
      "ورود با موفقیت انجام شد.",
      "success"
    );

  } catch (error) {
    setMessage(
      "authMessage",
      "ارتباط با سرور برقرار نشد.",
      "error"
    );
  }
}

async function registerUser() {
  const username =
    document.getElementById("authUsername").value.trim();

  const password =
    document.getElementById("authPassword").value;

  if (!username || !password) {
    setMessage(
      "authMessage",
      "ابتدا نام کاربری و رمز عبور را وارد کنید.",
      "error"
    );
    return;
  }

  const phone = prompt(
    "برای تکمیل ثبت‌نام، شماره تلفن خود را وارد کنید:"
  );

  if (!phone || !phone.trim()) {
    return;
  }

  try {
    const response = await fetch("/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        username,
        phone: phone.trim(),
        password
      })
    });

    const data = await response.json();

    if (!response.ok) {
      setMessage(
        "authMessage",
        data.message || "ثبت‌نام انجام نشد.",
        "error"
      );
      return;
    }

    setMessage(
      "authMessage",
      "حساب شما با موفقیت ایجاد شد. اکنون می‌توانید وارد شوید.",
      "success"
    );

  } catch (error) {
    setMessage(
      "authMessage",
      "ارتباط با سرور برقرار نشد.",
      "error"
    );
  }
}

async function createIdea() {
  const title =
    document.getElementById("ideaTitle").value.trim();

  const description =
    document.getElementById("ideaDescription").value.trim();

  const solution =
    document.getElementById("ideaSolution").value.trim();

  const category =
    document.getElementById("ideaCategory").value.trim();

  const participation =
    document.getElementById("ideaParticipation").value;

  if (!title) {
    setMessage(
      "ideaMessage",
      "عنوان ایده را وارد کنید.",
      "error"
    );
    return;
  }

  try {
    const response = await fetch("/ideas", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        title,
        description,
        solution,
        category,
        participation_type: participation
      })
    });

    const data = await response.json();

    if (!response.ok) {
      setMessage(
        "ideaMessage",
        data.message || "ثبت ایده انجام نشد.",
        "error"
      );
      return;
    }

    setMessage(
      "ideaMessage",
      "ایده با موفقیت ثبت شد.",
      "success"
    );

    document.getElementById("ideaTitle").value = "";
    document.getElementById("ideaDescription").value = "";
    document.getElementById("ideaSolution").value = "";
    document.getElementById("ideaCategory").value = "";

    loadIdeas();

  } catch (error) {
    setMessage(
      "ideaMessage",
      "ارتباط با سرور برقرار نشد.",
      "error"
    );
  }
}

async function loadIdeas() {
  const list = document.getElementById("ideasList");

  try {
    const response = await fetch("/ideas");
    const ideas = await response.json();

    if (!ideas.length) {
      list.innerHTML =
        '<div class="empty">هنوز ایده‌ای ثبت نشده است.</div>';
      return;
    }

    list.innerHTML = "";

    ideas.forEach((idea) => {
      const card = document.createElement("div");
      card.className = "idea-card";

      const top = document.createElement("div");
      top.className = "idea-top";

      const title = document.createElement("div");
      title.className = "idea-title";
      title.textContent = idea.title || "بدون عنوان";

      const badge = document.createElement("span");
      badge.className = "badge green";
      badge.textContent =
        idea.participation_type || "همکاری";

      top.appendChild(title);
      top.appendChild(badge);

      const text = document.createElement("div");
      text.className = "idea-text";
      text.textContent =
        idea.description || "توضیحی برای این ایده ثبت نشده است.";

      card.appendChild(top);
      card.appendChild(text);

      if (idea.category) {
        const category = document.createElement("div");
        category.className = "idea-text";
        category.textContent =
          "دسته‌بندی: " + idea.category;
        card.appendChild(category);
      }

      list.appendChild(card);
    });

  } catch (error) {
    list.innerHTML =
      '<div class="empty">امکان دریافت ایده‌ها وجود ندارد.</div>';
  }
}

function showAdMessage() {
  setMessage(
    "adMessage",
    "بخش ثبت تبلیغات در مرحله بعد فعال می‌شود.",
    ""
  );
}

loadIdeas();

</script>

</body>
</html>`);
});

// -----------------------------
// ثبت نام کاربر
// -----------------------------

app.post("/register", async (req, res) => {
  try {
    const { username, phone, password } = req.body;

    if (!username || !phone || !password) {
      return res.status(400).json({
        message: "نام کاربری، شماره تلفن و رمز عبور الزامی است."
      });
    }

    const existingPhone = await pool.query(
      "SELECT id FROM users WHERE phone = $1 LIMIT 1",
      [phone]
    );

    if (existingPhone.rows.length) {
      return res.status(409).json({
        message: "این شماره تلفن قبلاً ثبت شده است."
      });
    }

    const existingUsername = await pool.query(
      "SELECT id FROM users WHERE username = $1 LIMIT 1",
      [username]
    );

    if (existingUsername.rows.length) {
      return res.status(409).json({
        message: "این نام کاربری قبلاً استفاده شده است."
      });
    }

    const hashedPassword =
      await bcrypt.hash(password, 12);

    await pool.query(
      `
      INSERT INTO users
      (username, phone, password)
      VALUES ($1, $2, $3)
      `,
      [username, phone, hashedPassword]
    );

    res.json({
      message: "حساب کاربری با موفقیت ایجاد شد."
    });

  } catch (error) {
    console.error("REGISTER ERROR:", error);

    res.status(500).json({
      message: "خطا در ثبت‌نام."
    });
  }
});

// -----------------------------
// ورود کاربر
// -----------------------------

app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        message: "نام کاربری و رمز عبور را وارد کنید."
      });
    }

    const result = await pool.query(
      `
      SELECT id, username, password
      FROM users
      WHERE username = $1
      LIMIT 1
      `,
      [username]
    );

    if (!result.rows.length) {
      return res.status(401).json({
        message: "نام کاربری یا رمز عبور اشتباه است."
      });
    }

    const user = result.rows[0];

    const valid =
      await bcrypt.compare(password, user.password);

    if (!valid) {
      return res.status(401).json({
        message: "نام کاربری یا رمز عبور اشتباه است."
      });
    }

    res.json({
      message: "ورود موفق بود.",
      user: {
        id: user.id,
        username: user.username
      }
    });

  } catch (error) {
    console.error("LOGIN ERROR:", error);

    res.status(500).json({
      message: "خطا در ورود."
    });
  }
});

// -----------------------------
// دریافت ایده‌ها
// -----------------------------

app.get("/ideas", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id,
        title,
        description,
        solution,
        category,
        participation_type,
        status,
        created_at
      FROM ideas
      ORDER BY id DESC
    `);

    res.json(result.rows);

  } catch (error) {
    console.error("IDEAS GET ERROR:", error);

    res.status(500).json({
      message: "خطا در دریافت ایده‌ها."
    });
  }
});

// -----------------------------
// ثبت ایده
// -----------------------------

app.post("/ideas", async (req, res) => {
  try {
    const {
      title,
      description,
      solution,
      category,
      participation_type
    } = req.body;

    if (!title) {
      return res.status(400).json({
        message: "عنوان ایده الزامی است."
      });
    }

    await pool.query(
      `
      INSERT INTO ideas
      (
        title,
        description,
        solution,
        category,
        participation_type,
        status
      )
      VALUES ($1, $2, $3, $4, $5, 'open')
      `,
      [
        title,
        description || "",
        solution || "",
        category || "",
        participation_type || "همکاری"
      ]
    );

    res.json({
      message: "ایده با موفقیت ثبت شد."
    });

  } catch (error) {
    console.error("IDEA POST ERROR:", error);

    res.status(500).json({
      message: "خطا در ثبت ایده."
    });
  }
});

// -----------------------------
// تست اتصال PostgreSQL
// -----------------------------

app.get("/db-test", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT NOW() AS time"
    );

    res.json({
      success: true,
      database: "connected",
      time: result.rows[0].time
    });

  } catch (error) {
    console.error("DB TEST ERROR:", error);

    res.status(500).json({
      success: false,
      database: "error",
      message: error.message
    });
  }
});

// -----------------------------
// پنل اختصاصی مدیر
// -----------------------------
// ورود مدیر در صفحه اصلی نمایش داده نمی‌شود.
// مدیر از /admin وارد می‌شود.

app.get("/admin", (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ورود مدیر — چیکام</title>

<style>
body {
  margin: 0;
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: #101828;
  font-family: Tahoma, Arial, sans-serif;
  padding: 20px;
}

.admin-box {
  width: min(420px, 100%);
  background: #fff;
  border-radius: 24px;
  padding: 30px;
  box-shadow: 0 25px 70px rgba(0,0,0,.25);
}

h1 {
  margin: 0 0 8px;
  font-size: 24px;
}

p {
  color: #667085;
  font-size: 13px;
  line-height: 1.8;
}

input {
  width: 100%;
  box-sizing: border-box;
  margin: 7px 0;
  padding: 14px;
  border: 1px solid #dfe4ec;
  border-radius: 12px;
  outline: none;
}

button {
  width: 100%;
  margin-top: 10px;
  padding: 14px;
  border: 0;
  border-radius: 12px;
  background: #182b55;
  color: white;
  font-weight: bold;
  cursor: pointer;
}

#message {
  margin-top: 12px;
  color: #c43b48;
  font-size: 13px;
}
</style>
</head>

<body>

<div class="admin-box">
  <h1>🔐 مدیریت چیکام</h1>
  <p>
    این بخش فقط برای مدیر سایت است.
  </p>

  <input
    id="username"
    placeholder="نام کاربری مدیر"
  >

  <input
    id="password"
    type="password"
    placeholder="رمز عبور مدیر"
  >

  <button onclick="adminLogin()">
    ورود به مدیریت
  </button>

  <div id="message"></div>
</div>

<script>
async function adminLogin() {
  const username =
    document.getElementById("username").value.trim();

  const password =
    document.getElementById("password").value;

  const message =
    document.getElementById("message");

  if (!username || !password) {
    message.textContent =
      "نام کاربری و رمز عبور را وارد کنید.";
    return;
  }

  try {
    const response = await fetch("/admin/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        username,
        password
      })
    });

    const data = await response.json();

    if (!response.ok) {
      message.textContent =
        data.message || "ورود مدیر انجام نشد.";
      return;
    }

    window.location.href = "/admin/panel";

  } catch (error) {
    message.textContent =
      "ارتباط با سرور برقرار نشد.";
  }
}
</script>

</body>
</html>`);
});

// -----------------------------
// ورود مدیر
// -----------------------------

app.post("/admin/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    const adminUsername =
      process.env.ADMIN_USERNAME;

    const adminPassword =
      process.env.ADMIN_PASSWORD;

    if (!adminUsername || !adminPassword) {
      return res.status(500).json({
        message:
          "اطلاعات مدیر در Variables سرور تنظیم نشده است."
      });
    }

    if (
      username !== adminUsername ||
      password !== adminPassword
    ) {
      return res.status(401).json({
        message: "اطلاعات ورود مدیر صحیح نیست."
      });
    }

    res.json({
      success: true
    });

  } catch (error) {
    console.error("ADMIN LOGIN ERROR:", error);

    res.status(500).json({
      message: "خطا در ورود مدیر."
    });
  }
});

// -----------------------------
// پنل مدیریت
// -----------------------------

app.get("/admin/panel", async (req, res) => {
  try {
    const users =
      await pool.query(
        "SELECT COUNT(*)::int AS count FROM users"
      );

    const ideas =
      await pool.query(
        "SELECT COUNT(*)::int AS count FROM ideas"
      );

    const ads =
      await pool.query(
        "SELECT COUNT(*)::int AS count FROM ads"
      );

    res.send(`<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>پنل مدیریت چیکام</title>

<style>
body {
  margin: 0;
  background: #f5f7fb;
  color: #182230;
  font-family: Tahoma, Arial, sans-serif;
}

header {
  background: #101828;
  color: white;
  padding: 22px;
}

main {
  max-width: 1100px;
  margin: auto;
  padding: 25px 20px;
}

.stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 18px;
}

.card {
  background: white;
  border: 1px solid #e5e9f0;
  border-radius: 20px;
  padding: 25px;
}

.number {
  font-size: 35px;
  font-weight: bold;
  margin-top: 10px;
}

.green {
  border-top: 4px solid #16a36f;
}

.yellow {
  border-top: 4px solid #e0a800;
}

.blue {
  border-top: 4px solid #315efb;
}

@media (max-width: 700px) {
  .stats {
    grid-template-columns: 1fr;
  }
}
</style>
</head>

<body>

<header>
  <strong>🔐 پنل مدیریت چیکام</strong>
</header>

<main>

<h2>نمای کلی سایت</h2>

<div class="stats">

<div class="card blue">
  <div>کاربران</div>
  <div class="number">
    ${users.rows[0].count}
  </div>
</div>

<div class="card green">
  <div>ایده‌ها</div>
  <div class="number">
    ${ideas.rows[0].count}
  </div>
</div>

<div class="card yellow">
  <div>تبلیغات</div>
  <div class="number">
    ${ads.rows[0].count}
  </div>
</div>

</div>

</main>

</body>
</html>`);

  } catch (error) {
    console.error("ADMIN PANEL ERROR:", error);

    res.status(500).send(
      "خطا در بارگذاری پنل مدیریت."
    );
  }
});

// -----------------------------
// شروع سرور
// -----------------------------

async function startServer() {
  try {
    await initDatabase();

    app.listen(PORT, "0.0.0.0", () => {
      console.log(
        "CHIKAM server running on port " + PORT
      );
    });

  } catch (error) {
    console.error(
      "SERVER START ERROR:",
      error
    );

    process.exit(1);
  }
}

startServer();
