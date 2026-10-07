import express from "express";
import { Pool } from "pg";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* =========================
   BASIC SECURITY HEADERS
========================= */

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});

/* =========================
   DATABASE
========================= */

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

/* =========================
   SESSION SECURITY
========================= */

const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  crypto.randomBytes(32).toString("hex");

function createSessionToken(user) {
  const payload = Buffer.from(
    JSON.stringify({
      id: user.id,
      username: user.username,
      role: user.role || "user",
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000
    })
  ).toString("base64url");

  const signature = crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(payload)
    .digest("base64url");

  return `${payload}.${signature}`;
}

function verifySessionToken(token) {
  try {
    if (!token) return null;

    const parts = token.split(".");

    if (parts.length !== 2) {
      return null;
    }

    const [payload, signature] = parts;

    const expectedSignature = crypto
      .createHmac("sha256", SESSION_SECRET)
      .update(payload)
      .digest("base64url");

    if (
      !crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      )
    ) {
      return null;
    }

    const data = JSON.parse(
      Buffer.from(payload, "base64url").toString()
    );

    if (!data.exp || Date.now() > data.exp) {
      return null;
    }

    return data;

  } catch {
    return null;
  }
}

function getSession(req) {
  const cookies = req.headers.cookie || "";

  const match = cookies.match(
    /(?:^|;\s*)chikam_session=([^;]+)/
  );

  if (!match) {
    return null;
  }

  return verifySessionToken(
    decodeURIComponent(match[1])
  );
}

function setUserSession(res, user) {
  const token = createSessionToken(user);

  res.setHeader(
    "Set-Cookie",
    `chikam_session=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800`
  );
}

function clearUserSession(res) {
  res.setHeader(
    "Set-Cookie",
    "chikam_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0"
  );
}

/* =========================
   ADMIN SESSION
========================= */

function createAdminToken() {
  const payload = Buffer.from(
    JSON.stringify({
      role: "admin",
      exp: Date.now() + 4 * 60 * 60 * 1000
    })
  ).toString("base64url");

  const signature = crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(payload)
    .digest("base64url");

  return `${payload}.${signature}`;
}

function verifyAdminToken(token) {
  try {
    if (!token) return false;

    const [payload, signature] = token.split(".");

    if (!payload || !signature) {
      return false;
    }

    const expected = crypto
      .createHmac("sha256", SESSION_SECRET)
      .update(payload)
      .digest("base64url");

    if (
      !crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expected)
      )
    ) {
      return false;
    }

    const data = JSON.parse(
      Buffer.from(payload, "base64url").toString()
    );

    return (
      data.role === "admin" &&
      data.exp &&
      Date.now() < data.exp
    );

  } catch {
    return false;
  }
}

function getAdminSession(req) {
  const cookies = req.headers.cookie || "";

  const match = cookies.match(
    /(?:^|;\s*)chikam_admin=([^;]+)/
  );

  if (!match) {
    return false;
  }

  return verifyAdminToken(
    decodeURIComponent(match[1])
  );
}

/* =========================
   DATABASE INIT
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
  `);

  /* =========================
     OLD DATABASE COMPATIBILITY
  ========================= */

  await pool.query(`
    ALTER TABLE ideas
    ADD COLUMN IF NOT EXISTS username VARCHAR(100);
  `);

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS email VARCHAR(255);
  `);

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS phone VARCHAR(30);
  `);

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS password_hash TEXT;
  `);

  console.log("DATABASE READY");
}

/* =========================
   MAIN PAGE
========================= */

app.get("/", async (req, res) => {

  try {

    const ideasResult = await pool.query(`
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
    `);

    const ideas = ideasResult.rows;

    const ideaHTML =
      ideas.length === 0
        ? `<div class="empty">هنوز ایده‌ای ثبت نشده است.</div>`
        : ideas
            .map(
              (idea) => `
                <div class="idea-card">

                  <h3>
                    ${escapeHTML(idea.title)}
                  </h3>

                  ${
                    idea.description
                      ? `
                        <p>
                          <strong>توضیحات:</strong>
                          ${escapeHTML(idea.description)}
                        </p>
                      `
                      : ""
                  }

                  ${
                    idea.solution
                      ? `
                        <p>
                          <strong>راه‌حل:</strong>
                          ${escapeHTML(idea.solution)}
                        </p>
                      `
                      : ""
                  }

                  ${
                    idea.category
                      ? `
                        <span class="tag">
                          ${escapeHTML(idea.category)}
                        </span>
                      `
                      : ""
                  }

                  ${
                    idea.participation_type
                      ? `
                        <span class="tag">
                          ${escapeHTML(
                            idea.participation_type
                          )}
                        </span>
                      `
                      : ""
                  }

                  ${
                    idea.username
                      ? `
                        <div class="idea-user">
                          ایجادکننده:
                          ${escapeHTML(idea.username)}
                        </div>
                      `
                      : ""
                  }

                </div>
              `
            )
            .join("");

    res.send(`
<!DOCTYPE html>

<html lang="fa" dir="rtl">

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width, initial-scale=1.0"
>

<title>CHIKAM | چیکام</title>

<style>

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: Tahoma, Arial, sans-serif;

  background:
    radial-gradient(
      circle at top right,
      rgba(80,120,255,.12),
      transparent 35%
    ),
    linear-gradient(
      135deg,
      #f6f8fc,
      #eef2f7
    );

  color: #172033;
}

