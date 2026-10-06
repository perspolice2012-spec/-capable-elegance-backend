import express from 'express';
import pg from 'pg';
import bcrypt from 'bcryptjs';

const { Pool } = pg;

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false
});

/* صفحه اصلی */
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <title>پلتفرم ایده و مشارکت</title>

  <style>
    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      font-family: Tahoma, Arial, sans-serif;
      background: #f5f7fb;
      color: #1f2937;
    }

    header {
      background: #172554;
      color: white;
      padding: 18px 25px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 15px;
      flex-wrap: wrap;
    }

    header h1 {
      margin: 0;
      font-size: 22px;
    }

    nav button {
      border: none;
      background: white;
      color: #172554;
      padding: 10px 16px;
      border-radius: 8px;
      cursor: pointer;
      margin: 3px;
    }

    .container {
      max-width: 1100px;
      margin: 30px auto;
      padding: 0 18px;
    }

    .hero {
      background: white;
      border-radius: 16px;
      padding: 35px 25px;
      text-align: center;
      box-shadow: 0 3px 15px rgba(0,0,0,0.07);
    }

    .hero h2 {
      font-size: 30px;
      margin-top: 0;
      color: #172554;
    }

    .hero p {
      line-height: 2;
      font-size: 17px;
    }

    .main-button {
      background: #2563eb;
      color: white;
      border: none;
      padding: 13px 25px;
      border-radius: 9px;
      font-size: 16px;
      cursor: pointer;
    }

    .section-title {
      margin-top: 35px;
      margin-bottom: 15px;
    }

    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 18px;
    }

    .card {
      background: white;
      padding: 22px;
      border-radius: 14px;
      box-shadow: 0 3px 12px rgba(0,0,0,0.06);
    }

    .card h3 {
      margin-top: 0;
      color: #172554;
    }

    .login-area {
      margin-top: 30px;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 20px;
    }

    .form-box {
      background: white;
      padding: 25px;
      border-radius: 14px;
      box-shadow: 0 3px 12px rgba(0,0,0,0.06);
    }

    input {
      width: 100%;
      padding: 12px;
      margin: 8px 0;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      font-size: 15px;
    }

    .form-button {
      width: 100%;
      padding: 12px;
      border: none;
      border-radius: 8px;
      background: #2563eb;
      color: white;
      cursor: pointer;
      font-size: 15px;
      margin-top: 8px;
    }

    .result {
      min-height: 25px;
      margin-top: 10px;
    }

    footer {
      margin-top: 50px;
      padding: 25px;
      text-align: center;
      background: #172554;
      color: white;
    }
  </style>
</head>

<body>

<header>

  <h1>پلتفرم ایده و مشارکت</h1>

  <nav>
    <button onclick="goTo('home')">خانه</button>
    <button onclick="goTo('ideas')">ایده‌ها</button>
    <button onclick="goTo('groups')">گروه‌ها</button>
    <button onclick="goTo('profile')">حساب کاربری</button>
  </nav>

</header>


<div class="container">

  <section class="hero">

    <h2>ایده‌ای داری؟ با دیگران بسازش.</h2>

    <p>
      مسئله یا ایده خود را مطرح کن،
      دیگران نظر بدهند،
      روی راه‌حل‌ها رأی‌گیری کنید
      و بهترین ایده را با همکاری یکدیگر به مرحله اجرا برسانید.
    </p>

    <button class="main-button" onclick="showMessage()">
      💡 ثبت ایده یا مسئله جدید
    </button>

    <p id="mainMessage"></p>

  </section>


  <h2 class="section-title">چگونه کار می‌کند؟</h2>

  <div class="cards">

    <div class="card">
      <h3>💡 ۱. طرح ایده</h3>
      <p>
        یک مسئله، نیاز یا ایده جدید را با جامعه مطرح کن.
      </p>
    </div>

    <div class="card">
      <h3>👥 ۲. مشارکت</h3>
      <p>
        کاربران دیگر نظر و راه‌حل‌های خود را اضافه می‌کنند.
      </p>
    </div>

    <div class="card">
      <h3>🗳️ ۳. رأی‌گیری</h3>
      <p>
        اعضا به راه‌حل‌های مختلف رأی می‌دهند.
      </p>
    </div>

    <div class="card">
      <h3>🚀 ۴. اجرا</h3>
      <p>
        افراد علاقه‌مند برای اجرای ایده منتخب با هم همکاری می‌کنند.
      </p>
    </div>

  </div>


  <h2 class="section-title">امکانات آینده</h2>

  <div class="cards">

    <div class="card">
      <h3>🤖 دستیار هوش مصنوعی</h3>
      <p>
        خلاصه‌سازی بحث‌ها، دسته‌بندی ایده‌ها و کمک به تبدیل ایده به برنامه عملی.
      </p>
    </div>

    <div class="card">
      <h3>🌍 چندزبانه</h3>
      <p>
        امکان استفاده کاربران از زبان‌های مختلف دنیا.
      </p>
    </div>

    <div class="card">
      <h3>👤 پروفایل کاربران</h3>
      <p>
        هر کاربر می‌تواند فعالیت‌ها و مشارکت‌های خود را مدیریت کند.
      </p>
    </div>

    <div class="card">
      <h3>📢 تبلیغات محدود</h3>
      <p>
        فضای کوچک و کنترل‌شده برای معرفی محصولات و خدمات کاربران.
      </p>
    </div>

  </div>


  <div class="login-area">

    <div class="form-box">

      <h2>ثبت‌نام</h2>

      <input
        id="registerUsername"
        type="text"
        placeholder="نام کاربری"
      >

      <input
        id="registerPassword"
        type="password"
        placeholder="رمز عبور"
      >

      <button class="form-button" onclick="register()">
        ثبت‌نام
      </button>

      <p class="result" id="registerResult"></p>

    </div>


    <div class="form-box">

      <h2>ورود</h2>

      <input
        id="loginUsername"
        type="text"
        placeholder="نام کاربری"
      >

      <input
        id="loginPassword"
        type="password"
        placeholder="رمز عبور"
      >

      <button class="form-button" onclick="login()">
        ورود
      </button>

      <p class="result" id="loginResult"></p>

    </div>

  </div>

