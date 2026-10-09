
import express from "express";
import { Pool } from "pg";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const app = express();
const PORT = Number(process.env.PORT || 8080);
const DATABASE_URL = process.env.DATABASE_URL;
const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  crypto.randomBytes(32).toString("hex");

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

const pool = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 5
    })
  : null;

function parseCookies(req) {
  const result = {};
  for (const part of (req.headers.cookie || "").split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    try {
      result[key] = decodeURIComponent(value);
    } catch {
      result[key] = value;
    }
  }
  return result;
}

function safeEqual(a, b) {
  const aa = Buffer.from(String(a || ""));
  const bb = Buffer.from(String(b || ""));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function sign(value) {
  return crypto.createHmac("sha256", SESSION_SECRET)
    .update(value).digest("hex");
}

function createToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return body + "." + sign(body);
}

function verifyToken(token) {
  try {
    if (!token || !token.includes(".")) return null;
    const index = token.lastIndexOf(".");
    const body = token.slice(0, index);
    const signature = token.slice(index + 1);
    if (!safeEqual(signature, sign(body))) return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function setCookie(res, name, value, maxAge, sameSite = "Lax") {
  res.setHeader(
    "Set-Cookie",
    `${name}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=${sameSite}`
  );
}

function clearCookie(res, name, sameSite = "Lax") {
  res.setHeader(
    "Set-Cookie",
    `${name}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=${sameSite}`
  );
}

function getUser(req) {
  return verifyToken(parseCookies(req).chikam_session);
}

function getAdmin(req) {
  return verifyToken(parseCookies(req).chikam_admin);
}

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

    ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(30);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
    ALTER TABLE ideas ADD COLUMN IF NOT EXISTS username VARCHAR(100);
  `);
}

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "capable-elegance",
    time: new Date().toISOString()
  });
});

app.get("/db-test", async (req, res) => {
  if (!pool) {
    return res.status(500).json({
      ok: false,
      error: "DATABASE_URL is missing"
    });
  }
  try {
    const result = await pool.query("SELECT NOW() AS now");
    res.json({ ok: true, database: "connected", now: result.rows[0].now });
  } catch (error) {
    console.error("DB TEST ERROR:", error);
    res.status(500).json({
      ok: false,
      error: "Database connection failed"
    });
  }
});

app.post("/register", async (req, res) => {
  try {
    if (!pool) {
      return res.status(500).json({
        ok: false,
        message: "Database is not configured."
      });
    }

    const username = String(req.body.username || "").trim();
    const password = String(req.body.password || "");
    const confirmPassword = String(req.body.confirmPassword || "");
    const phone = String(req.body.phone || "").trim() || null;
    const email = String(req.body.email || "").trim().toLowerCase() || null;

    if (username.length < 3 || username.length > 100) {
      return res.status(400).json({
        ok: false,
        message: "نام کاربری باید بین ۳ تا ۱۰۰ کاراکتر باشد."
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        ok: false,
        message: "رمز عبور باید حداقل ۶ کاراکتر باشد."
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({
        ok: false,
        message: "تکرار رمز عبور یکسان نیست."
      });
    }

    const duplicate = await pool.query(
      `SELECT username, phone, email FROM users
       WHERE LOWER(username) = LOWER($1)
       OR ($2::text IS NOT NULL AND phone = $2)
       OR ($3::text IS NOT NULL AND LOWER(email) = LOWER($3))
       LIMIT 1`,
      [username, phone, email]
    );

    if (duplicate.rows.length) {
      const row = duplicate.rows[0];

      if (String(row.username).toLowerCase() === username.toLowerCase()) {
        return res.status(409).json({
          ok: false,
          message: "این نام کاربری قبلاً استفاده شده است."
        });
      }

      if (phone && row.phone === phone) {
        return res.status(409).json({
          ok: false,
          message: "این شماره تلفن قبلاً برای یک حساب ثبت شده است."
        });
      }

      return res.status(409).json({
        ok: false,
        message: "این ایمیل قبلاً ثبت شده است."
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      `INSERT INTO users (username, password_hash, phone, email)
       VALUES ($1, $2, $3, $4)
       RETURNING id, username, phone, email, created_at`,
      [username, passwordHash, phone, email]
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

app.post("/login", async (req, res) => {
  try {
    if (!pool) {
      return res.status(500).json({
        ok: false,
        message: "Database is not configured."
      });
    }

    const username = String(req.body.username || "").trim();
    const password = String(req.body.password || "");

    if (!username || !password) {
      return res.status(400).json({
        ok: false,
        message: "نام کاربری و رمز عبور را وارد کنید."
      });
    }

    const result = await pool.query(
      `SELECT id, username, password_hash FROM users
       WHERE LOWER(username) = LOWER($1) LIMIT 1`,
      [username]
    );

    if (!result.rows.length) {
      return res.status(401).json({
        ok: false,
        message: "نام کاربری یا رمز عبور اشتباه است."
      });
    }

    const user = result.rows[0];
    const valid = user.password_hash
      ? await bcrypt.compare(password, user.password_hash)
      : false;

    if (!valid) {
      return res.status(401).json({
        ok: false,
        message: "نام کاربری یا رمز عبور اشتباه است."
      });
    }

    const token = createToken({
      type: "user",
      id: user.id,
      username: user.username,
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000
    });

    setCookie(res, "chikam_session", token, 7 * 24 * 60 * 60);
    res.json({
      ok: true,
      message: "ورود موفق بود.",
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

app.get("/me", (req, res) => {
  const user = getUser(req);
  if (!user) return res.json({ loggedIn: false });
  res.json({ loggedIn: true, username: user.username });
});

app.post("/logout", (req, res) => {
  clearCookie(res, "chikam_session");
  res.json({ ok: true });
});

app.get("/ideas", async (req, res) => {
  try {
    if (!pool) {
      return res.status(500).json({
        ok: false,
        message: "Database is not configured."
      });
    }

    const result = await pool.query(`
      SELECT id, title, description, solution, category,
             participation_type, username, created_at
      FROM ideas
      ORDER BY id DESC
      LIMIT 100
    `);

    res.json({ ok: true, ideas: result.rows });
  } catch (error) {
    console.error("IDEAS GET ERROR:", error);
    res.status(500).json({
      ok: false,
      message: "خطا در دریافت ایده‌ها."
    });
  }
});

app.post("/ideas", async (req, res) => {
  try {
    if (!pool) {
      return res.status(500).json({
        ok: false,
        message: "Database is not configured."
      });
    }

    const user = getUser(req);
    if (!user) {
      return res.status(401).json({
        ok: false,
        message: "برای ثبت ایده ابتدا وارد حساب شوید."
      });
    }

    const title = String(req.body.title || "").trim();
    const description = String(req.body.description || "").trim();
    const solution = String(req.body.solution || "").trim();
    const category = String(req.body.category || "").trim();
    const participationType =
      String(req.body.participationType || "").trim();

    if (!title) {
      return res.status(400).json({
        ok: false,
        message: "عنوان ایده را وارد کنید."
      });
    }

    const result = await pool.query(
      `INSERT INTO ideas
       (title, description, solution, category, participation_type, username)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        title,
        description,
        solution,
        category,
        participationType,
        user.username
      ]
    );

    res.status(201).json({
      ok: true,
      message: "ایده با موفقیت ثبت شد.",
      idea: result.rows[0]
    });
  } catch (error) {
    console.error("IDEAS POST ERROR:", error);
    res.status(500).json({
      ok: false,
      message: "خطا در ثبت ایده."
    });
  }
});

