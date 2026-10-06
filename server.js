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
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>چیکام</title>

<style>
body {
  font-family: Tahoma, Arial, sans-serif;
  background: #f5f7fb;
  margin: 0;
  padding: 20px;
}

.box {
  max-width: 650px;
  margin: 20px auto;
  background: white;
  padding: 25px;
  border-radius: 18px;
  box-shadow: 0 4px 15px #ddd;
}

h1, h2 {
  color: #5b21b6;
  text-align: center;
}

input, textarea, select {
  width: 100%;
  padding: 12px;
  margin: 8px 0 15px;
  box-sizing: border-box;
  border: 1px solid #ddd;
  border-radius: 10px;
  font-family: Tahoma;
}

textarea {
  min-height: 100px;
  resize: vertical;
}

button {
  background: #6d28d9;
  color: white;
  border: 0;
  border-radius: 10px;
  padding: 12px 20px;
  cursor: pointer;
  margin: 5px;
}

.center {
  text-align: center;
}

.idea {
  border: 1px solid #ddd;
  border-radius: 14px;
  padding: 15px;
  margin-top: 15px;
}

.idea h3 {
  color: #5b21b6;
}

.hidden {
  display: none;
}
</style>
</head>

<body>

<div class="box">
  <