</div>


<footer>
  پلتفرم ایده و مشارکت — فکر بهتر، همکاری بیشتر، اجرای واقعی
</footer>


<script>

function showMessage() {
  document.getElementById('mainMessage').textContent =
    'بخش ثبت ایده در مرحله بعد فعال می‌شود.';
}

function goTo(section) {
  if (section === 'home') {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (section === 'ideas') {
    alert('بخش ایده‌ها در مرحله بعد فعال می‌شود.');
  }

  if (section === 'groups') {
    alert('بخش گروه‌ها در مرحله بعد فعال می‌شود.');
  }

  if (section === 'profile') {
    alert('پروفایل کاربران در مرحله بعد فعال می‌شود.');
  }
}


async function register() {

  const username =
    document.getElementById('registerUsername').value.trim();

  const password =
    document.getElementById('registerPassword').value;

  if (!username || !password) {
    document.getElementById('registerResult').textContent =
      'نام کاربری و رمز عبور را وارد کنید';
    return;
  }

  try {

    const r = await fetch('/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username,
        password
      })
    });

    const data = await r.json();

    document.getElementById('registerResult').textContent =
      data.message || data.error || 'خطا';

  } catch (error) {

    document.getElementById('registerResult').textContent =
      'خطا در اتصال به سرور';

  }
}


async function login() {

  const username =
    document.getElementById('loginUsername').value.trim();

  const password =
    document.getElementById('loginPassword').value;

  if (!username || !password) {
    document.getElementById('loginResult').textContent =
      'نام کاربری و رمز عبور را وارد کنید';
    return;
  }

  try {

    const r = await fetch('/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username,
        password
      })
    });

    const data = await r.json();

    document.getElementById('loginResult').textContent =
      data.message || data.error || 'خطا';

  } catch (error) {

    document.getElementById('loginResult').textContent =
      'خطا در اتصال به سرور';

  }
}

</script>

</body>
</html>
  `);
});


/* ثبت‌نام */
app.post('/register', async (req, res) => {

  try {

    const { username, password } = req.body;

    if (!username || !password) {

      return res.status(400).json({
        error: 'نام کاربری و رمز عبور را وارد کنید'
      });

    }

    const existingUser = await pool.query(
      'SELECT id FROM users WHERE username = $1 LIMIT 1',
      [username]
    );

    if (existingUser.rows.length > 0) {

      return res.status(409).json({
        error: 'این نام کاربری قبلاً ثبت شده است'
      });

    }

    const hashedPassword =
      await bcrypt.hash(password, 10);

    await pool.query(
      'INSERT INTO users (username, password) VALUES ($1, $2)',
      [username, hashedPassword]
    );

    return res.status(201).json({
      message: 'ثبت‌نام با موفقیت انجام شد'
    });

  } catch (error) {

    console.error('Register error:', error);

    return res.status(500).json({
      error: 'خطای سرور یا دیتابیس'
    });

  }

});


/* ورود */
app.post('/login', async (req, res) => {

  try {

    const { username, password } = req.body;

    if (!username || !password) {

      return res.status(400).json({
        error: 'نام کاربری و رمز عبور را وارد کنید'
      });

    }

    const result = await pool.query(
      'SELECT * FROM users WHERE username = $1 LIMIT 1',
      [username]
    );

    if (result.rows.length === 0) {

      return res.status(401).json({
        error: 'نام کاربری یا رمز عبور اشتباه است'
      });

    }

    const user = result.rows[0];

    const passwordMatch =
      await bcrypt.compare(
        password,
        user.password
      );

    if (!passwordMatch) {

      return res.status(401).json({
        error: 'نام کاربری یا رمز عبور اشتباه است'
      });

    }

    return res.json({
      message: 'ورود موفق بود'
    });

  } catch (error) {

    console.error('Login error:', error);

    return res.status(500).json({
      error: 'خطای سرور یا دیتابیس'
    });

  }

});


/* تست دیتابیس */
app.get('/db-test', async (req, res) => {

  try {

    const result = await pool.query('SELECT NOW()');

    res.json({
      message: 'اتصال به PostgreSQL موفق است',
      time: result.rows[0].now
    });

  } catch (error) {

    console.error('Database error:', error);

    res.status(500).json({
      error: 'اتصال به PostgreSQL ناموفق است'
    });

  }

});


app.listen(port, '0.0.0.0', () => {
  console.log('Backend running on port ' + port);
});