header {
  background: rgba(255,255,255,.95);
  border-bottom: 1px solid #e3e7ef;

  padding: 14px 22px;

  position: sticky;
  top: 0;
  z-index: 10;

  backdrop-filter: blur(12px);
}

.header-inner {
  max-width: 1150px;
  margin: auto;

  display: flex;
  justify-content: space-between;
  align-items: center;
}

.logo {
  font-size: 22px;
  font-weight: 800;
  letter-spacing: .5px;
}

.logo span {
  color: #4767d9;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.header-link {
  color: #5c667a;
  text-decoration: none;
  font-size: 13px;
}

.user-status {
  display: none;
  align-items: center;
  gap: 8px;

  background: #edf7f0;
  color: #24733d;

  border-radius: 20px;
  padding: 7px 12px;

  font-size: 12px;
}

.logout-small {
  display: none;

  background: #f2f4f8;
  color: #3e4a60;

  padding: 8px 13px;
  border-radius: 10px;

  font-size: 12px;
}

.hero {
  max-width: 1150px;
  margin: 35px auto 20px;

  padding: 42px 25px;

  border-radius: 24px;

  background:
    linear-gradient(
      135deg,
      rgba(65,91,180,.96),
      rgba(88,116,220,.88)
    );

  color: white;
  text-align: center;

  box-shadow:
    0 18px 45px rgba(45,65,130,.18);
}

.hero h1 {
  margin: 0 0 12px;

  font-size:
    clamp(28px, 5vw, 44px);
}

.hero p {
  margin: 0;
  opacity: .92;
  font-size: 17px;
}

.container {
  max-width: 1150px;
  margin: auto;

  padding:
    0 18px 50px;
}

.grid {
  display: grid;

  grid-template-columns:
    repeat(2, minmax(0, 1fr));

  gap: 20px;
}

.card {
  background: rgba(255,255,255,.96);

  border: 1px solid #e2e7f0;
  border-radius: 20px;

  padding: 24px;

  box-shadow:
    0 10px 30px rgba(25,35,60,.06);
}

.card.full {
  grid-column: 1 / -1;
}

.card h2 {
  margin-top: 0;
  font-size: 20px;
}

.subtitle {
  color: #727b8d;

  font-size: 13px;

  margin-top: -6px;
  margin-bottom: 18px;

  line-height: 1.8;
}

input,
textarea,
select {
  width: 100%;

  border:
    1px solid #d9dfeb;

  background: #fbfcfe;

  border-radius: 12px;

  padding: 13px 14px;

  margin-bottom: 12px;

  font-family: inherit;
  font-size: 14px;

  outline: none;
}

input:focus,
textarea:focus,
select:focus {
  border-color: #637fe4;

  box-shadow:
    0 0 0 3px
    rgba(99,127,228,.10);
}

textarea {
  min-height: 105px;
  resize: vertical;
}

.password-wrap {
  position: relative;
}

.password-wrap input {
  padding-left: 50px;
}

.eye {
  position: absolute;

  left: 10px;
  top: 7px;

  width: 38px;
  height: 38px;

  border: none;

  background: transparent;

  cursor: pointer;

  font-size: 20px;

  padding: 0;

  color: #4f5d75;
}

.eye:hover {
  background: #edf1f8;
  border-radius: 9px;
}

