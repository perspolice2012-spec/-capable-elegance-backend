
import express from "express";
import pg from "pg";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const app = express();
const { Pool } = pg;

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

if (!process.env.DATABASE_URL) {
console.error("DATABASE_URL is missing.");
process.exit(1);
}

const pool = new Pool({
connectionString: process.env.DATABASE_URL,
ssl: process.env.DATABASE_URL.includes("localhost")
? false
: { rejectUnauthorized: false }
});

const sessions = new Map();

async function initDb() {
await pool.query(`
CREATE TABLE IF NOT EXISTS users (
id SERIAL PRIMARY KEY,
username TEXT UNIQUE NOT NULL,
password TEXT NOT NULL,
created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ideas (
id SERIAL PRIMARY KEY,
user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
username TEXT NOT NULL,
title TEXT NOT NULL,
description TEXT NOT NULL,
created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS comments (
id SERIAL PRIMARY KEY,
idea_id INTEGER REFERENCES ideas(id) ON DELETE CASCADE,
user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
username TEXT NOT NULL,
body TEXT NOT NULL,
created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS idea_votes (
id SERIAL PRIMARY KEY,
idea_id INTEGER REFERENCES ideas(id) ON DELETE CASCADE,
user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
created_at TIMESTAMPTZ DEFAULT NOW(),
UNIQUE(idea_id, user_id)
);

CREATE TABLE IF NOT EXISTS ads (
id SERIAL PRIMARY KEY,
username TEXT NOT NULL,
title TEXT NOT NULL,
body TEXT NOT NULL,
contact TEXT DEFAULT '',
created_at TIMESTAMPTZ DEFAULT NOW()
);
`);
}

