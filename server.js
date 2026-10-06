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
<title>چیکام</title>

<style>
body{
font-family:Tahoma;
background:#f5f7fb;
margin:0;
padding:20px
}

.box{
max-width:650px;
margin:20px auto;
background:white;
padding:20px;
border-radius:16px;
box-shadow:0 3px 12px #ddd
}

h1,h2{
text-align:center;
color:#5b21b6
}

.field{
position:relative;
margin:7px 0 12px
}

.field input{
width:100%;
box-sizing:border-box;
padding:12px 45px 12px 12px;
border:1px solid #ddd;
border-radius:9px;
font-family:Tahoma
}

textarea,select,input{
font-family:Tahoma
}

textarea,select{
width:100%;
box-sizing:border-box;
padding:12px;
margin:7px 0 12px;
border:1px solid #ddd;
border-radius:9px
}

textarea{
min-height:90px
}

.eye{
position:absolute;
right:10px;
top:50%;
transform:translateY(-50%);
border:0;
background:transparent;
font-size:20px;
cursor:pointer;
padding:0;
margin:0
}

button{
background:#6d28d9;
color:white;
border:0;
border-radius:9px;
padding:11px 18px;
margin:4px;
cursor:pointer
}

.center{
text-align:center
}

.hidden{
display:none
}

.idea{
border:1px solid #ddd;
border-radius:12px;
padding:12px;
margin-top:12px
}
</style>
</head>

<body>

<div class="box">
<h1>چیکام</h1>
<p class="center">ایده‌ای داری؟ با دیگران بسازش.</p>
</div>

<div class="box" id="authBox">

<h2>ثبت‌نام</h2>

<input id="regUser" placeholder="نام کاربری">

<div class="field">
<input id="regPass" type="password" placeholder="رمز عبور">
<button class="eye" type="button" onclick="togglePassword('regPass',this)">👁️</button>
</div>

<div class="center">
<button onclick="registerUser()">ثبت‌نام</button>
</div>

<hr>

<h2>ورود</h2>

<input id="loginUser" placeholder="نام کاربری">

<div class="field">
<input id="loginPass" type="password" placeholder="رمز عبور">
<button class="eye" type="button" onclick="togglePassword('loginPass',this)">👁️</button>
</div>

<div class="center">
<button onclick="loginUser()">ورود</button>
</div>

</div>

<div class="box hidden" id="ideaBox">

<h2>ثبت ایده جدید</h2>

<input id="ideaTitle" placeholder="عنوان ایده">

<textarea id="ideaDescription" placeholder="توضیح ایده"></textarea>

<textarea id="ideaSolution" placeholder="راه‌حل پیشنهادی"></textarea>

<input id="ideaCategory" placeholder="دسته‌بندی">

<select id="ideaParticipation">
<option value="همکاری">همکاری</option>
<option value="سرمایه‌گذاری">سرمایه‌گذاری</option>
<option value="مشاوره">مشاوره</option>
<option value="همکاری و سرمایه‌گذاری">همکاری و سرمایه‌گذاری</option>
</select>

<div class="center">
<button onclick="createIdea()">ثبت ایده</button>
</div>

</div>

<div class="box">
<h2>ایده‌های چیکام</h2>
<div id="ideaList">در حال دریافت ایده‌ها...</div>
</div>

<script>

function togglePassword(id,button){

const input=document.getElementById(id);

if(input.type==="password"){
input.type="text";
button.textContent="🙈";
}else{
input.type="password";
button.textContent="👁️";
}

}

async function registerUser(){

const username=document.getElementById("regUser").value.trim();
const password=document.getElementById("regPass").value;

if(!username || !password){
alert("نام کاربری و رمز عبور را وارد کنید.");
return;
}

const response=await fetch("/register",{
method:"POST",
headers:{"Content-Type":"application/json"},
body:JSON.stringify({
username:username,
password:password
})
});

const data=await response.json();

alert(data.message);

}

async function loginUser(){

const username=document.getElementById("loginUser").value.trim();
const password=document.getElementById("loginPass").value;

if(!username || !password){
alert("نام کاربری و رمز عبور را وارد کنید.");
return;
}

const response=await fetch("/login",{
method:"POST",
headers:{"Content-Type":"application/json"},
body:JSON.stringify({
username:username,
password:password
})
});

const data=await response.json();

alert(data.message);

if(response.ok){

document.getElementById("authBox").classList.add("hidden");
document.getElementById("ideaBox").classList.remove("hidden");

}

}

async function createIdea(){

const title=document.getElementById("ideaTitle").value.trim();
const description=document.getElementById("
