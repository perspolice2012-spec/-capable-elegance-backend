import express from 'express';
import pg from 'pg';
import bcrypt from 'bcryptjs';

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

    const hashedPassword = await bcrypt.hash(password, 12);

    const r = await pool.query(
      'INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id, username',
      [username, hashedPassword]
    );

    res.status(201).json({
      message: 'user registered',
      user: r.rows[0]
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        error: 'username and password are required'
      });
    }

    const r = await pool.query(
      'SELECT id, username, password FROM users WHERE username = $1',
      [username]
    );

    if (r.rows.length === 0) {
      return res.status(401).json({
        error: 'invalid username or password'
      });
    }

    const user = r.rows[0];

    const passwordMatch = await bcrypt.compare(
      password,
      user.password
    );

    if (!passwordMatch) {
      return res.status(401).json({
        error: 'invalid username or password'
      });
    }

    res.json({
      message: 'login successful',
      user: {
        id: user.id,
        username: user.username
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.get('/login.html', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>ورود</title>
</head>
<body>
<h2>ورود کاربر</h2>

<input id="username" placeholder="username">
<br><br>

<input id="password" type="password" placeholder="password">
<br><br>

<button onclick="login()">ورود</button>

<p id="result"></p>

<script>
async function login() {
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;

  const r = await fetch('/login', {
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
