import express from 'express';
import pg from 'pg';

const { Pool } = pg;
const app = express();
const port = process.env.PORT || 8080;

app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('sslmode=require')
    ? { rejectUnauthorized: false }
    : false
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

    const result = await pool.query(
      'INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id, username',
      [username, password]
    );

    res.status(201).json({
      message: 'user registered',
      user: result.rows[0]
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/register.html', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="fa">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ثبت نام</title>
</head>
<body style="font-family:Arial;max-width:400px;margin:50px auto;padding:20px">
<h2>ثبت نام کاربر</h2>

<input id="username" placeholder="نام کاربری"
style="width:100%;padding:12px;margin:8px 0">

<input id="password" type="password" placeholder="رمز عبور"
style="width:100%;padding:12px;margin:8px 0">

<button onclick="register()"
style="width:100