.buttons {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

button {
  border: none;

  border-radius: 11px;

  padding:
    12px 20px;

  cursor: pointer;

  font-family: inherit;
  font-weight: 700;
}

.primary {
  background: #4767d9;
  color: white;
}

.secondary {
  background: #edf1f8;
  color: #34405a;
}

.danger {
  background: #fceeee;
  color: #a33a3a;
}

button:hover {
  opacity: .9;
}

.message {
  margin-top: 12px;

  min-height: 20px;

  font-size: 13px;

  color: #566176;

  line-height: 1.8;
}

.logged-message {
  display: none;

  background: #f1f8f3;

  border: 1px solid #d8eadc;

  color: #2d6840;

  padding: 12px;

  border-radius: 12px;

  margin-bottom: 14px;

  font-size: 13px;
}

.ad-box {
  border:
    1px dashed #c8cfdd;

  background:
    rgba(255,255,255,.65);

  border-radius: 16px;

  min-height: 90px;

  display: flex;
  align-items: center;
  justify-content: center;

  color: #8a93a4;

  margin-bottom: 20px;
}

.idea-card {
  background: #fafbfe;

  border:
    1px solid #e3e7ef;

  border-radius: 15px;

  padding: 18px;

  margin-bottom: 12px;
}

.idea-card h3 {
  margin:
    0 0 12px;
}

.idea-card p {
  color: #596276;

  line-height: 1.8;

  font-size: 14px;
}

.tag {
  display: inline-block;

  background: #edf1ff;

  color: #526bc2;

  border-radius: 20px;

  padding:
    5px 10px;

  margin-left: 5px;

  font-size: 11px;
}

.idea-user {
  margin-top: 12px;

  font-size: 11px;

  color: #8a93a4;
}

.empty {
  text-align: center;

  padding: 30px;

  color: #8992a3;
}

footer {
  background: rgba(255,255,255,.8);

  border-top:
    1px solid #e4e8ef;

  text-align: center;

  color: #8b94a5;

  font-size: 12px;

  padding: 25px 18px;
}

.footer-links {
  display: flex;

  justify-content: center;

  flex-wrap: wrap;

  gap: 14px;

  margin-bottom: 14px;
}

.footer-links button {
  background: transparent;

  color: #657086;

  padding: 4px 6px;

  font-size: 12px;
}

.footer-links button:hover {
  color: #4767d9;
}

/* =========================
   MODALS
========================= */

.modal {
  display: none;

  position: fixed;

  inset: 0;

  z-index: 100;

  background:
    rgba(15,23,42,.55);

  align-items: center;
  justify-content: center;

  padding: 18px;
}

.modal-box {
  width: 100%;

  max-width: 460px;

  max-height: 92vh;

  overflow-y: auto;

  background: white;

  border-radius: 22px;

  padding: 26px;

  box-shadow:
    0 25px 70px
    rgba(0,0,0,.2);

  position: relative;
}

.modal-box h2 {
  margin-top: 0;
}

.modal-note {
  font-size: 12px;

  color: #7b8495;

  line-height: 1.9;

  margin-bottom: 18px;
}

.close-modal {
  position: absolute;

  left: 16px;
  top: 14px;

  background: #edf1f8;

  color: #4d5870;

  width: 34px;
  height: 34px;

  padding: 0;

  border-radius: 50%;

  font-size: 18px;
}

.info-content {
  color: #596276;

  font-size: 14px;

  line-height: 2;

  white-space: pre-line;
}

.social-box {
  display: grid;

  gap: 10px;

  margin-top: 15px;
}

.social-link {
  display: block;

  text-decoration: none;

  background: #f4f6fa;

  color: #42506a;

  padding: 11px 13px;

  border-radius: 11px;

  text-align: center;
}

.social-link:hover {
  background: #eaf0ff;
  color: #4767d9;
}

@media (max-width: 760px) {

  .grid {
    grid-template-columns: 1fr;
  }

  .card.full {
    grid-column: auto;
  }

  .hero {
    margin:
      20px 12px;

    padding:
      32px 18px;
  }

  .container {
    padding:
      0 12px 35px;
  }

  .header-actions {
    gap: 5px;
  }

  .user-status {
    font-size: 10px;
    padding: 6px 8px;
  }

  .logout-small {
    padding:
      7px 9px;

    font-size: 10px;
  }

}

</style>

</head>

<body>

<header>

  <div class="header-inner">

    <div class="logo">
      چی<span>کام</span>
    </div>

    <div class="header-actions">

      <div
        id="userStatus"
        class="user-status"
      ></div>

      <button
        id="headerLogout"
        class="logout-small"
        type="button"
        onclick="logoutUser()"
      >
        خروج
      </button>

      <a
        class="header-link"
        href="/admin"
      >
        مدیریت
      </a>

    </div>

  </div>

</header>

<section class="hero">

  <h1>
    هر ایده آغاز یک مسیر
  </h1>

  <p>
    فضای ایده‌ها و همکاری
  </p>

</section>

<div class="container">

  <div class="ad-box">
    فضای تبلیغات
  </div>

  <div class="grid">

    <!-- ACCOUNT -->

    <section class="card">

      <h2>
        حساب کاربری
      </h2>

      <div
        id="loggedMessage"
        class="logged-message"
      ></div>

      <div
        id="loginArea"
      >

        <div class="subtitle">
          برای شروع فقط نام کاربری و رمز عبور لازم است.
        </div>

        <input
          id="username"
          type="text"
          placeholder="نام کاربری"
          autocomplete="username"
        >

        <div class="password-wrap">

          <input
            id="password"
            type="password"
            placeholder="رمز عبور"
            autocomplete="current-password"
          >

          <button
            class="eye"
            type="button"
            onclick="togglePassword()"
            aria-label="نمایش رمز"
          >
            👁
          </button>

        </div>

        <div class="buttons">

          <button
            class="primary"
            onclick="loginUser()"
          >
            ورود
          </button>

          <button
            class="secondary"
            onclick="openRegister()"
          >
            ثبت‌نام
          </button>

        </div>

      </div>

      <div
        id="accountLogoutArea"
        style="display:none;"
      >

        <button
          class="danger"
          type="button"
          onclick="logoutUser()"
        >
          خروج از حساب
        </button>

      </div>

      <div
        id="authMessage"
        class="message"
      ></div>

    </section>


    <!-- IDEA FORM -->

    <section class="card">

      <h2>
        ثبت یک ایده
      </h2>

      <div class="subtitle">
        ایده خود را ثبت کنید تا مسیر آن آغاز شود.
      </div>

      <input
        id="ideaTitle"
        type="text"
        placeholder="عنوان ایده"
      >

      <textarea
        id="ideaDescription"
        placeholder="توضیحات ایده"
      ></textarea>

      <textarea
        id="ideaSolution"
        placeholder="راه‌حل یا پیشنهاد شما"
      ></textarea>

      <input
        id="ideaCategory"
        type="text"
        placeholder="دسته‌بندی"
      >

      <select id="participationType">

        <option value="">
          نوع مشارکت را انتخاب کنید
        </option>

        <option value="همکاری">
          همکاری
        </option>

        <option value="سرمایه‌گذاری">
          سرمایه‌گذاری
        </option>

        <option value="ارائه تخصص">
          ارائه تخصص
        </option>

        <option value="ایده و پیشنهاد">
          ایده و پیشنهاد
        </option>

      </select>

      <button
        class="primary"
        onclick="submitIdea()"
      >
        ثبت ایده
      </button>

      <div
        id="ideaMessage"
        class="message"
      ></div>

    </section>


    <!-- IDEAS -->

    <section class="card full">

      <h2>
        ایده‌های ثبت‌شده
      </h2>

      <div id="ideas">

        ${ideaHTML}

      </div>

    </section>

  </div>

</div>


<footer>

  <div class="footer-links">

    <button onclick="openInfo('about')">
      درباره ما
    </button>

    <button onclick="openInfo('contact')">
      ارتباط با ما
    </button>

    <button onclick="openInfo('privacy')">
      حریم خصوصی
    </button>

    <button onclick="openInfo('terms')">
      شرایط استفاده
    </button>

    <button onclick="openInfo('social')">
      شبکه‌های اجتماعی
    </button>

  </div>

  CHIKAM — هر ایده آغاز یک مسیر

</footer>


<!-- =========================
     REGISTER MODAL
========================= -->

<div
  id="registerModal"
  class="modal"
>

  <div class="modal-box">

    <button
      class="close-modal"
      type="button"
      onclick="closeRegister()"
    >
      ×
    </button>

    <h2>
      ایجاد حساب کاربری
    </h2>

    <div class="modal-note">
      نام کاربری و رمز عبور الزامی است.
      شماره تلفن و ایمیل اختیاری هستند.
    </div>

    <input
      id="registerUsername"
      type="text"
      placeholder="نام کاربری"
      autocomplete="username"
    >

    <div class="password-wrap">

      <input
        id="registerPassword"
        type="password"
        placeholder="رمز عبور"
        autocomplete="new-password"
      >

      <button
        class="eye"
        type="button"
        onclick="toggleRegisterPassword('registerPassword', this)"
        aria-label="نمایش رمز عبور"
      >
        👁
      </button>

    </div>

    <div class="password-wrap">

      <input
        id="registerPasswordConfirm"
        type="password"
        placeholder="تکرار رمز عبور"
        autocomplete="new-password"
      >

      <button
        class="eye"
        type="button"
        onclick="toggleRegisterPassword('registerPasswordConfirm', this)"
        aria-label="نمایش تکرار رمز عبور"
      >
        👁
      </button>

    </div>

    <input
      id="registerPhone"
      type="tel"
      placeholder="شماره تلفن (اختیاری)"
      autocomplete="tel"
    >

    <input
      id="registerEmail"
      type="email"
      placeholder="ایمیل (اختیاری)"
      autocomplete="email"
    >

    <button
      class="primary"
      style="width:100%;"
      onclick="submitRegistration()"
    >
      ثبت‌نام
    </button>

    <div
      id="registerMessage"
      class="message"
    ></div>

  </div>

</div>


<!-- =========================
     INFO MODAL
========================= -->

<div
  id="infoModal"
  class="modal"
>

  <div class="modal-box">

    <button
      class="close-modal"
      type="button"
      onclick="closeInfo()"
    >
      ×
    </button>

    <h2 id="infoTitle">
      اطلاعات CHIKAM
    </h2>

    <div
      id="infoBody"
      class="info-content"
    ></div>

  </div>

</div>


<script>

/* =========================
   PASSWORD
========================= */

function togglePassword() {

  const input =
    document.getElementById("password");

  const button =
    document.querySelector(
      "#loginArea .eye"
    );

  if (input.type === "password") {

    input.type = "text";

    button.textContent = "🙈";

  } else {

    input.type = "password";

    button.textContent = "👁";

  }

}

function toggleRegisterPassword(
  id,
  button
) {

  const input =
    document.getElementById(id);

  if (input.type === "password") {

    input.type = "text";

    button.textContent = "🙈";

  } else {

    input.type = "password";

    button.textContent = "👁";

  }

}


/* =========================
   REGISTER MODAL
========================= */

function openRegister() {

  document
    .getElementById("registerModal")
    .style.display = "flex";

  document
    .getElementById("registerUsername")
    .focus();

}

function closeRegister() {

  document
    .getElementById("registerModal")
    .style.display = "none";

}

window.addEventListener(
  "click",
  function(event) {

    const registerModal =
      document.getElementById(
        "registerModal"
      );

    const infoModal =
      document.getElementById(
        "infoModal"
      );

    if (event.target === registerModal) {
      closeRegister();
    }

    if (event.target === infoModal) {
      closeInfo();
    }

  }
);


/* =========================
   REGISTRATION
========================= */

async function submitRegistration() {

  const username =
    document
      .getElementById("registerUsername")
      .value
      .trim();

  const password =
    document
      .getElementById("registerPassword")
      .value;

  const passwordConfirm =
    document
      .getElementById(
        "registerPasswordConfirm"
      )
      .value;

  const phone =
    document
      .getElementById("registerPhone")
      .value
      .trim();

  const email =
    document
      .getElementById("registerEmail")
      .value
      .trim();

  const message =
    document.getElementById(
      "registerMessage"
    );

  message.textContent = "";

  if (!username) {

    message.textContent =
      "لطفاً نام کاربری را وارد کنید.";

    return;
  }

  if (username.length < 3) {

    message.textContent =
      "نام کاربری باید حداقل ۳ کاراکتر باشد.";

    return;
  }

  if (!password) {

    message.textContent =
      "لطفاً رمز عبور را وارد کنید.";

    return;
  }

  if (password.length < 4) {

    message.textContent =
      "رمز عبور باید حداقل ۴ کاراکتر باشد.";

    return;
  }

  if (!passwordConfirm) {

    message.textContent =
      "لطفاً تکرار رمز عبور را وارد کنید.";

    return;
  }

  if (password !== passwordConfirm) {

    message.textContent =
      "رمز عبور و تکرار آن یکسان نیست.";

    return;
  }

  if (email) {

    const emailPattern =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailPattern.test(email)) {

      message.textContent =
        "لطفاً یک ایمیل معتبر وارد کنید.";

      return;
    }

  }

  try {

    const response =
      await fetch(
        "/register",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({

            username,
            password,
            passwordConfirm,
            phone: phone || null,
            email: email || null

          })

        }
      );

    const data =
      await response.json();

    message.textContent =
      data.message ||
      "عملیات انجام شد.";

    if (response.ok) {

      document
        .getElementById("username")
        .value = username;

      document
        .getElementById("password")
        .value = "";

      document
        .getElementById(
          "registerPassword"
        )
        .value = "";

      document
        .getElementById(
          "registerPasswordConfirm"
        )
        .value = "";

      setTimeout(() => {

        closeRegister();

        document
          .getElementById(
            "authMessage"
          )
          .textContent =
          "ثبت‌نام با موفقیت انجام شد. اکنون می‌توانید وارد شوید.";

      }, 900);

    }

  } catch {

    message.textContent =
      "ارتباط با سرور برقرار نشد.";

  }

}


