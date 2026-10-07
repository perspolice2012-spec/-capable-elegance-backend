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

app.get("/", async (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>چیکام | هر ایده آغاز یک مسیر</title>

<style>
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: Tahoma, Arial, sans-serif;
  background: #f4f7fb;
  color: #172033;
}

header {
  background: linear-gradient(135deg, #172554, #2563eb);
  color: white;
  padding: 18px 6%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}

.logo {
  font-size: 27px;
  font-weight: bold;
}

.header-text {
  font-size: 13px;
  opacity: .9;
}

.hero {
  padding: 65px 20px;
  text-align: center;
  background:
    radial-gradient(circle at 20% 20%, rgba(59,130,246,.18), transparent 30%),
    radial-gradient(circle at 80% 30%, rgba(14,165,233,.15), transparent 30%),
    white;
}

.hero h1 {
  margin: 0 0 15px;
  font-size: clamp(30px, 6vw, 52px);
  color: #172554;
}

.hero p {
  max-width: 700px;
  margin: auto;
  line-height: 2;
  color: #526071;
  font-size: 17px;
}

.hero-badge {
  display: inline-block;
  margin-bottom: 18px;
  padding: 8px 16px;
  border-radius: 30px;
  background: #e0ecff;
  color: #1d4ed8;
  font-size: 13px;
  font-weight: bold;
}

.container {
  width: min(1100px, 92%);
  margin: 35px auto;
}

.section {
  background: white;
  border-radius: 20px;
  padding: 25px;
  margin-bottom: 25px;
  box-shadow: 0 8px 30px rgba(15,23,42,.07);
}

.section-title {
  margin-top: 0;
  color: #172554;
}

.ad-section {
  background: linear-gradient(135deg, #fff7ed, #ffffff);
  border: 1px solid #fed7aa;
}

.ad-card {
  border-radius: 16px;
  padding: 20px;
  background: white;
  border: 1px solid #e5e7eb;
}

.ad-label {
  color: #ea580c;
  font-weight: bold;
  font-size: 13px;
}

.ad-button {
  border: none;
  background: #f97316;
  color: white;
  padding: 11px 20px;
  border-radius: 10px;
  cursor: pointer;
  font-size: 14px;
}

.auth-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.box {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 20px;
}

input,
textarea,
select {
  width: 100%;
  padding: 12px 14px;
  margin: 7px 0;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  background: white;
  font-family: inherit;
  font-size: 14px;
}

textarea {
  min-height: 100px;
  resize: vertical;
}

button {
  border: none;
  border-radius: 10px;
  padding: 12px 20px;
  background: #2563eb;
  color: white;
  cursor: pointer;
  font-family: inherit;
  font-size: 14px;
}

button:hover {
  opacity: .9;
}

.password-wrap {
  position: relative;
}

.password-wrap input {
  padding-left: 48px;
}

.eye {
  position: absolute;
  left: 8px;
  top: 8px;
  width: 38px;
  height: 38px;
  padding: 0;
  background: transparent;
  color: #475569;
  font-size: 19px;
}

.message {
  margin-top: 10px;
  min-height: 22px;
  font-size: 13px;
}

.idea {
  border: 1px solid #e2e8f0;
  border-radius: 15px;
  padding: 18px;
  margin-top: 12px;
  background: #fff;
}

.idea h3 {
  margin-top: 0;
  color: #1d4ed8;
}

footer {
  text-align: center;
  padding: 30px 15px;
  color: #64748b;
  font-size: 13px;
}

@media (max-width: 700px) {
  .auth-grid {
    grid-template-columns: 1fr;
  }

  header {
    padding: 15px 5%;
  }

  .hero {
    padding: 45px 18px;
  }

  .section {
    padding: 18px;
  }
}
</style>
</head>

<body>

<header>
  <div class="logo">چیکام</div>
  <div class="header-text">هر ایده آغاز یک مسیر</div>
</header>

<section class="hero">
  <div class="hero-badge">فضای ایده‌ها و همکاری</div>
  <h1>هر ایده آغاز یک مسیر</h1>
  <p>
    ایده‌ات را مطرح کن، آن را توسعه بده و با دیگران برای ساختنش همراه شو.
    چیکام برای تبدیل ایده‌های ساده به مسیرهای واقعی ساخته می‌شود.
  </p>
</section>

<div class="container">

<section class="section ad-section">
  <h2 class="section-title">📢 تبلیغات کاربران</h2>

  <div class="ad-card">
    <div class="ad-label">فضای تبلیغاتی چیکام</div>
    <h3>محصول یا خدمات خود را معرفی کنید</h3>
    <p>
      این بخش برای تبلیغات کاربران و معرفی محصولات، خدمات و پروژه‌ها در نظر گرفته شده است.
    </p>
    <button class="ad-button" onclick="alert('بخش ثبت تبلیغات به‌زودی فعال می‌شود')">
      ثبت تبلیغ
    </button>
  </div>
</section>

<section class="section">
  <h2 class="section-title">حساب کاربری</h2>

  <div class="auth-grid">

    <div class="box">
      <h3>ثبت‌نام</h3>

      <input id="regUsername" placeholder="نام کاربری">

      <input id="regPhone" placeholder="شماره تلفن">

      <div class="password-wrap">
        <input id="regPassword" type="password" placeholder="رمز عبور">
        <button class="eye" type="button" onclick="togglePassword('regPassword', this)">👁️</button>
      </div>

      <button onclick="registerUser()">ایجاد حساب</button>

      <div id="regMessage" class="message"></div>
    </div>

    <div class="box">
      <h3>ورود</h3>

      <input id="loginUsername" placeholder="نام کاربری">

      <div class="password-wrap">
        <input id="loginPassword" type="password" placeholder="رمز عبور">
        <button class="eye" type="button" onclick="togglePassword('loginPassword', this)">👁️</button>
      </div>

      <button onclick="loginUser()">ورود</button>

      <div id="loginMessage" class="message"></div>
    </div>

  </div>
</section>

<section class="section">
  <h2 class="section-title">💡 ثبت ایده</h2>

  <div class="box">

    <input id="ideaTitle" placeholder="عنوان ایده">

    <textarea id="ideaDescription" placeholder="توضیح ایده"></textarea>

    <textarea id="ideaSolution" placeholder="راه‌حل یا پیشنهاد"></textarea>

    <input id="ideaCategory" placeholder="دسته‌بندی">

    <select id="ideaParticipation">
      <option value="همکاری">نوع مشارکت: همکاری</option>
      <option value="سرمایه‌گذاری">سرمایه‌گذاری</option>
      <option value="مشاوره">مشاوره</option>
      <option value="اجرا">اجرا</option>
    </select>

    <button onclick="createIdea()">ثبت ایده</button>

    <div id="ideaMessage" class="message"></div>

  </div>
</section>

<section class="section">
  <h2 class="section-title">🌱 ایده‌های چیکام</h2>
  <div id="ideasList">در حال دریافت ایده‌ها...</div>
</section>

</div>

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

async function registerUser() {
  const username = document.getElementById("regUsername").value.trim();
  const phone = document.getElementById("regPhone").value.trim();
  const password = document.getElementById("regPassword").value;

  const message = document.getElementById("regMessage");

  if (!username || !phone || !password) {
    message.textContent = "لطفاً همه فیلدها را تکمیل کنید.";
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
        phone,
        password
      })
    });

    const data = await response.json();

    message.textContent = data.message || "عملیات انجام شد.";
  } catch (error) {
    message.textContent = "ارتباط با سرور برقرار نشد.";
  }
}