app.post("/admin/login", (req, res) => {
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "");

  if (!ADMIN_PASSWORD) {
    return res.status(503).json({
      ok: false,
      message: "ADMIN_PASSWORD در Railway تنظیم نشده است."
    });
  }

  if (
    !safeEqual(username, ADMIN_USERNAME) ||
    !safeEqual(password, ADMIN_PASSWORD)
  ) {
    return res.status(401).json({
      ok: false,
      message: "اطلاعات مدیریت صحیح نیست."
    });
  }

  const token = createToken({
    type: "admin",
    username: ADMIN_USERNAME,
    exp: Date.now() + 4 * 60 * 60 * 1000
  });

  setCookie(res, "chikam_admin", token, 4 * 60 * 60, "Strict");
  res.json({ ok: true });
});

app.post("/admin/logout", (req, res) => {
  clearCookie(res, "chikam_admin", "Strict");
  res.json({ ok: true });
});

app.get("/admin/panel", async (req, res) => {
  try {
    const admin = getAdmin(req);
    if (!admin || admin.type !== "admin") {
      return res.status(401).json({
        ok: false,
        message: "Unauthorized"
      });
    }

    if (!pool) {
      return res.status(500).json({
        ok: false,
        message: "Database is not configured."
      });
    }

    const [users, ideas, ads] = await Promise.all([
      pool.query(`
        SELECT id, username, phone, email, created_at
        FROM users ORDER BY id DESC LIMIT 500
      `),
      pool.query(`
        SELECT id, title, category, participation_type, username, created_at
        FROM ideas ORDER BY id DESC LIMIT 500
      `),
      pool.query(`
        SELECT id, title, description, username, created_at
        FROM ads ORDER BY id DESC LIMIT 200
      `)
    ]);

    res.json({
      ok: true,
      users: users.rows,
      ideas: ideas.rows,
      ads: ads.rows
    });
  } catch (error) {
    console.error("ADMIN PANEL ERROR:", error);
    res.status(500).json({
      ok: false,
      message: "خطا در پنل مدیریت."
    });
  }
});