/* =========================
   LOGIN
========================= */

async function loginUser() {

  const username =
    document
      .getElementById("username")
      .value
      .trim();

  const password =
    document
      .getElementById("password")
      .value;

  const message =
    document.getElementById(
      "authMessage"
    );

  message.textContent = "";

  if (!username || !password) {

    message.textContent =
      "نام کاربری و رمز عبور را وارد کنید.";

    return;
  }

  try {

    const response =
      await fetch(
        "/login",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
            username,
            password
          })

        }
      );

    const data =
      await response.json();

    if (!response.ok) {

      message.textContent =
        data.message ||
        "ورود انجام نشد.";

      return;
    }

    message.textContent =
      data.message ||
      "ورود موفق بود.";

    await updateSessionUI();

  } catch {

    message.textContent =
      "ارتباط با سرور برقرار نشد.";

  }

}


/* =========================
   SESSION UI
========================= */

async function updateSessionUI() {

  try {

    const response =
      await fetch(
        "/me",
        {
          cache: "no-store"
        }
      );

    const data =
      await response.json();

    const loginArea =
      document.getElementById(
        "loginArea"
      );

    const logoutArea =
      document.getElementById(
        "accountLogoutArea"
      );

    const status =
      document.getElementById(
        "userStatus"
      );

    const headerLogout =
      document.getElementById(
        "headerLogout"
      );

    const loggedMessage =
      document.getElementById(
        "loggedMessage"
      );

    if (data.loggedIn) {

      loginArea.style.display =
        "none";

      logoutArea.style.display =
        "block";

      status.style.display =
        "flex";

      status.textContent =
        "کاربر: " + data.username;

      headerLogout.style.display =
        "block";

      loggedMessage.style.display =
        "block";

      loggedMessage.textContent =
        `شما با نام کاربری «${data.username}» وارد شده‌اید.`;

    } else {

      loginArea.style.display =
        "block";

      logoutArea.style.display =
        "none";

      status.style.display =
        "none";

      headerLogout.style.display =
        "none";

      loggedMessage.style.display =
        "none";

    }

  } catch (error) {

    console.error(
      "SESSION UI ERROR:",
      error
    );

  }

}


