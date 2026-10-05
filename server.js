import express from 'express';
import pg from 'pg';

const { Pool } = pg;
const app = express();
const port = process.env.PORT || 8080;

app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.get('/', (req, res) => {
  res.json({
    status: 'online',
    service: 'capable-elegance-backend'
  });
});

app.get('/db-test', async (req, res) => {
  try {
    const r = await pool.query('SELECT NOW() AS time');
    res.json({
      database: 'connected',
      time: r.rows[0].time
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/users', async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT id, username FROM users ORDER BY id'
    );
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        error: 'username and password are required'
      });
    }

    const r = await pool.query(
      'INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id, username',
      [username, password]
    );

    res.status(201).json({
      message: 'user registered',
      user: r.rows[0]
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/register.html', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>ثبت نام</title>
</head>
<body>
<h2>ثبت نام کاربر</h2>

<input id="username" placeholder="username">
<br><br>

<input id="password" type="password" placeholder="password">
<br><br>

<button onclick="register()">ثبت نام</button>

<p id="result"></p>

<script>
async function register() {
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;

  const r = await fetch('/register', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({username, password})
  });

  const data = await r.json();
  document.getElementById('result').textContent =
    data.message || data.error;
}
</script>

</body>
</html>
  `);
});

app.listen(port, '0.0.0.0', () => {
  console.log('Backend running on port ' + port);
});