async function loginUser() {
  const username = document.getElementById("loginUsername").value.trim();
  const password = document.getElementById("loginPassword").value;

  const message = document.getElementById("loginMessage");

  if (!username || !password) {
    message.textContent = "نام کاربری و رمز عبور را وارد کنید.";
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

    message.textContent = data.message || "عملیات انجام شد.";
  } catch (error) {
    message.textContent = "ارتباط با سرور برقرار نشد.";
  }
}

async function createIdea() {
  const title = document.getElementById("ideaTitle").value.trim();
  const description = document.getElementById("ideaDescription").value.trim();
  const solution = document.getElementById("ideaSolution").value.trim();
  const category = document.getElementById("ideaCategory").value.trim();
  const participation_type =
    document.getElementById("ideaParticipation").value;

  const message = document.getElementById("ideaMessage");

  if (!title || !description) {
    message.textContent = "عنوان و توضیح ایده الزامی است.";
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
        participation_type
      })
    });

    const data = await response.json();

    message.textContent = data.message || "ایده ثبت شد.";

    if (response.ok) {
      document.getElementById("ideaTitle").value = "";
      document.getElementById("ideaDescription").value = "";
      document.getElementById("ideaSolution").value = "";
      document.getElementById("ideaCategory").value = "";

      loadIdeas();
    }
  } catch (error) {
    message.textContent = "ارتباط با سرور برقرار نشد.";
  }
}