/* =========================
   LOGOUT
========================= */

async function logoutUser() {

  try {

    const response =
      await fetch(
        "/logout",
        {
          method: "POST"
        }
      );

    const data =
      await response.json();

    document
      .getElementById(
        "authMessage"
      )
      .textContent =
      data.message ||
      "از حساب خارج شدید.";

    document
      .getElementById(
        "password"
      )
      .value = "";

    await updateSessionUI();

  } catch {

    document
      .getElementById(
        "authMessage"
      )
      .textContent =
      "خروج انجام نشد.";

  }

}


/* =========================
   SUBMIT IDEA
========================= */

async function submitIdea() {

  const title =
    document
      .getElementById("ideaTitle")
      .value
      .trim();

  const description =
    document
      .getElementById(
        "ideaDescription"
      )
      .value
      .trim();

  const solution =
    document
      .getElementById("ideaSolution")
      .value
      .trim();

  const category =
    document
      .getElementById("ideaCategory")
      .value
      .trim();

  const participationType =
    document
      .getElementById(
        "participationType"
      )
      .value;

  const username =
    document
      .getElementById("username")
      .value
      .trim();

  const message =
    document.getElementById(
      "ideaMessage"
    );

  if (!title) {

    message.textContent =
      "لطفاً عنوان ایده را وارد کنید.";

    return;
  }

  try {

    const response =
      await fetch(
        "/ideas",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({

            title,
            description,
            solution,
            category,

            participation_type:
              participationType,

            username

          })

        }
      );

    const data =
      await response.json();

    message.textContent =
      data.message ||
      "ایده ثبت شد.";

    if (response.ok) {

      setTimeout(() => {

        window.location.reload();

      }, 700);

    }

  } catch {

    message.textContent =
      "ارتباط با سرور برقرار نشد.";

  }

}


/* =========================
   INFORMATION
========================= */

