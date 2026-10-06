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

app.get("/", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">

<title>چیکام | ایده‌ها را به واقعیت تبدیل کنیم</title>

<style>

*{
box-sizing:border-box;
}

body{
margin:0;
font-family:Tahoma,Arial,sans-serif;
background:#f4f6fb;
color:#202124;
}

.header{
background:linear-gradient(135deg,#4c1d95,#7c3aed,#9333ea);
color:white;
padding:18px 20px;
box-shadow:0 4px 18px rgba(0,0,0,.15);
}

.nav{
max-width:1050px;
margin:auto;
display:flex;
align-items:center;
justify-content:space-between;
gap:15px;
}

.logo{
font-size:27px;
font-weight:bold;
}

.logo span{
font-size:13px;
display:block;
opacity:.85;
margin-top:4px;
}

.nav-button{
background:white;
color:#5b21b6;
border:0;
border-radius:10px;
padding:10px 17px;
font-weight:bold;
cursor:pointer;
}

.hero{
max-width:1050px;
margin:28px auto 20px;
padding:35px 25px;
border-radius:24px;
background:linear-gradient(135deg,#ffffff,#f3e8ff);
box-shadow:0 5px 22px rgba(0,0,0,.08);
text-align:center;
}

.hero h1{
margin:0 0 12px;
font-size:34px;
color:#4c1d95;
}

.hero p{
font-size:17px;
color:#555;
margin:0 0 20px;
line-height:2;
}

.hero-button{
display:inline-block;
background:#6d28d9;
color:white;
border:0;
border-radius:12px;
padding:13px 25px;
font-size:15px;
cursor:pointer;
}

.container{
max-width:1050px;
margin:auto;
padding:0 15px 40px;
}

.section-title{
font-size:22px;
color:#4c1d95;
margin:30px 0 15px;
}

.ad-box{
background:white;
border-radius:18px;
padding:18px;
box-shadow:0 4px 18px rgba(0,0,0,.07);
border:1px solid #eee;
}

.ad-header{
display:flex;
align-items:center;
justify-content:space-between;
margin-bottom:14px;
}

.ad-label{
background:#fef3c7;
color:#92400e;
padding:6px 11px;
border-radius:20px;
font-size:12px;
font-weight:bold;
}

.ad-card{
display:flex;
align-items:center;
gap:18px;
background:linear-gradient(135deg,#faf5ff,#f5f3ff);
border:1px solid #e9d5ff;
border-radius:15px;
padding:18px;
}

.ad-icon{
width:65px;
height:65px;
border-radius:15px;
background:linear-gradient(135deg,#7c3aed,#a855f7);
color:white;
display:flex;
align-items:center;
justify-content:center;
font-size:30
