import express from 'express';
import pg from 'pg';

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

// صفحه اصلی
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="fa">
<head>
  <meta charset="UTF-8">
  <title>ورود</title>
</head>
<body>

<h2>ورود به سیستم</h2>

<input id="username" type="text" placeholder="نام کاربری">
<br><br>

<input id="password" type="password" placeholder="رمز عبور">
<br><br>

<button onclick="login()">ورود</button>

<p id="result"></p>

<script>
async function login() {
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;

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

    document.getElementById('result').textContent =
      data.message || data.error || 'خطا';
  } catch (error) {
    document.getElementById('result').textContent =
      'خطا در اتصال به سرور';
  }
}
</script>

</body>
</html>
  `);
});

// ورود
app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        error: 'نام کاربری و رمز عبور را وارد کنید'
      });
    }

    const result = await pool.query(
      'SELECT * FROM users WHERE username = $1 AND password = $2',
      [username, password]
    );

    if (result.rows.length > 0) {
      return res.json({
        message: 'ورود موفق بود'
      });
    }

    return res.status(401).json({
      error: 'نام کاربری یا رمز عبور اشتباه است'
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: 'خطای سرور یا دیتابیس'
    });
  }
});

// تست اتصال دیتابیس
app.get('/db-test', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');

    res.json({
      message: 'اتصال به PostgreSQL موفق است',
      time: result.rows[0].now
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'اتصال به PostgreSQL ناموفق است'
    });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log('Backend running on port ' + port);
});