async function loadIdeas() {
  const list = document.getElementById("ideasList");

  try {
    const response = await fetch("/ideas");
    const ideas = await response.json();

    if (!Array.isArray(ideas) || ideas.length === 0) {
      list.innerHTML = "هنوز ایده‌ای ثبت نشده است.";
      return;
    }

    list.innerHTML = "";

    ideas.forEach(function(idea) {
      const div = document.createElement("div");
      div.className = "idea";

      const title = document.createElement("h3");
      title.textContent = idea.title || "بدون عنوان";

      const description = document.createElement("p");
      description.textContent = idea.description || "";

      const solution = document.createElement("p");
      solution.textContent = idea.solution
        ? "راه‌حل: " + idea.solution
        : "";

      const category = document.createElement("p");
      category.textContent = idea.category
        ? "دسته‌بندی: " + idea.category
        : "";

      div.appendChild(title);
      div.appendChild(description);

      if (idea.solution) {
        div.appendChild(solution);
      }

      if (idea.category) {
        div.appendChild(category);
      }

      list.appendChild(div);
    });

  } catch (error) {
    list.textContent = "دریافت ایده‌ها با مشکل مواجه شد.";
  }
}

loadIdeas();

</script>

</body>
</html>
  `);
});

app.get("/db-test", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW() AS time");

    res.json({
      message: "اتصال به PostgreSQL موفق است",
      time: result.rows[0].time
    });
  } catch (error) {
    res.status(500).json({
      message: "خطا در اتصال به PostgreSQL",
      error: error.message
    });
  }
});

app.post("/register", async (req, res) => {
  try {
    const { username, phone, password } = req.body;

    if (!username || !phone || !password) {
      return res.status(400).json({
        message: "همه فیلدها الزامی هستند."
      });
    }

    const existing = await pool.query(
      "SELECT id FROM users WHERE username = $1",
      [username]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({
        message: "این نام کاربری قبلاً ثبت شده است."
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await pool.query(
      "INSERT INTO users (username, phone, password) VALUES ($1, $2, $3)",
      [username, phone, hashedPassword]
    );

    res.json({
      message: "ثبت‌نام با موفقیت انجام شد."
    });

  } catch (error) {
    res.status(500).json({
      message: "خطا در ثبت‌نام",
      error: error.message
    });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        message: "نام کاربری و رمز عبور الزامی است."
      });
    }

    const result = await pool.query(
      "SELECT * FROM users WHERE username = $1",
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        message: "نام کاربری یا رمز عبور اشتباه است."
      });
    }

    const user = result.rows[0];

    const validPassword = await bcrypt.compare(
      password,
      user.password
    );

    if (!validPassword) {
      return res.status(401).json({
        message: "نام کاربری یا رمز عبور اشتباه است."
      });
    }

    res.json({
      message: "ورود با موفقیت انجام شد.",
      username: user.username
    });

  } catch (error) {
    res.status(500).json({
      message: "خطا در ورود",
      error: error.message
    });
  }
});

app.get("/ideas", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, title, description, solution, category, participation_type, status, created_at FROM ideas ORDER BY id DESC"
    );

    res.json(result.rows);

  } catch (error) {
    res.status(500).json({
      message: "خطا در دریافت ایده‌ها",
      error: error.message
    });
  }
});

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
        message: "عنوان و توضیح ایده الزامی است."
      });
    }

    const result = await pool.query(
      `INSERT INTO ideas
      (title, description, solution, category, participation_type, status, created_at)
      VALUES ($1, $2, $3, $4, $5, 'open', CURRENT_DATE)
      RETURNING id`,
      [
        title,
        description,
        solution || "",
        category || "",
        participation_type || ""
      ]
    );

    res.json({
      message: "ایده با موفقیت ثبت شد.",
      id: result.rows[0].id
    });

  } catch (error) {
    res.status(500).json({
      message: "خطا در ثبت ایده",
      error: error.message
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("Chikam server running on port " + PORT);
});
