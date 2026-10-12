import express from "express";
import pg from "pg";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";

const app = express();
const PORT = process.env.PORT || 8080;
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
});
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});

// Simple in-memory sessions. Restarting the service logs users out.
const sessions = new Map();
const COOKIE = "chikam_session";
function cookies(req) {
  const out = {};
  (req.headers.cookie || "").split(";").forEach((part) => {
    const i = part.indexOf("=");
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}
function setSession(res, user, role = "user") {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, { id: user.id ?? null, username: user.username, role, createdAt: Date.now() });
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", COOKIE + "=" + token + "; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800" + secure);
}
function getUser(req) {
  const token = cookies(req)[COOKIE];
  const user = token ? sessions.get(token) : null;
  if (!user) return null;
  if (Date.now() - user.createdAt > 7 * 86400000) { sessions.delete(token); return null; }
  return user;
}
function requireUser(req, res, next) {
  const user = getUser(req);
  if (!user || user.role !== "user") return res.status(401).json({ error: "ابتدا با حساب کاربری وارد شوید." });
  req.user = user;
  next();
}
function requireAdmin(req, res, next) {
  const user = getUser(req);
  if (!user || user.role !== "admin") return res.status(403).json({ error: "دسترسی فقط برای مدیر مجاز است." });
  req.user = user;
  next();
}
function safeEqual(a, b) {
  const aa = Buffer.from(String(a || "")); const bb = Buffer.from(String(b || ""));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}
const authAttempts = new Map();
function limited(req) {
  const key = String(req.ip || req.socket?.remoteAddress || "unknown"); const now = Date.now();
  const item = authAttempts.get(key) || { count: 0, until: now + 15 * 60 * 1000 };
  if (now > item.until) { item.count = 0; item.until = now + 15 * 60 * 1000; }
  item.count++; authAttempts.set(key, item); return item.count > 12;
}
function clean(value, max = 2000) { return String(value ?? "").trim().slice(0, max); }

async function initDb() {
  await pool.query(`CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY, username VARCHAR(50) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL, phone VARCHAR(40), email VARCHAR(150),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS ideas (
    id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    username VARCHAR(50), title VARCHAR(200) NOT NULL, description TEXT NOT NULL,
    category VARCHAR(80) DEFAULT 'عمومی', votes INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS comments (
    id SERIAL PRIMARY KEY, idea_id INTEGER NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL, username VARCHAR(50),
    body TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS idea_votes (
    id SERIAL PRIMARY KEY, idea_id INTEGER NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(idea_id,user_id))`);
  await pool.query(`CREATE TABLE IF NOT EXISTS ads (
    id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    username VARCHAR(50), title VARCHAR(150) NOT NULL, body TEXT NOT NULL,
    contact VARCHAR(200), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  // Non-destructive migrations for databases created by earlier CHIKAM versions.
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(40)");
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(150)");
  // Compatibility with the earlier schema that stored bcrypt hashes in users.password.
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT");
  await pool.query(`DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'password') THEN
      EXECUTE 'UPDATE users SET password_hash = password WHERE password_hash IS NULL AND password IS NOT NULL';
      EXECUTE 'ALTER TABLE users ALTER COLUMN password DROP NOT NULL';
    END IF;
  END $$`);
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()");
  await pool.query("ALTER TABLE ads ADD COLUMN IF NOT EXISTS username VARCHAR(50)");
  await pool.query("ALTER TABLE ads ADD COLUMN IF NOT EXISTS user_id INTEGER");
  await pool.query("ALTER TABLE ads ADD COLUMN IF NOT EXISTS title VARCHAR(150)");
  await pool.query("ALTER TABLE ads ADD COLUMN IF NOT EXISTS body TEXT");
  await pool.query("ALTER TABLE ads ADD COLUMN IF NOT EXISTS contact VARCHAR(200)");
  await pool.query("ALTER TABLE ads ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()");
  // If older ads used a description column, copy its content into body without deleting it.
  await pool.query(`DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'ads' AND column_name = 'description') THEN
      EXECUTE 'UPDATE ads SET body = description WHERE body IS NULL AND description IS NOT NULL';
    END IF;
  END $$`);
  await pool.query("ALTER TABLE ideas ADD COLUMN IF NOT EXISTS category VARCHAR(80) DEFAULT 'عمومی'");
  await pool.query("ALTER TABLE ideas ADD COLUMN IF NOT EXISTS votes INTEGER NOT NULL DEFAULT 0");
}

app.get("/db-test", async (_req, res) => {
  try { const r = await pool.query("SELECT NOW() AS time"); res.json({ ok: true, message: "اتصال پایگاه داده برقرار است.", time: r.rows[0].time }); }
  catch (e) { console.error("db-test", e); res.status(500).json({ ok: false, error: "اتصال پایگاه داده ناموفق بود." }); }
});

app.post("/register", async (req, res) => {
  try {
    const username = clean(req.body.username, 50), password = String(req.body.password || "");
    const confirmPassword = String(req.body.confirmPassword || "");
    const phone = clean(req.body.phone, 40), email = clean(req.body.email, 150);
    if (username.length < 3) return res.status(400).json({ error: "نام کاربری باید دست‌کم ۳ نویسه باشد." });
    if (password.length < 6) return res.status(400).json({ error: "رمز عبور باید دست‌کم ۶ نویسه باشد." });
    if (confirmPassword !== password) return res.status(400).json({ error: "رمز عبور و تکرار آن یکسان نیستند." });
    if (limited(req)) return res.status(429).json({ error: "تعداد تلاش‌ها زیاد است؛ ۱۵ دقیقه دیگر دوباره امتحان کنید." });
    const hash = await bcrypt.hash(password, 12);
    const r = await pool.query("INSERT INTO users(username,password_hash,phone,email) VALUES($1,$2,$3,$4) RETURNING id,username", [username, hash, phone || null, email || null]);
    setSession(res, r.rows[0]); res.json({ ok: true, user: r.rows[0], message: "ثبت‌نام با موفقیت انجام شد." });
  } catch (e) {
    if (e.code === "23505") return res.status(409).json({ error: "این نام کاربری قبلاً ثبت شده است." });
    console.error("register", e); res.status(500).json({ error: "ثبت‌نام انجام نشد. تنظیمات پایگاه داده را بررسی کنید." });
  }
});
app.post("/login", async (req, res) => {
  try {
    if (limited(req)) return res.status(429).json({ error: "تعداد تلاش‌ها زیاد است؛ ۱۵ دقیقه دیگر دوباره امتحان کنید." });
    const username = clean(req.body.username, 50), password = String(req.body.password || "");
    const r = await pool.query("SELECT id,username,password_hash FROM users WHERE username=$1", [username]);
    if (!r.rows.length || !(await bcrypt.compare(password, r.rows[0].password_hash))) return res.status(401).json({ error: "نام کاربری یا رمز عبور اشتباه است." });
    const user = { id: r.rows[0].id, username: r.rows[0].username }; setSession(res, user);
    res.json({ ok: true, user, message: "با موفقیت وارد شدید." });
  } catch (e) { console.error("login", e); res.status(500).json({ error: "ورود انجام نشد." }); }
});
app.post("/admin/login", (req, res) => {
  const configuredUser = process.env.ADMIN_USERNAME;
  const configuredPassword = process.env.ADMIN_PASSWORD;
  if (!configuredUser || !configuredPassword) return res.status(503).json({ error: "ورود مدیر هنوز امن پیکربندی نشده است. متغیرهای ADMIN_USERNAME و ADMIN_PASSWORD را در Railway تنظیم کنید." });
  if (limited(req)) return res.status(429).json({ error: "تعداد تلاش‌ها زیاد است؛ ۱۵ دقیقه دیگر دوباره امتحان کنید." });
  const username = clean(req.body.username, 80), password = String(req.body.password || "");
  if (!safeEqual(username, configuredUser) || !safeEqual(password, configuredPassword)) return res.status(401).json({ error: "نام کاربری یا رمز مدیر نادرست است." });
  setSession(res, { id: null, username: configuredUser }, "admin");
  res.json({ ok: true, user: { username: configuredUser, role: "admin" }, message: "ورود مدیر با موفقیت انجام شد." });
});
app.get("/admin/overview", requireAdmin, async (_req, res) => {
  try {
    const [users, ideas, ads] = await Promise.all([
      pool.query("SELECT id, username, phone, created_at FROM users ORDER BY created_at DESC LIMIT 200"),
      pool.query("SELECT COUNT(*)::int AS count FROM ideas"),
      pool.query("SELECT COUNT(*)::int AS count FROM ads")
    ]);
    res.json({ ok: true, users: users.rows, ideaCount: ideas.rows[0].count, adCount: ads.rows[0].count });
  } catch (e) { console.error("admin overview", e); res.status(500).json({ error: "دریافت اطلاعات پنل مدیر ناموفق بود." }); }
});
app.get("/me", (req, res) => res.json({ user: getUser(req) }));
app.post("/logout", (req, res) => {
  const token = cookies(req)[COOKIE]; if (token) sessions.delete(token);
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", COOKIE + "=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0" + secure);
  res.json({ ok: true, message: "از حساب خارج شدید." });
});

app.get("/ideas", async (_req, res) => {
  try {
    const r = await pool.query(`SELECT i.id,i.username,i.title,i.description,i.category,i.votes,i.created_at,
      (SELECT COUNT(*)::int FROM comments c WHERE c.idea_id=i.id) AS comments_count
      FROM ideas i ORDER BY i.created_at DESC LIMIT 100`);
    res.json({ ideas: r.rows });
  } catch (e) { console.error("ideas", e); res.status(500).json({ error: "دریافت ایده‌ها ناموفق بود." }); }
});
app.post("/ideas", requireUser, async (req, res) => {
  try {
    const title = clean(req.body.title, 200), description = clean(req.body.description, 5000), category = clean(req.body.category || "عمومی", 80);
    if (title.length < 3 || description.length < 5) return res.status(400).json({ error: "عنوان و توضیح ایده را کامل وارد کنید." });
    const r = await pool.query("INSERT INTO ideas(user_id,username,title,description,category) VALUES($1,$2,$3,$4,$5) RETURNING *", [req.user.id, req.user.username, title, description, category]);
    res.json({ ok: true, idea: r.rows[0], message: "ایده شما ثبت شد." });
  } catch (e) { console.error("create idea", e); res.status(500).json({ error: "ثبت ایده ناموفق بود." }); }
});
app.post("/ideas/:id/vote", requireUser, async (req, res) => {
  const client = await pool.connect();
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: "شناسه ایده معتبر نیست." });
    await client.query("BEGIN");
    const inserted = await client.query("INSERT INTO idea_votes(idea_id,user_id) VALUES($1,$2) ON CONFLICT(idea_id,user_id) DO NOTHING RETURNING id", [id, req.user.id]);
    if (inserted.rowCount) await client.query("UPDATE ideas SET votes=votes+1 WHERE id=$1", [id]);
    const r = await client.query("SELECT votes FROM ideas WHERE id=$1", [id]);
    await client.query("COMMIT");
    if (!r.rows.length) return res.status(404).json({ error: "ایده پیدا نشد." });
    res.json({ ok: true, votes: r.rows[0].votes, message: inserted.rowCount ? "رأی شما ثبت شد." : "قبلاً به این ایده رأی داده‌اید." });
  } catch (e) { try { await client.query("ROLLBACK"); } catch {} console.error("vote", e); res.status(500).json({ error: "ثبت رأی ناموفق بود." }); }
  finally { client.release(); }
});
app.get("/ideas/:id/comments", async (req, res) => {
  try { const r = await pool.query("SELECT id,username,body,created_at FROM comments WHERE idea_id=$1 ORDER BY created_at ASC", [Number(req.params.id)]); res.json({ comments: r.rows }); }
  catch (e) { console.error("comments", e); res.status(500).json({ error: "دریافت دیدگاه‌ها ناموفق بود." }); }
});
app.post("/ideas/:id/comments", requireUser, async (req, res) => {
  try {
    const body = clean(req.body.body, 2000); if (body.length < 2) return res.status(400).json({ error: "متن دیدگاه را وارد کنید." });
    const r = await pool.query("INSERT INTO comments(idea_id,user_id,username,body) VALUES($1,$2,$3,$4) RETURNING id,username,body,created_at", [Number(req.params.id), req.user.id, req.user.username, body]);
    res.json({ ok: true, comment: r.rows[0], message: "دیدگاه ثبت شد." });
  } catch (e) { console.error("comment", e); res.status(500).json({ error: "ثبت دیدگاه ناموفق بود. شاید ایده وجود نداشته باشد." }); }
});
app.get("/ads", async (_req, res) => {
  try { const r = await pool.query("SELECT id,username,title,body,contact,created_at FROM ads ORDER BY created_at DESC LIMIT 30"); res.json({ ads: r.rows }); }
  catch (e) { console.error("ads", e); res.status(500).json({ error: "دریافت تبلیغات ناموفق بود." }); }
});
app.post("/ads", requireUser, async (req, res) => {
  try {
    const title = clean(req.body.title, 150), body = clean(req.body.body, 2000), contact = clean(req.body.contact, 200);
    if (title.length < 3 || body.length < 5) return res.status(400).json({ error: "عنوان و متن تبلیغ را کامل کنید." });
    const r = await pool.query("INSERT INTO ads(user_id,username,title,body,contact) VALUES($1,$2,$3,$4,$5) RETURNING id,username,title,body,contact,created_at", [req.user.id, req.user.username, title, body, contact || null]);
    res.json({ ok: true, ad: r.rows[0], message: "تبلیغ ثبت شد." });
  } catch (e) { console.error("create ad", e); res.status(500).json({ error: "ثبت تبلیغ ناموفق بود." }); }
});

const html = `<!doctype html>
<html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>چیکام | پلتفرم ایده و مشارکت</title>
<style>
:root{--g:#126b54;--mint:#e8f5ef;--ink:#18352e;--muted:#60756e;--line:#dce9e3}*{box-sizing:border-box}body{margin:0;font-family:Tahoma,Arial,sans-serif;background:#f5f8f6;color:var(--ink);line-height:1.9}header{background:white;border-bottom:1px solid var(--line);position:sticky;top:0}.nav{max-width:1000px;margin:auto;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.brand{display:flex;align-items:center;gap:10px;font-size:25px;font-weight:bold;color:var(--g)}.brandMark{width:42px;height:42px;border-radius:13px;background:linear-gradient(135deg,#126b54,#65b99a);color:#fff;display:grid;place-items:center;font-size:15px;font-weight:900;box-shadow:0 5px 14px #126b5425}.brandText small{display:block;font-size:11px;font-weight:400;color:var(--muted)}.passwordRow{display:flex;gap:7px;align-items:center}.passwordRow .field{flex:1;min-width:0}.eyeBtn{border:1px solid var(--line);background:#fff;border-radius:10px;padding:8px 11px;cursor:pointer;font-size:17px}nav a{color:var(--ink);text-decoration:none;margin:0 7px;font-size:14px}main{max-width:1000px;margin:auto;padding:22px 15px}.hero{background:linear-gradient(135deg,#e4f5ec,#fff);border:1px solid var(--line);border-radius:24px;padding:28px 22px;margin-bottom:20px}h1{font-size:clamp(24px,5vw,38px);line-height:1.6;margin:0 0 8px}.hero p,.muted{color:var(--muted)}.row{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:16px}.authChoice{display:flex;gap:10px;flex-wrap:wrap;margin:12px 0}.authChoice .btn{flex:1;min-width:120px}.card{background:white;border:1px solid var(--line);border-radius:18px;padding:18px;margin-bottom:16px}.card h2{margin-top:0}.btn{border:0;border-radius:12px;background:var(--g);color:white;padding:10px 16px;font:inherit;cursor:pointer}.secondary{background:white;color:var(--g);border:1px solid var(--g)}.small{padding:5px 10px;font-size:13px}.field{display:block;width:100%;border:1px solid #ccdcd4;border-radius:10px;padding:11px;margin:8px 0 12px;font:inherit;background:white}.idea{border-top:1px solid var(--line);padding:15px 0}.tag{display:inline-block;background:var(--mint);color:var(--g);border-radius:20px;padding:2px 10px;font-size:12px}.notice{padding:10px;border-radius:10px;background:var(--mint);margin:10px 0}.hidden{display:none}.muted{font-size:13px}footer{text-align:center;padding:25px;color:var(--muted);font-size:13px}

/* اصلاح ظاهر ورود مدیر چیکام */
#adminDetails {
  margin-top: 12px;
  padding: 10px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: #f8fbf9;
  overflow: hidden;
}

#adminDetails summary {
  cursor: pointer;
  color: var(--g);
  font-weight: bold;
  padding: 4px;
}

