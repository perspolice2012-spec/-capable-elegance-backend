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
body{font-family:Tahoma;background:#f5f7fb;margin:0;padding:20px}
.box{max-width:650px;margin:20px auto;background:white;padding:20px;border-radius:16px;box-shadow:0 3px 12px #ddd}
h1,h2{color:#5b21b6;text-align:center}
input,textarea,select{width:100%;box-sizing:border-box;padding:12px;margin:7px 0 12px;border:1px solid #ddd;border-radius:9px;font-family:Tahoma}
textarea{min-height:90px}
button{background:#6d28d9;color:white;border:0;border-radius:9px;padding:11px 18px;margin:4px}
.center{text-align:center}
.idea{border:1px solid #ddd;border-radius:12px;padding:12px;margin-top:12px}
.hidden{display:none}
</style>
</head>
<body>

<div class="box">
<h1>چیکام</h1>
<p class="center">ایده‌ای داری؟ با دیگران بسازش.</p>
</div>

<div class="box" id="auth">
<h2>ثبت‌نام</h2>
<input id="ru" placeholder="نام کاربری">
<input id="rp" type="password" placeholder="رمز عبور">
<div class="center"><button onclick="register()">ثبت‌نام</button></div>

<hr>

<h2>ورود</h2>
<input id="lu" placeholder="نام کاربری">
<input id="lp" type="password" placeholder="رمز عبور">
<div class="center"><button onclick="login()">ورود</button></div>
</div>

<div class="box hidden" id="ideasBox">
<h2>ثبت ایده جدید</h2>
<input id="title" placeholder="عنوان ایده">
<textarea id="description" placeholder="توضیح ایده"></textarea>
<textarea id="solution" placeholder="راه‌حل پیشنهادی"></textarea>
<input id="category" placeholder="دسته‌بندی">

<select id="participation">
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
<div id="list">در حال دریافت ایده‌ها...</div>
</div>

<script>
async function register(){
const username=ru.value.trim(),password=rp.value;
if(!username||!password)return alert("نام کاربری و رمز عبور را وارد کنید.");
const r=await fetch("/register",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username,password})});
const d=await r.json();
alert(d.message);
}

async function login(){
const username=lu.value.trim(),password=lp.value;
if(!username||!password)return alert("نام کاربری و رمز عبور را وارد کنید.");
const r=await fetch("/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username,password})});
const d=await r.json();
alert(d.message);
if(r.ok){
auth.classList.add("hidden");
ideasBox.classList.remove("hidden");
}
}

async function createIdea(){
const data={
title:title.value.trim(),
description:description.value.trim(),
solution:solution.value.trim(),
category:category.value.trim(),
participation_type:participation.value
};

if(!data.title||!data.description)
return alert("عنوان و توضیح ایده الزامی است.");

const r=await fetch("/ideas",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});
const d=await r.json();
alert(d.message);

if(r.ok){
title.value="";
description.value="";
solution.value="";
category.value="";
loadIdeas();
}
}

async function loadIdeas(){
const r=await fetch("/ideas");
const d=await r.json();

if(!d.ideas||d.ideas.length===0){
list.innerHTML="<p>هنوز ایده‌ای ثبت نشده است.</p>";
return;
}

list.innerHTML=d.ideas.map(x=>`
<div class="idea">
<h3>${x.title}</h3>
<p><b>توضیح:</b> ${x.description}</p>
<p><b>راه‌حل:</b> ${x.solution||"-"}</p>
<p><b>دسته‌بندی:</b> ${x.category||"-"}</p>
<p><b>مشارکت:</b> ${x.participation_type||"-"}</p>
<p><b>وضعیت:</b> ${x.status||"open"}</p>
</div>
`).join("");
}

loadIdeas();
</script>

</body>
</html>
`);
});

app.get("/db-test",async(req,res)=>{
try{
const r=await pool.query("SELECT NOW()");
res.json({message:"اتصال به PostgreSQL موفق است",time:r.rows[0].now});
}catch(e){
res.status(500).json({message:"خطا در اتصال به PostgreSQL",error:e.message});
}
});

app.post("/register",async(req,res)=>{
try{
const {username,password}=req.body;

if(!username||!password)
return res.status(400).json({message:"نام کاربری و رمز عبور الزامی است"});

if(username.length<3)
return res.status(400).json({message:"نام کاربری باید حداقل ۳ کاراکتر باشد"});

if(password.length<6)
return res.status(400).json({message:"رمز عبور باید حداقل ۶ کاراکتر باشد"});

const check=await pool.query(
"SELECT id FROM users WHERE username=$1",[username]
);

if(check.rows.length)
return res.status(409).json({message:"این نام کاربری قبلاً ثبت شده است"});

const hash=await bcrypt.hash(password,10);

await pool.query(
"INSERT INTO users(username,password) VALUES($1,$2)",
[username,hash]
);

res.json({message:"ثبت‌نام با موفقیت انجام شد"});

}catch(e){
res.status(500).json({message:"خطا در ثبت‌نام",error:e.message});
}
});

app.post("/login",async(req,res)=>{
try{
const {username,password}=req.body;

const r=await pool.query(
"SELECT * FROM users WHERE username=$1",[username]
);

if(!r.rows.length)
return res.status(401).json({message:"نام کاربری یا رمز عبور اشتباه است"});

const user=r.rows[0];
const ok=await bcrypt.compare(password,user.password);

if(!ok)
return res.status(401).json({message:"نام کاربری یا رمز عبور اشتباه است"});

res.json({
message:"ورود موفق بود",
user:{id:user.id,username:user.username}
});

}catch(e){
res.status(500).json({message:"خطا در ورود",error:e.message});
}
});

app.get("/ideas",async(req,res)=>{
try{
const r=await pool.query(
"SELECT * FROM ideas ORDER BY id DESC"
);
res.json({ideas:r.rows});
}catch(e){
res.status(500).json({message:"خطا در دریافت ایده‌ها",error:e.message});
}
});

app.post("/ideas",async(req,res)=>{
try{
const {
title,
description,
solution,
category,
participation_type
}=req.body;

if(!title||!description)
return res.status(400).json({message:"عنوان و توضیح ایده الزامی است"});

const r=await pool.query(
`INSERT INTO ideas
(title,description,solution,category,participation_type)
VALUES($1,$2,$3,$4,$5)
RETURNING *`,
[
title,
description,
solution||"",
category||"",
participation_type||"همکاری"
]
);

res.json({
message:"ایده با موفقیت ثبت شد",
idea:r.rows[0]
});

}catch(e){
res.status(500).json({message:"خطا در ثبت ایده",error:e.message});
}
});

app.listen(PORT,"0.0.0.0",()=>{
console.log("Server running on port "+PORT);
});