const infoData = {

  about: {
    title: "درباره CHIKAM",

    body:
`CHIKAM محیطی برای ارائه ایده، آغاز مسیر، بررسی و همکاری است.

هدف CHIKAM این است که یک ایده فقط در حد یک نوشته باقی نماند و بتواند مسیر مشخصی برای بررسی، همکاری و توسعه پیدا کند.

هر ایده آغاز یک مسیر است.`
  },

  contact: {
    title: "ارتباط با ما",

    body:
`برای ارتباط رسمی با CHIKAM، راه‌های ارتباطی رسمی به‌تدریج در این بخش اضافه خواهند شد.

در نسخه فعلی، این بخش برای ساختار رسمی ارتباطات سایت آماده شده است.`
  },

  privacy: {
    title: "حریم خصوصی",

    body:
`CHIKAM تلاش می‌کند اطلاعات کاربران را فقط برای ارائه و مدیریت خدمات سایت استفاده کند.

رمزهای عبور به صورت رمزنگاری‌شده در پایگاه داده ذخیره می‌شوند و رمز اصلی کاربر ذخیره نمی‌شود.

اطلاعات حساس نباید در بخش ایده‌ها یا محتوای عمومی وارد شوند.`
  },

  terms: {
    title: "شرایط استفاده",

    body:
`کاربر مسئول محتوایی است که در CHIKAM ثبت می‌کند.

ثبت ایده به معنی تأیید صحت، مالکیت یا امکان اجرای آن توسط CHIKAM نیست.

CHIKAM می‌تواند در آینده قوانین دقیق‌تر مربوط به محتوا، همکاری، تبلیغات و حساب‌های کاربری را منتشر کند.`
  },

  social: {
    title: "شبکه‌های اجتماعی",

    body:
`شبکه‌های اجتماعی رسمی CHIKAM پس از ایجاد و تأیید حساب‌های رسمی در این بخش قرار خواهند گرفت.

تا زمانی که لینک رسمی مشخص نشده است، هیچ لینک ساختگی یا غیررسمی نمایش داده نمی‌شود.`
  }

};

function openInfo(type) {

  const data =
    infoData[type];

  if (!data) return;

  document
    .getElementById(
      "infoTitle"
    )
    .textContent =
    data.title;

  document
    .getElementById(
      "infoBody"
    )
    .textContent =
    data.body;

  document
    .getElementById(
      "infoModal"
    )
    .style.display =
    "flex";

}

function closeInfo() {

  document
    .getElementById(
      "infoModal"
    )
    .style.display =
    "none";

}


/* =========================
   START SESSION UI
========================= */

document.addEventListener(
  "DOMContentLoaded",
  () => {
    updateSessionUI();
  }
);

</script>

</body>

