import express from "express";
import { Pool } from "pg";
import bcrypt from "bcryptjs";

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

/* =========================
   DATABASE
========================= */

async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(100) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      phone VARCHAR(30) UNIQUE NOT NULL,
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
                <h