function page() {
  return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="چیکام؛ هر ایده آغاز یک مسیر">
<title>چیکام | هر ایده آغاز یک مسیر</title>
<style>
:root {
  --bg:#07111f;
  --card:#0d1b2d;
  --line:#203751;
  --text:#eef6ff;
  --muted:#9fb2c7;
  --green:#31d07c;
  --green2:#18a85d;
  --danger:#ff6675;
}
* { box-sizing:border-box; }
body {
  margin:0;
  font-family:Tahoma,Arial,sans-serif;
  background:radial-gradient(circle at 50% -10%,#163858 0,#07111f 45%);
  color:var(--text);
  line-height:1.8;
}
a { color:inherit; text-decoration:none; }
.wrap { width:min(1120px,92%); margin:auto; }
.top {
  position:sticky; top:0; z-index:10;
  background:rgba(7,17,31,.92);
  border-bottom:1px solid rgba(255,255,255,.07);
}
.nav {
  min-height:72px; display:flex; align-items:center;
  justify-content:space-between; gap:15px;
}
.brand { display:flex; align-items:center; gap:10px; font-weight:bold; font-size:22px; }
.logo {
  width:42px; height:42px; border-radius:13px;
  display:grid; place-items:center;
  background:linear-gradient(135deg,var(--green),#55f0aa);
  color:#062015; font-size:25px;
}
.nav-actions { display:flex; align-items:center; flex-wrap:wrap; gap:7px; }
.btn {
  border:1px solid var(--line); background:#0b1828; color:var(--text);
  border-radius:12px; padding:9px 14px; cursor:pointer; font:inherit;
}
.btn.primary {
  background:linear-gradient(135deg,var(--green),var(--green2));
  border:0; color:#03150c; font-weight:bold;
}
.hero { padding:65px 0 35px; text-align:center; }
.hero h1 { font-size:clamp(32px,6vw,60px); margin:0 0 12px; }
.hero p { color:var(--muted); font-size:18px; max-width:720px; margin:0 auto 25px; }
.glow { color:var(--green); }
.grid { display:grid; grid-template-columns:1fr 1fr; gap:22px; }
.card {
  background:linear-gradient(180deg,rgba(16,36,58,.97),rgba(10,25,42,.97));
  border:1px solid var(--line); border-radius:22px; padding:23px;
  box-shadow:0 18px 50px rgba(0,0,0,.2);
}
.wide { grid-column:1/-1; }
.card h2 { margin-top:0; }
.label { display:block; color:#cbd9e8; font-size:14px; margin:12px 0 6px; }
input,textarea,select {
  width:100%; border:1px solid #29435e; background:#081523;
  color:var(--text); border-radius:12px; padding:12px;
  font:inherit; outline:none;
}
textarea { min-height:110px; resize:vertical; }
input:focus,textarea:focus,select:focus { border-color:var(--green); }
.password { position:relative; }
.password input { padding-left:48px; }
.eye {
  position:absolute; left:7px; top:7px; height:40px; width:40px;
  border:0; background:transparent; color:#9fb2c7; cursor:pointer;
}
.row { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
.note,.meta { color:var(--muted); font-size:13px; }
.msg { margin-top:12px; min-height:25px; color:var(--muted); }
.msg.ok { color:var(--green); }
.msg.err { color:var(--danger); }
.idea { border-top:1px solid var(--line); padding:17px 0; }
.idea:first-child { border-top:0; }
.idea h3 { margin:0 0 5px; }
.tag {
  display:inline-block; border:1px solid #31506e;
  border-radius:999px; padding:2px 9px; margin:5px 0;
  color:#b8cadc; font-size:12px;
}
.ad {
  min-height:85px; display:grid; place-items:center;
  border:1px dashed #31506e; border-radius:18px;
  color:#9fb2c7; margin:18px 0;
}
.hidden { display:none!important; }
.modal {
  position:fixed; inset:0; background:rgba(0,0,0,.75);
  display:grid; place-items:center; padding:18px; z-index:30;
}
.modalbox { width:min(520px,100%); max-height:92vh; overflow:auto; }
.close { float:left; }
.footer {
  margin-top:45px; padding:30px 0;
  border-top:1px solid var(--line); color:var(--muted);
}
.footergrid { display:grid; grid-template-columns:2fr 1fr 1fr; gap:25px; }
.small { font-size:12px; }
@media(max-width:760px) {
  .grid,.footergrid,.row { grid-template-columns:1fr; }
  .wide { grid-column:auto; }
  .nav { padding:9px 0; }
  .hero { padding-top:40px; }
  .card { padding:18px; }
  .brand { font-size:19px; }
  .nav-actions .btn { padding:7px 9px; font-size:12px; }
}
</style>
</head>
<body>
<header class="top">
  <div class="wrap nav">
    <a class="brand" href="/"><span class="logo">✳</span><span>چیکام</span></a>
    <div class="nav-actions">
      <span id="navUser" class="note"></span>
      <button type="button" class="btn" onclick="openRegister()">ثبت‌نام</button>
      <button type="button" class="btn primary" id="loginBtn" onclick="openLogin()">ورود</button>
      <button type="button" class="btn hidden" id="logoutBtn" onclick="logout()">خروج</button>
      <button type="button" class="btn" onclick="openAdmin()">مدیریت</button>
    </div>
  </div>
</header>

<main class="wrap">
  <section class="hero">
    <h1>هر ایده <span class="glow">آغاز یک مسیر</span></h1>
    <p>چیکام محیطی برای ثبت ایده، پیدا کردن همراه و تبدیل فکرهای خوب به مسیرهای واقعی است.</p>
    <button type="button" class="btn primary" onclick="focusIdea()">شروع یک ایده</button>
  </section>

  <div class="ad">📢 تبلیغات کاربران — فضای معرفی و همکاری</div>

  <section class="grid">
    <div class="card" id="ideaCard">
      <h2>ثبت یک ایده</h2>
      <p class="note">برای ثبت ایده باید وارد حساب کاربری باشید.</p>
      <label class="label" for="ideaTitle">عنوان ایده</label>
      <input id="ideaTitle" placeholder="عنوان کوتاه و روشن ایده">
      <label class="label" for="ideaDescription">توضیحات تکمیلی</label>
      <textarea id="ideaDescription" placeholder="مشکل، هدف، راه‌حل پیشنهادی، مراحل اجرا و نیازمندی‌ها"></textarea>
      <label class="label" for="ideaSolution">راه‌حل یا پیشنهاد</label>
      <textarea id="ideaSolution" placeholder="راه‌حل یا پیشنهاد شما"></textarea>
      <div class="row">
        <div>
          <label class="label" for="ideaCategory">دسته‌بندی</label>
          <input id="ideaCategory" placeholder="مثلاً فناوری، کسب‌وکار، آموزش">
        </div>
        <div>
          <label class="label" for="participationType">نوع مشارکت</label>
          <select id="participationType">
            <option value="">نوع مشارکت را انتخاب کنید</option>
            <option value="همکاری">همکاری</option>
            <option value="سرمایه‌گذاری">سرمایه‌گذاری</option>
            <option value="ارائه تخصص">ارائه تخصص</option>
            <option value="ایده و پیشنهاد">ایده و پیشنهاد</option>
          </select>
        </div>
      </div>
      <button type="button" class="btn primary" style="margin-top:15px" onclick="submitIdea()">ثبت ایده</button>
      <div id="ideaMessage" class="msg"></div>
    </div>

    <div class="card">
      <h2>درباره چیکام</h2>
      <p>چیکام فقط محلی برای نمایش ایده‌ها نیست. هدف این است که هر ایده بتواند مسیر خودش را پیدا کند، همراه مناسب جذب کند و مرحله‌به‌مرحله رشد کند.</p>
      <p class="note">هر ایده آغاز یک مسیر است؛ چیکام تلاش می‌کند این مسیر را منظم‌تر، قابل مشاهده‌تر و قابل توسعه‌تر کند.</p>
    </div>

    <div class="card wide">
      <h2>ایده‌های اخیر</h2>
      <div id="ideasList"><p class="note">در حال دریافت ایده‌ها...</p></div>
    </div>
  </section>
</main>

<footer class="footer">
  <div class="wrap footergrid">
    <div><div class="brand"><span class="logo">✳</span><span>چیکام</span></div><p>هر ایده آغاز یک مسیر.</p></div>
    <div><b>شبکه‌های اجتماعی</b><p class="small">پس از مشخص شدن حساب‌های رسمی، لینک‌ها قرار می‌گیرند.</p></div>
    <div><b>اطلاعات</b><p class="small">درباره ما</p><p class="small">حریم خصوصی</p><p class="small">شرایط استفاده</p></div>
  </div>
</footer>

<div id="modal" class="modal hidden">
  <div class="card modalbox">
    <button type="button" class="btn close" onclick="closeModal()">بستن</button>
    <div id="modalContent"></div>
  </div>
</div>
`;
}

<script>
function byId(id) {
  return document.getElementById(id);
}

function showModal(html) {
  byId("modalContent").innerHTML = html;
  byId("modal").classList.remove("hidden");
}

function closeModal() {
  byId("modal").classList.add("hidden");
}

function togglePassword(id) {
  var input = byId(id);
  if (input) {
    input.type = input.type === "password" ? "text" : "password";
  }
}

function openRegister() {
  showModal(`
    <h2>ایجاد حساب چیکام</h2>
    <p class="note">نام کاربری و رمز عبور الزامی است. شماره تلفن و ایمیل اختیاری هستند.</p>
    <label class="label">نام کاربری</label>
    <input id="rUser" autocomplete="username">
    <label class="label">رمز عبور</label>
    <div class="password">
      <input id="rPass" type="password" autocomplete="new-password">
      <button type="button" class="eye" onclick="togglePassword('rPass')">◉</button>
    </div>
    <label class="label">تکرار رمز عبور</label>
    <div class="password">
      <input id="rConfirm" type="password" autocomplete="new-password">
      <button type="button" class="eye" onclick="togglePassword('rConfirm')">◉</button>
    </div>
    <label class="label">شماره تلفن (اختیاری)</label>
    <input id="rPhone" autocomplete="tel">
    <label class="label">ایمیل (اختیاری)</label>
    <input id="rEmail" type="email" autocomplete="email">
    <button type="button" class="btn primary" onclick="registerUser()">ایجاد حساب</button>
    <div id="rMsg" class="msg"></div>
  `);
}

function openLogin() {
  showModal(`
    <h2>ورود به چیکام</h2>
    <label class="label">نام کاربری</label>
    <input id="lUser" autocomplete="username">
    <label class="label">رمز عبور</label>
    <div class="password">
      <input id="lPass" type="password" autocomplete="current-password">
      <button type="button" class="eye" onclick="togglePassword('lPass')">◉</button>
    </div>
    <button type="button" class="btn primary" onclick="loginUser()">ورود</button>
    <div id="lMsg" class="msg"></div>
  `);
}

function openAdmin() {
  showModal(`
    <h2>ورود مدیریت</h2>
    <label class="label">نام کاربری مدیریت</label>
    <input id="aUser" autocomplete="username">
    <label class="label">رمز مدیریت</label>
    <div class="password">
      <input id="aPass" type="password" autocomplete="current-password">
      <button type="button" class="eye" onclick="togglePassword('aPass')">◉</button>
    </div>
    <button type="button" class="btn primary" onclick="adminLogin()">ورود مدیریت</button>
    <div id="aMsg" class="msg"></div>
  `);
}

async function registerUser() {
  var msg = byId("rMsg");
  msg.className = "msg";
  msg.textContent = "در حال ثبت...";

  try {
    var response = await fetch("/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: byId("rUser").value,
        password: byId("rPass").value,
        confirmPassword: byId("rConfirm").value,
        phone: byId("rPhone").value,
        email: byId("rEmail").value
      })
    });

    var data = await response.json();
    msg.textContent = data.message || "";
    msg.className = response.ok ? "msg ok" : "msg err";

    if (response.ok) {
      setTimeout(openLogin, 700);
    }
  } catch (error) {
    console.error("REGISTER CLIENT ERROR:", error);
    msg.textContent = "ارتباط با سرور برقرار نشد.";
    msg.className = "msg err";
  }
}

async function loginUser() {
  var msg = byId("lMsg");
  msg.className = "msg";
  msg.textContent = "در حال ورود...";

  try {
    var response = await fetch("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: byId("lUser").value,
        password: byId("lPass").value
      })
    });

    var data = await response.json();
    msg.textContent = data.message || "";
    msg.className = response.ok ? "msg ok" : "msg err";

    if (response.ok) {
      closeModal();
      await refreshMe();
    }
  } catch (error) {
    console.error("LOGIN CLIENT ERROR:", error);
    msg.textContent = "ارتباط با سرور برقرار نشد.";
    msg.className = "msg err";
  }
}

async function logout() {
  try {
    await fetch("/logout", { method: "POST" });
  } finally {
    refreshMe();
  }
}

async function refreshMe() {
  try {
    var response = await fetch("/me");
    var data = await response.json();

    byId("navUser").textContent =
      data.loggedIn ? "سلام، " + data.username : "";

    byId("loginBtn").classList.toggle("hidden", !!data.loggedIn);
    byId("logoutBtn").classList.toggle("hidden", !data.loggedIn);
  } catch (error) {
    console.error("ME ERROR:", error);
  }
}

async function submitIdea() {
  var msg = byId("ideaMessage");
  msg.className = "msg";
  msg.textContent = "در حال ثبت...";

  try {
    var response = await fetch("/ideas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: byId("ideaTitle").value,
        description: byId("ideaDescription").value,
        solution: byId("ideaSolution").value,
        category: byId("ideaCategory").value,
        participationType: byId("participationType").value
      })
    });

    var data = await response.json();
    msg.textContent = data.message || "";
    msg.className = response.ok ? "msg ok" : "msg err";

    if (response.ok) {
      byId("ideaTitle").value = "";
      byId("ideaDescription").value = "";
      byId("ideaSolution").value = "";
      byId("ideaCategory").value = "";
      byId("participationType").value = "";
      loadIdeas();
    }
  } catch (error) {
    console.error("SUBMIT IDEA ERROR:", error);
    msg.textContent = "ارتباط با سرور برقرار نشد.";
    msg.className = "msg err";
  }
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, function(character) {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[character];
  });
}

async function loadIdeas() {
  var box = byId("ideasList");

  try {
    var response = await fetch("/ideas");
    var data = await response.json();

    if (!data.ok || !data.ideas || !data.ideas.length) {
      box.innerHTML = '<p class="note">هنوز ایده‌ای ثبت نشده است.</p>';
      return;
    }

    box.innerHTML = data.ideas.map(function(idea) {
      var category = idea.category
        ? '<span class="tag">' + escapeHtml(idea.category) + '</span> '
        : "";

      var participation = idea.participation_type
        ? '<span class="tag">' + escapeHtml(idea.participation_type) + '</span>'
        : "";

      var description = idea.description
        ? "<p>" + escapeHtml(idea.description) + "</p>"
        : "";

      return '<article class="idea">' +
        "<h3>" + escapeHtml(idea.title) + "</h3>" +
        '<div class="meta">' +
        escapeHtml(idea.username || "کاربر چیکام") +
        " · " + new Date(idea.created_at).toLocaleString("fa-IR") +
        "</div>" + category + participation + description +
        "</article>";
    }).join("");
  } catch (error) {
    console.error("IDEAS ERROR:", error);
    box.innerHTML = '<p class="msg err">دریافت ایده‌ها ممکن نشد.</p>';
  }
}

async function adminLogin() {
  var msg = byId("aMsg");
  msg.className = "msg";
  msg.textContent = "در حال ورود...";

  try {
    var response = await fetch("/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: byId("aUser").value,
        password: byId("aPass").value
      })
    });

    var data = await response.json();

    if (!response.ok) {
      msg.textContent = data.message || "خطا";
      msg.className = "msg err";
      return;
    }

    window.location.href = "/admin";
  } catch (error) {
    console.error("ADMIN LOGIN ERROR:", error);
    msg.textContent = "ارتباط با سرور برقرار نشد.";
    msg.className = "msg err";
  }
}

function focusIdea() {
  byId("ideaCard").scrollIntoView({ behavior: "smooth" });
}

byId("modal").addEventListener("click", function(event) {
  if (event.target === byId("modal")) closeModal();
});

refreshMe();
loadIdeas();
</script>
</body>
</html>`;
}

app.get("/", (req, res) => {
  res.type("html").send(page());
});

app.get("/admin", (req, res) => {
  const admin = getAdmin(req);
  if (!admin || admin.type !== "admin") return res.redirect("/");

  res.type("html").send(`<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>مدیریت چیکام</title>
<style>
body{margin:0;background:#07111f;color:#eef6ff;font-family:Tahoma,Arial;padding:20px}
.box{max-width:1100px;margin:auto;background:#0d1b2d;border:1px solid #203751;border-radius:20px;padding:20px;overflow:auto}
table{width:100%;border-collapse:collapse;margin:20px 0}
th,td{padding:9px;border-bottom:1px solid #203751;text-align:right}
button{background:#31d07c;border:0;padding:10px 15px;border-radius:10px;cursor:pointer}
</style>
</head>
<body>
<div class="box">
<h1>پنل مدیریت چیکام</h1>
<button type="button" onclick="logoutAdmin()">خروج</button>
<div id="data">در حال دریافت اطلاعات...</div>
</div>
<script>
async function logoutAdmin(){
  await fetch("/admin/logout",{method:"POST"});
  location.href="/";
}
function escapeAdmin(value){
  return String(value==null?"":value).replace(/[&<>"']/g,function(c){
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c];
  });
}
function createTable(rows,keys){
  if(!rows.length)return "<p>موردی وجود ندارد.</p>";
  return "<table><tr>"+keys.map(function(k){return "<th>"+escapeAdmin(k)+"</th>";}).join("")+"</tr>"+
    rows.map(function(row){
      return "<tr>"+keys.map(function(k){return "<td>"+escapeAdmin(row[k])+"</td>";}).join("")+"</tr>";
    }).join("")+"</table>";
}
async function loadAdmin(){
  try{
    var response=await fetch("/admin/panel");
    if(!response.ok){location.href="/";return;}
    var data=await response.json();
    document.getElementById("data").innerHTML=
      "<h2>کاربران ("+data.users.length+")</h2>"+
      createTable(data.users,["id","username","phone","email","created_at"])+
      "<h2>ایده‌ها ("+data.ideas.length+")</h2>"+
      createTable(data.ideas,["id","title","category","participation_type","username","created_at"])+
      "<h2>تبلیغات ("+data.ads.length+")</h2>"+
      createTable(data.ads,["id","title","username","created_at"]);
  }catch(error){
    console.error("ADMIN PAGE ERROR:",error);
    document.getElementById("data").textContent="دریافت اطلاعات مدیریت انجام نشد.";
  }
}
loadAdmin();
</script>
</body>
</html>`);
});

app.use((req, res) => {
  res.status(404).json({ ok: false, message: "Not found" });
});

async function start() {
  try {
    await initDb();
    app.listen(PORT, "0.0.0.0", () => {
      console.log("CHIKAM server running on port " + PORT);
    });
  } catch (error) {
    console.error("STARTUP ERROR:", error);
    process.exit(1);
  }
}

start();