</html>
    `);

  } catch (error) {

    console.error(
      "MAIN PAGE ERROR:",
      error
    );

    res
      .status(500)
      .send(
        "خطا در بارگذاری سایت."
      );

  }

});


/* =========================
   REGISTER API
========================= */

app.post(
  "/register",
  async (req, res) => {

    try {

      const {
        username,
        password,
        passwordConfirm,
        phone,
        email
      } = req.body;

      if (
        !username ||
        !password ||
        !passwordConfirm
      ) {

        return res
          .status(400)
          .json({
            message:
              "نام کاربری، رمز عبور و تکرار رمز عبور الزامی است."
          });

      }

      const cleanUsername =
        String(username).trim();

      const cleanPhone =
        phone
          ? String(phone).trim()
          : null;

      const cleanEmail =
        email
          ? String(email)
              .trim()
              .toLowerCase()
          : null;

      if (
        cleanUsername.length < 3
      ) {

        return res
          .status(400)
          .json({
            message:
              "نام کاربری باید حداقل ۳ کاراکتر باشد."
          });

      }

      if (password.length < 4) {

        return res
          .status(400)
          .json({
            message:
              "رمز عبور باید حداقل ۴ کاراکتر باشد."
          });

      }

      if (
        password !==
        passwordConfirm
      ) {

        return res
          .status(400)
          .json({
            message:
              "رمز عبور و تکرار آن یکسان نیست."
          });

      }

      if (cleanEmail) {

        const emailPattern =
          /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (
          !emailPattern.test(
            cleanEmail
          )
        ) {

          return res
            .status(400)
            .json({
              message:
                "ایمیل واردشده معتبر نیست."
            });

        }

      }

      const usernameCheck =
        await pool.query(
          "SELECT id FROM users WHERE username = $1",
          [cleanUsername]
        );

      if (
        usernameCheck.rows.length > 0
      ) {

        return res
          .status(409)
          .json({
            message:
              "این نام کاربری قبلاً استفاده شده است."
          });

      }

      if (cleanPhone) {

        const phoneCheck =
          await pool.query(
            "SELECT id FROM users WHERE phone = $1",
            [cleanPhone]
          );

        if (
          phoneCheck.rows.length > 0
        ) {

          return res
            .status(409)
            .json({
              message:
                "این شماره تلفن قبلاً برای یک حساب استفاده شده است."
            });

        }

      }

      if (cleanEmail) {

        const emailCheck =
          await pool.query(
            "SELECT id FROM users WHERE email = $1",
            [cleanEmail]
          );

        if (
          emailCheck.rows.length > 0
        ) {

          return res
            .status(409)
            .json({
              message:
                "این ایمیل قبلاً برای یک حساب استفاده شده است."
            });

        }

      }

      const passwordHash =
        await bcrypt.hash(
          password,
          12
        );

      await pool.query(
        `
        INSERT INTO users
        (
          username,
          password_hash,
          phone,
          email
        )
        VALUES
        ($1, $2, $3, $4)
        `,
        [
          cleanUsername,
          passwordHash,
          cleanPhone,
          cleanEmail
        ]
      );

      return res
        .status(201)
        .json({
          message:
            "ثبت‌نام با موفقیت انجام شد. اکنون می‌توانید وارد شوید."
        });

    } catch (error) {

      console.error(
        "REGISTER ERROR:",
        error
      );

      return res
        .status(500)
        .json({
          message:
            "خطا در ثبت‌نام."
        });

    }

  }
);


/* =========================
   LOGIN API
========================= */

app.post(
  "/login",
  async (req, res) => {

    try {

      const {
        username,
        password
      } = req.body;

      if (!username || !password) {

        return res
          .status(400)
          .json({
            message:
              "نام کاربری و رمز عبور الزامی است."
          });

      }

      const result =
        await pool.query(
          `
          SELECT
            id,
            username,
            password_hash
          FROM users
          WHERE username = $1
          `,
          [String(username).trim()]
        );

      if (
        result.rows.length === 0
      ) {

        return res
          .status(401)
          .json({
            message:
              "نام کاربری یا رمز عبور اشتباه است."
          });

      }

      const user =
        result.rows[0];

      if (!user.password_hash) {

        return res
          .status(500)
          .json({
            message:
              "اطلاعات امنیتی این حساب کامل نیست."
          });

      }

      const validPassword =
        await bcrypt.compare(
          password,
          user.password_hash
        );

      if (!validPassword) {

        return res
          .status(401)
          .json({
            message:
              "نام کاربری یا رمز عبور اشتباه است."
          });

      }

      setUserSession(
        res,
        user
      );

      return res.json({

        success: true,

        username:
          user.username,

        message:
          `ورود با موفقیت انجام شد. خوش آمدید ${user.username}`

      });

    } catch (error) {

      console.error(
        "LOGIN ERROR:",
        error
      );

      return res
        .status(500)
        .json({
          message:
            "خطا در ورود."
        });

    }

  }
);


/* =========================
   CURRENT USER
========================= */

app.get(
  "/me",
  (req, res) => {

    const session =
      getSession(req);

    if (!session) {

      return res.json({
        loggedIn: false
      });

    }

    return res.json({

      loggedIn: true,

      username:
        session.username

    });

  }
);


/* =========================
   LOGOUT
========================= */

app.post(
  "/logout",
  (req, res) => {

    clearUserSession(res);

    return res.json({

      success: true,

      message:
        "با موفقیت از حساب خارج شدید."

    });

  }
);


/* =========================
   IDEAS API
========================= */

app.post(
  "/ideas",
  async (req, res) => {

    try {

      const {
        title,
        description,
        solution,
        category,
        participation_type,
        username
      } = req.body;

      if (
        !title ||
        !String(title).trim()
      ) {

        return res
          .status(400)
          .json({
            message:
              "عنوان ایده الزامی است."
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
          username
        )
        VALUES
        (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6
        )
        `,
        [
          String(title).trim(),
          description || "",
          solution || "",
          category || "",
          participation_type || "",
          username || ""
        ]
      );

      return res
        .status(201)
        .json({
          message:
            "ایده با موفقیت ثبت شد."
        });

    } catch (error) {

      console.error(
        "IDEA ERROR:",
        error
      );

      return res
        .status(500)
        .json({
          message:
            "خطا در ثبت ایده."
        });

    }

  }
);


/* =========================
   DATABASE TEST
========================= */

app.get(
  "/db-test",
  async (req, res) => {

    try {

      const result =
        await pool.query(
          "SELECT NOW() AS time"
        );

      res.json({

        success: true,

        database:
          "connected",

        time:
          result.rows[0].time

      });

    } catch (error) {

      console.error(
        "DB TEST ERROR:",
        error
      );

      res
        .status(500)
        .json({

          success: false,

          database:
            "error",

          message:
            error.message

        });

    }

  }
);


/* =========================
   ADMIN LOGIN PAGE
========================= */

app.get(
  "/admin",
  (req, res) => {

    if (
      getAdminSession(req)
    ) {

      return res.redirect(
        "/admin/panel"
      );

    }

    res.send(`
<!DOCTYPE html>

<html lang="fa" dir="rtl">

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width, initial-scale=1.0"
>

<title>CHIKAM Admin</title>

<style>

body {

  margin: 0;

  font-family:
    Tahoma,
    Arial,
    sans-serif;

  background:
    #f2f5f9;

  color:
    #182033;

}

.box {

  max-width:
    430px;

  margin:
    80px auto;

  background:
    white;

  padding:
    28px;

  border-radius:
    18px;

  box-shadow:
    0 12px 35px
    rgba(0,0,0,.08);

}

h1 {
  margin-top: 0;
}

input {

  width: 100%;

  padding: 13px;

  margin: 8px 0;

  box-sizing: border-box;

  border:
    1px solid #d8deea;

  border-radius: 10px;

  font-family: inherit;

}

button {

  width: 100%;

  margin-top: 10px;

  padding: 13px;

  border: 0;

  border-radius: 10px;

  background:
    #4767d9;

  color: white;

  font-weight: bold;

  cursor: pointer;

}

#message {

  margin-top: 12px;

  font-size: 13px;

  line-height: 1.8;

}

</style>

</head>

<body>

<div class="box">

<h1>
مدیریت چیکام
</h1>

<input
  id="adminUsername"
  type="text"
  placeholder="نام کاربری مدیر"
  autocomplete="username"
>

<input
  id="adminPassword"
  type="password"
  placeholder="رمز عبور مدیر"
  autocomplete="current-password"
>

<button
  onclick="adminLogin()"
>
ورود مدیر
</button>

<div id="message"></div>

</div>

<script>

async function adminLogin() {

  const username =
    document
      .getElementById(
        "adminUsername"
      )
      .value;

  const password =
    document
      .getElementById(
        "adminPassword"
      )
      .value;

  const message =
    document
      .getElementById(
        "message"
      );

  try {

    const response =
      await fetch(
        "/admin/login",
        {

          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify({
              username,
              password
            })

        }
      );

    const data =
      await response.json();

    message.textContent =
      data.message ||
      "عملیات انجام شد.";

    if (response.ok) {

      window.location.href =
        "/admin/panel";

    }

  } catch {

    message.textContent =
      "ارتباط با سرور برقرار نشد.";

  }

}

</script>

</body>

</html>
    `);

  }
);


