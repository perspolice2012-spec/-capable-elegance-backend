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
  res.setHeader(
    "Referrer-Policy",
    "strict-origin-when-cross-origin"
  );
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()"
  );
  next();
});

/* =========================
   DATABASE
========================= */

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
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

  return payload + "." + signature;
}

function verifySessionToken(token) {
  try {
    if (!token) {
      return null;
    }

    const parts = token.split(".");

    if (parts.length !== 2) {
      return null;
    }

    const payload = parts[0];
    const signature = parts[1];

    const expectedSignature = crypto
      .createHmac("sha256", SESSION_SECRET)
      .update(payload)
      .digest("base64url");

    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (
      signatureBuffer.length !==
      expectedBuffer.length
    ) {
      return null;
    }

    if (
      !crypto.timingSafeEqual(
        signatureBuffer,
        expectedBuffer
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
    "chikam_session=" +
      encodeURIComponent(token) +
      "; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800"
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

  return payload + "." + signature;
}

function verifyAdminToken(token) {
  try {
    if (!token) {
      return false;
    }

    const parts = token.split(".");

    if (parts.length !== 2) {
      return false;
    }

    const payload = parts[0];
    const signature = parts[1];

    const expected = crypto
      .createHmac("sha256", SESSION_SECRET)
      .update(payload)
      .digest("base64url");

    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);

    if (
      signatureBuffer.length !==
      expectedBuffer.length
    ) {
      return false;
    }

    if (
      !crypto.timingSafeEqual(
        signatureBuffer,
        expectedBuffer
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

  font-family:
    Tahoma,
    Arial,
    sans-serif;

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
  background:
    rgba(255,255,255,.95);

  border-bottom:
    1px solid #e3e7ef;

  padding:
    14px 22px;

  position:
    sticky;

  top: 0;

  z-index: 10;

  backdrop-filter:
    blur(12px);
}

.header-inner {
  max-width:
    1150px;

  margin:
    auto;

  display:
    flex;

  justify-content:
    space-between;

  align-items:
    center;
}

.logo {
  font-size:
    22px;

  font-weight:
    800;

  letter-spacing:
    .5px;
}

.logo span {
  color:
    #4767d9;
}

.header-actions {
  display:
    flex;

  align-items:
    center;

  gap:
    10px;
}

.header-link {
  color:
    #5c667a;

  text-decoration:
    none;

  font-size:
    13px;
}

.user-status {
  display:
    none;

  align-items:
    center;

  gap:
    8px;

  background:
    #edf7f0;

  color:
    #24733d;

  border-radius:
    20px;

  padding:
    7px 12px;

  font-size:
    12px;
}

.logout-small {
  display:
    none;

  background:
    #f2f4f8;

  color:
    #3e4a60;

  padding:
    8px 13px;

  border-radius:
    10px;

  font-size:
    12px;
}

.hero {
  max-width:
    1150px;

  margin:
    35px auto 20px;

  padding:
    42px 25px;

  border-radius:
    24px;

  background:
    linear-gradient(
      135deg,
      rgba(65,91,180,.96),
      rgba(88,116,220,.88)
    );

  color:
    white;

  text-align:
    center;

  box-shadow:
    0 18px 45px
    rgba(45,65,130,.18);
}

.hero h1 {
  margin:
    0 0 12px;

  font-size:
    clamp(28px, 5vw, 44px);
}

.hero p {
  margin:
    0;

  opacity:
    .92;

  font-size:
    17px;
}

.container {
  max-width:
    1150px;

  margin:
    auto;

  padding:
    0 18px 50px;
}

.grid {
  display:
    grid;

  grid-template-columns:
    repeat(2, minmax(0, 1fr));

  gap:
    20px;
}

.card {
  background:
    rgba(255,255,255,.96);

  border:
    1px solid #e2e7f0;

  border-radius:
    20px;

  padding:
    24px;

  box-shadow:
    0 10px 30px
    rgba(25,35,60,.06);
}

.card.full {
  grid-column:
    1 / -1;
}

.card h2 {
  margin-top:
    0;

  font-size:
    20px;
}

.subtitle {
  color:
    #727b8d;

  font-size:
    13px;

  margin-top:
    -6px;

  margin-bottom:
    18px;

  line-height:
    1.8;
}

input,
textarea,
select {
  width:
    100%;

  border:
    1px solid #d9dfeb;

  background:
    #fbfcfe;

  border-radius:
    12px;

  padding:
    13px 14px;

  margin-bottom:
    12px;

  font-family:
    inherit;

  font-size:
    14px;

  outline:
    none;
}

input:focus,
textarea:focus,
select:focus {
  border-color:
    #637fe4;

  box-shadow:
    0 0 0 3px
    rgba(99,127,228,.10);
}

textarea {
  min-height:
    105px;

  resize:
    vertical;
}

.password-wrap {
  position:
    relative;
}

.password-wrap input {
  padding-left:
    50px;
}

.eye {
  position:
    absolute;

  left:
    10px;

  top:
    7px;

  width:
    38px;

  height:
    38px;

  border:
    none;

  background:
    transparent;

  cursor:
    pointer;

  font-size:
    20px;

  padding:
    0;

  color:
    #4f5d75;
}

.eye:hover {
  background:
    #edf1f8;

  border-radius:
    9px;
}

.buttons {
  display:
    flex;

  gap:
    10px;

  flex-wrap:
    wrap;
}

button {
  border:
    none;

  border-radius:
    11px;

  padding:
    12px 20px;

  cursor:
    pointer;

  font-family:
    inherit;

  font-weight:
    700;
}

.primary {
  background:
    #4767d9;

  color:
    white;
}

.secondary {
  background:
    #edf1f8;

  color:
    #34405a;
}

.danger {
  background:
    #fceeee;

  color:
    #a33a3a;
}

button:hover {
  opacity:
    .9;
}

.message {
  margin-top:
    12px;

  min-height:
    20px;

  font-size:
    13px;

  color:
    #566176;

  line-height:
    1.8;
}

.logged-message {
  display:
    none;

  background:
    #f1f8f3;

  border:
    1px solid #d8eadc;

  color:
    #2d6840;

  padding:
    12px;

  border-radius:
    12px;

  margin-bottom:
    14px;

  font-size:
    13px;
}

.ad-box {
  border:
    1px dashed #c8cfdd;

  background:
    rgba(255,255,255,.65);

  border-radius:
    16px;

  min-height:
    90px;

  display:
    flex;

  align-items:
    center;

  justify-content:
    center;

  color:
    #8a93a4;

  margin-bottom:
    20px;
}

.idea-card {
  background:
    #fafbfe;

  border:
    1px solid #e3e7ef;

  border-radius:
    15px;

  padding:
    18px;

  margin-bottom:
    12px;
}

.idea-card h3 {
  margin:
    0 0 12px;
}

.idea-card p