#adminDetails form {
  width: 100%;
  margin-top: 10px;
}

#adminDetails .field {
  width: 100%;
  min-width: 0;
  margin: 8px 0 12px;
}

#adminDetails .passwordRow {
  width: 100%;
  min-width: 0;
  gap: 6px;
}

#adminDetails .passwordRow .field {
  flex: 1;
  min-width: 0;
}

#adminDetails button[type="submit"] {
  width: 100%;
}

@media (max-width: 480px) {
  #adminDetails {
    padding: 8px;
  }
}
</style></head><body><header><div class="nav"><div class="brand"><div class="brandMark">CH</div><div class="brandText">CHIKAM<small>چیکام — خانه ایده‌ها</small></div></div><nav><a href="#ideas">خانه ایده‌ها</a><a href="#account">حساب کاربری</a><a href="#ads">تبلیغات کاربران</a></nav></div></header><main>
<section class="hero"><h1>ایده‌ای داری؟ با دیگران بسازش.</h1><p>چیکام، پلتفرم ایده و مشارکت؛ مسئله‌ات را مطرح کن، از دیگران نظر بگیر، به راه‌حل‌ها رأی بده و برای اجرای بهترین ایده همراه شو.</p><a class="btn" href="#ideas" style="display:inline-block;text-decoration:none">دیدن ایده‌ها</a> <a class="btn secondary" href="#account" style="display:inline-block;text-decoration:none">ورود یا ثبت‌نام</a></section>
<div class="row"><section class="card" id="account"><h2>👤 حساب کاربری</h2><div id="accountState" class="muted">در حال بررسی حساب…</div><div id="authForms"><div id="authChoice" class="authChoice"><button class="btn" type="button" id="chooseRegister">ایجاد حساب</button><button class="btn secondary" type="button" id="chooseLogin">ورود</button></div><div id="registerWrap" class="hidden"><h3>ایجاد حساب کاربری</h3><form id="registerForm"><input class="field" name="username" minlength="3" maxlength="50" autocomplete="username" placeholder="نام کاربری (حداقل ۳ نویسه)" required><div class="passwordRow"><input class="field" id="regPassword" name="password" type="password" minlength="6" autocomplete="new-password" placeholder="رمز عبور (حداقل ۶ نویسه)" required><button class="eyeBtn" type="button" data-eye="regPassword" aria-label="نمایش رمز">👁️</button></div><div class="passwordRow"><input class="field" id="regConfirm" name="confirmPassword" type="password" minlength="6" autocomplete="new-password" placeholder="تکرار رمز عبور" required><button class="eyeBtn" type="button" data-eye="regConfirm" aria-label="نمایش تکرار رمز">👁️</button></div><input class="field" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="شماره تماس (اختیاری)"><input class="field" name="email" type="email" autocomplete="email" placeholder="ایمیل (اختیاری)"><button class="btn" type="submit">ثبت‌نام</button></form><button class="btn secondary small" type="button" id="backFromRegister">بازگشت</button></div><div id="loginWrap" class="hidden"><h3>ورود به حساب</h3><form id="loginForm"><input class="field" name="username" autocomplete="username" placeholder="نام کاربری" required><div class="passwordRow"><input class="field" id="loginPassword" name="password" type="password" autocomplete="current-password" placeholder="رمز عبور" required><button class="eyeBtn" type="button" data-eye="loginPassword" aria-label="نمایش رمز">👁️</button></div><button class="btn secondary" type="submit">ورود</button></form><button class="btn secondary small" type="button" id="backFromLogin">بازگشت</button></div><hr><details id="adminDetails"><summary>ورود مدیر</summary><form id="adminForm"><input class="field" name="username" autocomplete="username" placeholder="نام کاربری مدیر" required><div class="passwordRow"><input class="field" id="adminPassword" name="password" type="password" autocomplete="current-password" placeholder="رمز مدیر" required><button class="eyeBtn" type="button" data-eye="adminPassword" aria-label="نمایش رمز مدیر">👁️</button></div><button class="btn secondary" type="submit">ورود به پنل مدیر</button></form></details></div><div id="authMessage" class="notice hidden" role="status" aria-live="polite"></div><section id="adminPanel" class="notice hidden"><h3>پنل مدیریت چیکام</h3><div id="adminStats"></div><div id="adminUsers"></div><button id="adminRefresh" class="btn secondary" type="button">به‌روزرسانی پنل</button></section></section>
<section class="card" id="groups"><h2>💡 ثبت ایده تازه</h2><p class="muted">برای ثبت ایده ابتدا وارد حساب کاربری شوید.</p><form id="ideaForm"><input class="field" name="title" minlength="3" maxlength="200" placeholder="عنوان ایده" required><select class="field" name="category"><option>عمومی</option><option>فناوری</option><option>جامعه</option><option>کسب‌وکار</option><option>محیط زیست</option><option>آموزش</option></select><textarea class="field" name="description" rows="4" minlength="5" placeholder="مسئله یا ایده خود را توضیح دهید…" required></textarea><button class="btn">ثبت ایده</button></form><div id="ideaMessage" class="notice hidden"></div></section></div>
<section class="card" id="ideas"><h2>🌿 خانه ایده‌ها</h2><p class="muted">ایده‌ها را بخوانید، دیدگاه بنویسید و به پیشنهادهای مفید رأی بدهید.</p><div id="ideasList">در حال دریافت ایده‌ها…</div></section>
<section class="card" id="ads"><h2>📢 تبلیغات کاربران</h2><p class="muted">فضایی برای معرفی خدمات و پیشنهادهای کاربران چیکام.</p><div id="adsList">در حال دریافت تبلیغات…</div><details><summary>ثبت تبلیغ (پس از ورود)</summary><form id="adForm"><input class="field" name="title" placeholder="عنوان تبلیغ" required><textarea class="field" name="body" rows="3" placeholder="متن تبلیغ" required></textarea><input class="field" name="contact" placeholder="راه ارتباطی (اختیاری)"><button class="btn">ثبت تبلیغ</button></form><div id="adMessage" class="notice hidden"></div></details></section></main><footer>چیکام — ایده‌ها با مشارکت انسان‌ها رشد می‌کنند. نشان «لول چیکام» متعلق به مشارکت واقعی جامعه است.</footer>
<script>
function byId(id){return document.getElementById(id)}
function msg(id,text){var x=byId(id);x.textContent=text;x.classList.remove('hidden')}
async function api(url,opts){opts=opts||{};opts.headers=Object.assign({'Content-Type':'application/json'},opts.headers||{});opts.credentials='same-origin';var r=await fetch(url,opts);var d=await r.json().catch(function(){return {}});if(!r.ok)throw new Error(d.error||'خطایی رخ داد');return d}
function formData(form){return Object.fromEntries(new FormData(form).entries())}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function showAuthChoice(){byId('authChoice').classList.remove('hidden');byId('registerWrap').classList.add('hidden');byId('loginWrap').classList.add('hidden')}function showAuthForm(which){byId('authChoice').classList.add('hidden');byId('registerWrap').classList.toggle('hidden',which!=='register');byId('loginWrap').classList.toggle('hidden',which!=='login')}byId('chooseRegister').addEventListener('click',function(){showAuthForm('register')});byId('chooseLogin').addEventListener('click',function(){showAuthForm('login')});byId('backFromRegister').addEventListener('click',showAuthChoice);byId('backFromLogin').addEventListener('click',showAuthChoice);function updateAccount(user){var state=byId('accountState'),forms=byId('authForms'),panel=byId('adminPanel');if(user){state.textContent=(user.role==='admin'?'وارد پنل مدیریت شده‌اید: ':'وارد حساب شده‌اید: ')+user.username;forms.classList.add('hidden');if(user.role==='admin'){panel.classList.remove('hidden');loadAdmin()}else{panel.classList.add('hidden')}if(!byId('logoutBtn')){var b=document.createElement('button');b.id='logoutBtn';b.type='button';b.className='btn secondary';b.textContent='خروج از حساب';state.after(b);b.onclick=logout}}else{state.textContent='برای ثبت ایده و تبلیغ وارد شوید یا ثبت‌نام کنید';forms.classList.remove('hidden');showAuthChoice();panel.classList.add('hidden');var old=byId('logoutBtn');if(old)old.remove()}}
async function logout(){try{await api('/logout',{method:'POST'});location.reload()}catch(e){msg('authMessage',e.message)}}
async function loadAdmin(){try{var d=await api('/admin/overview');byId('adminStats').textContent='کاربران: '+d.users.length+' | ایده‌ها: '+d.ideaCount+' | تبلیغات: '+d.adCount;byId('adminUsers').innerHTML=d.users.map(function(u){return '<div class="idea"><b>'+esc(u.username)+'</b><div class="muted">شماره تماس: '+esc(u.phone||'ثبت نشده')+' · تاریخ عضویت: '+esc(u.created_at||'')+'</div></div>'}).join('')||'<p>هنوز کاربری ثبت نشده است.</p>'}catch(e){msg('authMessage',e.message);byId('adminStats').textContent='اطلاعات پنل مدیر دریافت نشد.'}}
async function loadIdeas(){try{var d=await api('/ideas'),box=byId('ideasList');if(!d.ideas.length){box.innerHTML='<p class="muted">هنوز ایده‌ای ثبت نشده است. اولین ایده را شما مطرح کنید.</p>';return}box.innerHTML=d.ideas.map(function(i){return '<article class="idea"><span class="tag">'+esc(i.category||'عمومی')+'</span><h3>'+esc(i.title)+'</h3><p>'+esc(i.description)+'</p><div class="muted">نویسنده: '+esc(i.username||'کاربر')+' · رأی: '+Number(i.votes||0)+' · دیدگاه: '+Number(i.comments_count||0)+'</div><p><button class="btn small" onclick="voteIdea('+Number(i.id)+')">👍 رأی می‌دهم</button> <button class="btn secondary small" onclick="commentIdea('+Number(i.id)+')">💬 دیدگاه</button></p></article>'}).join('')}catch(e){byId('ideasList').textContent=e.message}}
async function voteIdea(id){try{var d=await api('/ideas/'+id+'/vote',{method:'POST',body:'{}'});alert(d.message);loadIdeas()}catch(e){alert(e.message)}}
async function commentIdea(id){var body=prompt('دیدگاه خود را بنویسید:');if(!body)return;try{var d=await api('/ideas/'+id+'/comments',{method:'POST',body:JSON.stringify({body:body})});alert(d.message);loadIdeas()}catch(e){alert(e.message)}}
async function loadAds(){try{var d=await api('/ads'),box=byId('adsList');if(!d.ads.length){box.innerHTML='<p class="muted">هنوز تبلیغی ثبت نشده است.</p>';return}box.innerHTML=d.ads.map(function(a){return '<article class="idea"><h3>'+esc(a.title)+'</h3><p>'+esc(a.body)+'</p><div class="muted">از طرف '+esc(a.username||'کاربر')+(a.contact?' · تماس: '+esc(a.contact):'')+'</div></article>'}).join('')}catch(e){byId('adsList').textContent=e.message}}
byId('registerForm').addEventListener('submit',async function(e){e.preventDefault();var data=formData(e.target);if(data.password!==data.confirmPassword){msg('authMessage','رمز عبور و تکرار آن یکسان نیستند.');return}try{var d=await api('/register',{method:'POST',body:JSON.stringify(data)});msg('authMessage',d.message);updateAccount(d.user);e.target.reset()}catch(x){msg('authMessage',x.message)}})
byId('loginForm').addEventListener('submit',async function(e){e.preventDefault();try{var d=await api('/login',{method:'POST',body:JSON.stringify(formData(e.target))});msg('authMessage',d.message);updateAccount(d.user);e.target.reset()}catch(x){msg('authMessage',x.message)}})
byId('adminForm').addEventListener('submit',async function(e){e.preventDefault();try{var d=await api('/admin/login',{method:'POST',body:JSON.stringify(formData(e.target))});msg('authMessage',d.message);updateAccount(d.user);e.target.reset()}catch(x){msg('authMessage',x.message)}})
byId('adminRefresh').addEventListener('click',loadAdmin)
document.querySelectorAll('[data-eye]').forEach(function(b){b.addEventListener('click',function(){var x=byId(b.dataset.eye);x.type=x.type==='password'?'text':'password';b.textContent=x.type==='password'?'👁️':'🙈'})})
byId('ideaForm').addEventListener('submit',async function(e){e.preventDefault();try{var d=await api('/ideas',{method:'POST',body:JSON.stringify(formData(e.target))});msg('ideaMessage',d.message);e.target.reset();loadIdeas()}catch(x){msg('ideaMessage',x.message)}})
byId('adForm').addEventListener('submit',async function(e){e.preventDefault();try{var d=await api('/ads',{method:'POST',body:JSON.stringify(formData(e.target))});msg('adMessage',d.message);e.target.reset();loadAds()}catch(x){msg('adMessage',x.message)}})
;(async function(){try{var d=await api('/me');updateAccount(d.user)}catch(e){byId('accountState').textContent='برای ادامه ثبت‌نام یا ورود کنید'}loadIdeas();loadAds()})()
</script></body></html>`;
app.get("/", (_req, res) => res.type("html").send(html));
app.use((_req, res) => res.status(404).json({ error: "مسیر موردنظر پیدا نشد." }));

async function start() {
  try {
    if (process.env.DATABASE_URL) await initDb();
    else console.warn("DATABASE_URL is not configured");
    app.listen(PORT, "0.0.0.0", () => console.log("CHIKAM server listening on port " + PORT));
  } catch (error) {
    console.error("Startup failed:", error);
    process.exit(1);
  }
}
start();