function clean(value, max = 3000) {
return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function validId(value) {
const id = Number(value);
return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function getUser(req) {
const match = (req.headers.cookie || "").match(
/(?:^|;\s*)chikam_session=([^;]+)/
);
if (!match) return null;

try {
return sessions.get(decodeURIComponent(match[1])) || null;
} catch {
return null;
}
}

function requireLogin(req, res, next) {
const user = getUser(req);
if (!user) {
return res.status(401).json({
message: "برای این کار ابتدا وارد حساب کاربری شو."
});
}
req.user = user;
next();
}

app.get("/db-test", async (req, res) => {
try {
const result = await pool.query("SELECT NOW() AS time");
res.json({
success: true,
message: "اتصال چیکام به پایگاه داده برقرار است.",
time: result.rows[0].time
});
} catch (error) {
console.error("DB TEST:", error.message);
res.status(500).json({
success: false,
message: "اتصال پایگاه داده ناموفق بود."
});
}
});

app.post("/register", async (req, res) => {
try {
const username = clean(req.body.username, 40);
const password = clean(req.body.password, 200);

if (!/^[\p{L}\p{N}_-]{3,40}$`/u.test(username)) {
return res.status(400).json({
message: "نام کاربری باید ۳ تا ۴۰ نویسه و بدون فاصله باشد."
});
}

if (password.length < 8) {
return res.status(400).json({
message: "رمز عبور باید حداقل ۸ نویسه داشته باشد."
});
}

const hash = await bcrypt.hash(password, 12);
const result = await pool.query(
INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id, username,
[username, hash]
);

res.status(201).json({
message: "ثبت‌نام موفق بود. اکنون وارد حساب شو.",
user: result.rows[0]
});
} catch (error) {
if (error.code === "23505") {
return res.status(409).json({
message: "این نام کاربری قبلاً ثبت شده است."
});
}
console.error("REGISTER:", error.message);
res.status(500).json({ message: "ثبت‌نام ناموفق بود." });
}
});

app.post("/login", async (req, res) => {
try {
const username = clean(req.body.username, 40);
const password = clean(req.body.password, 200);

const result = await pool.query(
"SELECT id, username, password FROM users WHERE username = `$1",
[username]
);

const user = result.rows[0];
if (!user || !(await bcrypt.compare(password, user.password))) {
return res.status(401).json({
message: "نام کاربری یا رمز عبور اشتباه است."
});
}

const token = crypto.randomUUID();
sessions.set(token, { id: user.id, username: user.username });

res.setHeader(
"Set-Cookie",
"chikam_session=" + encodeURIComponent(token) +
"; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800"
);

res.json({
message: "با موفقیت وارد شدی.",
user: { id: user.id, username: user.username }
});
} catch (error) {
console.error("LOGIN:", error.message);
res.status(500).json({ message: "ورود ناموفق بود." });
}
});

app.get("/me", (req, res) => {
res.json({ user: getUser(req) });
});

app.post("/logout", (req, res) => {
const match = (req.headers.cookie || "").match(
/(?:^|;\s*)chikam_session=([^;]+)/
);

if (match) {
try {
sessions.delete(decodeURIComponent(match[1]));
} catch {}
}

res.setHeader(
"Set-Cookie",
"chikam_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0"
);
res.json({ message: "از حساب خارج شدی." });
});

app.get("/ideas", async (req, res) => {
try {
const result = await pool.query(SELECT i.id, i.username, i.title, i.description, i.created_at, (SELECT COUNT(*) FROM idea_votes v WHERE v.idea_id = i.id)::int AS votes, (SELECT COUNT(*) FROM comments c WHERE c.idea_id = i.id)::int AS comments FROM ideas i ORDER BY i.created_at DESC LIMIT 100);
res.json({ ideas: result.rows, user: getUser(req) });
} catch (error) {
console.error("IDEAS:", error.message);
res.status(500).json({ message: "دریافت ایده‌ها ناموفق بود." });
}
});

app.post("/ideas", requireLogin, async (req, res) => {
try {
const title = clean(req.body.title, 180);
const description = clean(req.body.description, 4000);

if (!title || !description) {
return res.status(400).json({
message: "عنوان و توضیح ایده را وارد کن."
});
}

const result = await pool.query(
INSERT INTO ideas (user_id, username, title, description) VALUES ($1, $2, $3, $4) RETURNING *,
[req.user.id, req.user.username, title, description]
);

res.status(201).json({
message: "ایده با موفقیت ثبت شد.",
idea: result.rows[0]
});
} catch (error) {
console.error("CREATE IDEA:", error.message);
res.status(500).json({ message: "ثبت ایده ناموفق بود." });
}
});

app.post("/ideas/:id/vote", requireLogin, async (req, res) => {
const ideaId = validId(req.params.id);
if (!ideaId) {
return res.status(400).json({ message: "شناسه ایده معتبر نیست." });
}

try {
const idea = await pool.query(
"SELECT id FROM ideas WHERE id = $`1", [ideaId]
);
if (!idea.rowCount) {
return res.status(404).json({ message: "ایده پیدا نشد." });
}

const result = await pool.query(
INSERT INTO idea_votes (idea_id, user_id) VALUES ($1, $2) ON CONFLICT (idea_id, user_id) DO NOTHING RETURNING id,
[ideaId, req.user.id]
);

const count = await pool.query(
"SELECT COUNT(*)::int AS votes FROM idea_votes WHERE idea_id = `$1",
[ideaId]
);

res.json({
message: result.rowCount
? "رأی تو ثبت شد."
: "قبلاً به این ایده رأی داده‌ای.",
votes: count.rows[0].votes
});
} catch (error) {
console.error("VOTE:", error.message);
res.status(500).json({ message: "ثبت رأی ناموفق بود." });
}
});

app.get("/ideas/:id/comments", async (req, res) => {
const ideaId = validId(req.params.id);
if (!ideaId) {
return res.status(400).json({ message: "شناسه ایده معتبر نیست." });
}

try {
const result = await pool.query(
SELECT id, username, body, created_at FROM comments WHERE idea_id = $1
ORDER BY created_at ASC LIMIT 200`,
[ideaId]
);
res.json({ comments: result.rows });
} catch (error) {
console.error("COMMENTS:", error.message);
res.status(500).json({ message: "دریافت نظرها ناموفق بود." });
}
});

app.post("/ideas/:id/comments", requireLogin, async (req, res) => {
try {
const ideaId = validId(req.params.id);
const body = clean(req.body.body, 2000);

if (!ideaId || !body) {
return res.status(400).json({
message: "شناسه ایده یا متن نظر معتبر نیست."
});
}

const idea = await pool.query(
"SELECT id FROM ideas WHERE id = `$1", [ideaId]
);
if (!idea.rowCount) {
return res.status(404).json({ message: "ایده پیدا نشد." });
}

const result = await pool.query(
INSERT INTO comments (idea_id, user_id, username, body) VALUES ($1, $2, $3, $4) RETURNING id, username, body, created_at,
[ideaId, req.user.id, req.user.username, body]
);

res.status(201).json({
message: "نظر تو ثبت شد.",
comment: result.rows[0]
});
} catch (error) {
console.error("ADD COMMENT:", error.message);
res.status(500).json({ message: "ثبت نظر ناموفق بود." });
}
});

app.get("/ads", async (req, res) => {
try {
const result = await pool.query(SELECT id, username, title, body AS description, contact, created_at FROM ads ORDER BY created_at DESC LIMIT 50);
res.json({ ads: result.rows });
} catch (error) {
console.error("ADS:", error.message);
res.status(500).json({ message: "دریافت تبلیغات ناموفق بود." });
}
});

app.post("/ads", requireLogin, async (req, res) => {
try {
const title = clean(req.body.title, 150);
const body = clean(req.body.description || req.body.body, 1500);
const contact = clean(req.body.contact, 200);

if (!title || !body) {
return res.status(400).json({
message: "عنوان و توضیح تبلیغ را وارد کن."
});
}

const result = await pool.query(
INSERT INTO ads (username, title, body, contact) VALUES ($1, $2, $3, $4) RETURNING id, username, title, body AS description, contact, created_at,
[req.user.username, title, body, contact]
);

res.status(201).json({
message: "تبلیغ با موفقیت ثبت شد.",
ad: result.rows[0]
});
} catch (error) {
console.error("CREATE AD:", error.message);
res.status(500).json({ message: "ثبت تبلیغ ناموفق بود." });
}
});

app.get("/", (req, res) => {
res.type("html").send(`<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>چیکام | پلتفرم ایده و مشارکت</title>
<style>
*{box-sizing:border-box}
body{margin:0;font-family:Tahoma,Arial,sans-serif;background:#f3f6fa;color:#1d2939;line-height:1.9}
header{background:#142b4a;color:white;padding:16px 5%;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px}
.logo{font-size:27px;font-weight:bold;color:#75e0c0}
nav a{color:white;text-decoration:none;margin:0 8px}
main{max-width:950px;margin:auto;padding:18px}
.hero{padding:32px 18px;text-align:center;background:linear-gradient(135deg,#173b60,#247a80);color:white;border-radius:18px;margin:18px 0}
.hero h1{font-size:29px;margin:0}
section,.card{background:white;padding:20px;border-radius:15px;margin:18px 0;box-shadow:0 4px 18px #152b4a0b}
h2{margin-top:0;color:#1b4965}
input,textarea{width:100%;padding:12px;margin:6px 0 12px;border:1px solid #ccd6e0;border-radius:9px;font:inherit}
textarea{min-height:90px}
button{background:#147d70;color:white;border:0;padding:10px 18px;border-radius:9px;font:inherit;cursor:pointer;margin:4px}
.secondary{background:#e8f0f5;color:#193d56}
.msg{color:#126457}
.muted{color:#697789;font-size:13px}
.row{display:grid;grid-template-columns:1fr 1fr;gap:15px}
footer{text-align:center;padding:25px;color:#667}
.ad{border-right:4px solid #e4b34d}
@media(max-width:600px){.row{grid-template-columns:1fr}header{display:block}.hero h1{font-size:23px}}
</style>
</head>
<body>
<header>
<div class="logo">چیکام</div>
<nav>
<a href="#home">خانه</a>
<a href="#ideas">ایده‌ها</a>
<a href="#account">حساب کاربری</a>
<a href="#ads">تبلیغات کاربران</a>
</nav>
</header>

<main>
<section class="hero" id="home">
<h1>ایده‌ای داری؟ با دیگران بسازش.</h1>
<p>پلتفرم ایده و مشارکت</p>
<p>مسئله را مطرح کن، نظر بگیر، رأی بده و برای ساختن راه‌حل بهتر همکاری کن.</p>
<a href="#newidea"><button>ثبت ایده جدید</button></a>
</section>

<section id="account">
<h2>حساب کاربری</h2>
<p id="userStatus">برای ثبت ایده و نظر، وارد حساب خودت شو.</p>
<div class="row">
<form id="registerForm">
<h3>ثبت‌نام</h3>
<label>نام کاربری</label>
<input name="username" required minlength="3" maxlength="40" autocomplete="username">
<label>رمز عبور</label>
<input name="password" type="password" required minlength="8" autocomplete="new-password">
<button type="submit">ثبت‌نام</button>
</form>
<form id="loginForm">
<h3>ورود</h3>
<label>نام کاربری</label>
<input name="username" required autocomplete="username">
<label>رمز عبور</label>
<input name="password" type="password" required autocomplete="current-password">
<button type="submit">ورود</button>
<button class="secondary" type="button" id="logoutBtn">خروج</button>
</form>
</div>
<p id="accountMsg" class="msg" role="status"></p>
</section>

<section id="newidea">
<h2>ایده‌ات را مطرح کن</h2>
<form id="ideaForm">
<label>عنوان ایده</label>
<input name="title" required maxlength="180">
<label>توضیح ایده یا مسئله</label>
<textarea name="description" required maxlength="4000"></textarea>
<button type="submit">ثبت ایده</button>
</form>
<p id="ideaMsg" class="msg"></p>
</section>

<section id="ideas">
<h2>ایده‌های جامعه</h2>
<div id="ideasList">در حال دریافت ایده‌ها...</div>
</section>

<section id="ads">
<h2>📢 تبلیغات کاربران</h2>
<form id="adForm">
<label>عنوان تبلیغ</label>
<input name="title" required maxlength="150">
<label>توضیحات</label>
<textarea name="description" required maxlength="1500"></textarea>
<label>راه ارتباطی (اختیاری)</label>
<input name="contact" maxlength="200">
<button type="submit">ثبت تبلیغ</button>
</form>
<p id="adMsg" class="msg"></p>
<div id="adsList">در حال دریافت تبلیغات...</div>
</section>
</main>

<footer>چیکام — ایده‌ها با مشارکت انسان‌ها رشد می‌کنند.</footer>

<script>
const $` = (id) => document.getElementById(id);

function showMessage(id, message) {
`$(id).textContent = message;
}

function formData(form) {
return Object.fromEntries(new FormData(form).entries());
}

async function api(url, options = {}) {
const response = await fetch(url, {
credentials: "same-origin",
...options,
headers: {
"Content-Type": "application/json",
...(options.headers || {})
}
});

const data = await response.json().catch(() => ({}));

if (!response.ok) {
throw new Error(data.message || "خطایی رخ داد.");
}

return data;
}

function escapeHtml(value) {
return String(value ?? "").replace(/[&<>"']/g, (char) => ({
"&": "&",
"<": "<",
">": ">",
'"': """,
"'": "'"
})[char]);
}

async function refreshUser() {
try {
const data = await api("/me");
latex
("userStatus").textContent = data.user ? "وارد حساب شدی: " + data.user.username : "برای ثبت ایده و نظر، وارد حساب خودت شو."; } catch { 

("userStatus").textContent = "وضعیت حساب دریافت نشد.";
}
}

async function loadIdeas() {
try {
const data = await api("/ideas");

if (!data.ideas.length) {
$`("ideasList").textContent = "هنوز ایده‌ای ثبت نشده؛ اولین ایده را تو مطرح کن.";
return;
}

$("ideasList").innerHTML = data.ideas.map((idea) =&gt; \
<article class="card">
<h3>${escapeHtml(idea.title)}&lt;/h3&gt; &lt;p&gt;\${escapeHtml(idea.description).replace(/\n/g, "<br>")}</p>
<p class="muted">ثبت‌کننده: ${escapeHtml(idea.username)} · رأی: \${idea.votes} · نظر: ${idea.comments}&lt;/p&gt; &lt;button data-vote="\${idea.id}">👍 رأی به ایده</button>
<button class="secondary" data-show-comments="${idea.id}"&gt;دیدن نظرها&lt;/button&gt; &lt;div id="comments-\${idea.id}"></div>
<form data-comment-form="${idea.id}"&gt; &lt;input name="body" required maxlength="2000" placeholder="نظر خودت را بنویس"&gt; &lt;button type="submit"&gt;ثبت نظر&lt;/button&gt; &lt;/form&gt; &lt;/article&gt; \).join("");
} catch (error) {
`$("ideasList").textContent = error.message;
}
}

async function loadComments(id) {
const target = $`("comments-" + id);
if (!target) return;

try {
const data = await api("/ideas/" + id + "/comments");

target.innerHTML = data.comments.length
? data.comments.map((comment) =>
'<p><strong>' + escapeHtml(comment.username) +
':</strong> ' + escapeHtml(comment.body) + '</p>'
).join("")
: "<p class='muted'>هنوز نظری ثبت نشده است.</p>";
} catch (error) {
target.textContent = error.message;
}
}

async function loadAds() {
try {
const data = await api("/ads");

$("adsList").innerHTML = data.ads.length ? data.ads.map((ad) =&gt; \
<article class="card ad">
<h3>${escapeHtml(ad.title)}&lt;/h3&gt; &lt;p&gt;\${escapeHtml(ad.description)}</p>
<p class="muted">منتشرکننده: ${escapeHtml(ad.username)}&lt;/p&gt; \${ad.contact ? "<p>ارتباط: " + escapeHtml(ad.contact) + "</p>" : ""}
</article>
`).join("")
: "<p>هنوز تبلیغی ثبت نشده است.</p>";
} catch (error) {
$`("adsList").textContent = error.message;
}
}

`$("registerForm").addEventListener("submit", async (event) => {
event.preventDefault();
try {
const data = await api("/register", {
method: "POST",
body: JSON.stringify(formData(event.target))
});
showMessage("accountMsg", data.message);
event.target.reset();
} catch (error) {
showMessage("accountMsg", error.message);
}
});

$`("loginForm").addEventListener("submit", async (event) => {
event.preventDefault();
try {
const data = await api("/login", {
method: "POST",
body: JSON.stringify(formData(event.target))
});
showMessage("accountMsg", data.message);
event.target.reset();
await refreshUser();
} catch (error) {
showMessage("accountMsg", error.message);
}
});

`$("logoutBtn").addEventListener("click", async () => {
try {
const data = await api("/logout", { method: "POST" });
showMessage("accountMsg", data.message);
await refreshUser();
} catch (error) {
showMessage("accountMsg", error.message);
}
});

$`("ideaForm").addEventListener("submit", async (event) => {
event.preventDefault();
try {
const data = await api("/ideas", {
method: "POST",
body: JSON.stringify(formData(event.target))
});
showMessage("ideaMsg", data.message);
event.target.reset();
await loadIdeas();
} catch (error) {
showMessage("ideaMsg", error.message);
}
});

`$("ideasList").addEventListener("click", async (event) => {
const voteButton = event.target.closest("[data-vote]");
const commentsButton = event.target.closest("[data-show-comments]");

if (voteButton) {
try {
const data = await api("/ideas/" + voteButton.dataset.vote + "/vote", {
method: "POST",
body: JSON.stringify({})
});
alert(data.message + " تعداد رأی: " + data.votes);
await loadIdeas();
} catch (error) {
alert(error.message);
}
}

if (commentsButton) {
await loadComments(commentsButton.dataset.showComments);
}
});

$`("ideasList").addEventListener("submit", async (event) => {
const form = event.target.closest("[data-comment-form]");
if (!form) return;

event.preventDefault();

try {
const id = form.dataset.commentForm;
const data = await api("/ideas/" + id + "/comments", {
method: "POST",
body: JSON.stringify(formData(form))
});
alert(data.message);
form.reset();
await loadComments(id);
await loadIdeas();
} catch (error) {
alert(error.message);
}
});

`$("adForm").addEventListener("submit", async (event) => {
event.preventDefault();

try {
const data = await api("/ads", {
method: "POST",
body: JSON.stringify(formData(event.target))
});
showMessage("adMsg", data.message);
event.target.reset();
await loadAds();
} catch (error) {
showMessage("adMsg", error.message);
}
});

loadIdeas();
loadAds();
refreshUser();
</script>
</body>
</html>`);
});

async function startServer() {
try {
await initDb();
const port = Number(process.env.PORT) || 8080;

app.listen(port, "0.0.0.0", () => {
console.log("CHIKAM listening on port " + port);
});
} catch (error) {
console.error("STARTUP ERROR:", error);
process.exit(1);
}
}

startServer();