/* =========================
   ADMIN LOGIN API
========================= */

app.post(
  "/admin/login",
  (req, res) => {

    const {
      username,
      password
    } = req.body;

    const adminUsername =
      process.env.ADMIN_USERNAME;

    const adminPassword =
      process.env.ADMIN_PASSWORD;

    if (
      username === adminUsername &&
      password === adminPassword
    ) {

      const token =
        createAdminToken();

      res.setHeader(
        "Set-Cookie",
        `chikam_admin=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=14400`
      );

      return res.json({

        success: true,

        message:
          "ورود مدیر موفق بود."

      });

    }

    return res
      .status(401)
      .json({

        success: false,

        message:
          "نام کاربری یا رمز عبور مدیر اشتباه است."

      });

  }
);


/* =========================
   ADMIN LOGOUT
========================= */

app.post(
  "/admin/logout",
  (req, res) => {

    res.setHeader(
      "Set-Cookie",
      "chikam_admin=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0"
    );

    return res.json({
      success: true
    });

  }
);


/* =========================
   ADMIN PANEL
========================= */

app.get(
  "/admin/panel",
  async (req, res) => {

    if (!getAdminSession(req)) {

      return res.redirect(
        "/admin"
      );

    }

    try {

      const users =
        await pool.query(
          "SELECT COUNT(*) FROM users"
        );

      const ideas =
        await pool.query(
          "SELECT COUNT(*) FROM ideas"
        );

      const ads =
        await pool.query(
          "SELECT COUNT(*) FROM ads"
        );

      res.send(`
<!DOCTYPE html>

<html lang="fa" dir="rtl">

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width, initial-scale=1.0"
>

<title>
CHIKAM Admin Panel
</title>

<style>

body {

  margin: 0;

  font-family:
    Tahoma,
    Arial,
    sans-serif;

  background:
    #f3f5f9;

  color:
    #172033;

}

.container {

  max-width:
    900px;

  margin:
    40px auto;

  padding:
    20px;

}

.top {

  display:
    flex;

  justify-content:
    space-between;

  align-items:
    center;

  gap:
    15px;

  margin-bottom:
    25px;

}

h1 {
  margin: 0;
}

.logout {

  background:
    #fceeee;

  color:
    #a33a3a;

  border:
    0;

  padding:
    10px 16px;

  border-radius:
    10px;

  cursor:
    pointer;

  font-family:
    inherit;

  font-weight:
    bold;

}

.grid {

  display:
    grid;

  grid-template-columns:
    repeat(3, 1fr);

  gap:
    15px;

}

.card {

  background:
    white;

  border-radius:
    16px;

  padding:
    25px;

  text-align:
    center;

  box-shadow:
    0 8px 25px
    rgba(0,0,0,.06);

}

.number {

  font-size:
    32px;

  font-weight:
    bold;

  margin-top:
    10px;

}

@media(max-width:700px) {

  .grid {

    grid-template-columns:
      1fr;

  }

  .top {

    align-items:
      flex-start;

  }

}

</style>

</head>

<body>

<div class="container">

<div class="top">

<h1>
پنل مدیریت چیکام
</h1>

<button
  class="logout"
  onclick="adminLogout()"
>
خروج مدیر
</button>

</div>

<div class="grid">

<div class="card">

کاربران

<div class="number">
${users.rows[0].count}
</div>

</div>

<div class="card">

ایده‌ها

<div class="number">
${ideas.rows[0].count}
</div>

</div>

<div class="card">

تبلیغات

<div class="number">
${ads.rows[0].count}
</div>

</div>

</div>

</div>

<script>

async function adminLogout() {

  await fetch(
    "/admin/logout",
    {
      method: "POST"
    }
  );

  window.location.href =
    "/admin";

}

</script>

</body>

</html>
      `);

    } catch (error) {

      console.error(
        "ADMIN PANEL ERROR:",
        error
      );

      res
        .status(500)
        .send(
          "خطا در بارگذاری پنل مدیریت."
        );

    }

  }
);


/* =========================
   HTML ESCAPE
========================= */

function escapeHTML(value) {

  return String(value ?? "")
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&#039;"
    );

}


/* =========================
   START SERVER
========================= */

async function startServer() {

  try {

    await initDatabase();

    app.listen(
      PORT,
      "0.0.0.0",
      () => {

        console.log(
          `CHIKAM SERVER RUNNING ON PORT ${PORT}`
        );

      }
    );

  } catch (error) {

    console.error(
      "SERVER START ERROR:",
      error
    );

    process.exit(1);

  }

}

startServer();
