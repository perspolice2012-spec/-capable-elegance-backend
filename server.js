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
          padding: 30px;
        }

        .box {
          max-width: 600px;
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

        input {
          width: 100%;
          padding: 12px;
          margin: 8px 0 15px;
          box-sizing: border-box;
          border: 1px solid #ddd;
          border-radius: 10px;
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
      </style>
    </head>

    <body>

      <div class="box">
        <h1>چیکام</h1>
        <p class="center">ایده‌ای داری؟ با دیگران بسازش.</p>
      </div>

      <div class="box">
        <h2>ثبت‌نام</h2>

        <input
          id="registerUser"
          placeholder="نام کاربری"
        >

        <input
          id="registerPass"
          type="password"
          placeholder="رمز عبور"
        >

        <div class="center">
          <button onclick="register()">ثبت‌نام</button>
        </div>
      </div>

      <div class="box">
        <h2>ورود</h2>

        <input
          id="loginUser"
          placeholder="نام کاربری"
        >

        <input
          id="loginPass"
          type="password"
          placeholder="رمز عبور"
        >

        <div class="center">
          <button onclick="login()">ورود</button>
        </div>
      </div>

      <script>

        async function register() {

          const username =
            document.getElementById("registerUser").value.trim();

          const password =
            document.getElementById("registerPass").value;

          if (!username || !password) {
            alert("نام کاربری و رمز عبور را وارد کنید.");
            return;
          }

          try {

            const response = await fetch("/register", {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                username,
                password
              })
            });

            const data = await response.json();

            alert(data.message);

          } catch (error) {

            alert("خطا در ارتباط با سرور.");

          }
        }

        async function login() {

          const username =
            document.getElementById("loginUser").value.trim();

          const password =
            document.getElementById("loginPass").value;

          if (!username || !password) {
            alert("نام کاربری و رمز عبور را وارد کنید.");
            return;
          }

          try {

            const response = await fetch("/login", {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                username,
                password
              })
            });

            const data = await response.json();

            alert(data.message);

          } catch (error) {

            alert("خطا در ارتباط با سرور.");

          }
        }

      </script>

    </body>
    </html>
  `);
});

app.get("/db-test", async (req, res) => {

  try {

    const result = await pool.query("SELECT NOW()");

    res.json({
      message: "اتصال به PostgreSQL موفق است",
      time: result.rows[0].now
    });

  } catch (error) {

    res.status(500).json({
      message: "خطا در اتصال به PostgreSQL",
      error: error.message
    });

  }

});

app.post("/register", async (req, res) => {

  try {

    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        message: "نام کاربری و رمز عبور الزامی است"
      });
    }

    if (username.length < 3) {
      return res.status(400).json({
        message: "نام کاربری باید حداقل ۳ کاراکتر باشد"
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        message: "رمز عبور باید حداقل ۶ کاراکتر باشد"
      });
    }

    const check = await pool.query(
      "SELECT id FROM users WHERE username = $1",
      [username]
    );

    if (check.rows.length > 0) {
      return res.status(409).json({
        message: "این نام کاربری قبلاً ثبت شده است"
      });
    }

    const hashedPassword =
      await bcrypt.hash(password, 10);

    await pool.query(
      "INSERT INTO users (username, password) VALUES ($1, $2)",
      [username, hashedPassword]
    );

    res.json({
      message: "ثبت‌نام با موفقیت انجام شد"
    });

  } catch (error) {

    res.status(500).json({
      message: "خطا در ثبت‌نام",
      error: error.message
    });

  }

});

app.post("/login", async (req, res) => {

  try {

    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        message: "نام کاربری و رمز عبور را وارد کنید"
      });
    }

    const result = await pool.query(
      "SELECT * FROM users WHERE username = $1",
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        message: "نام کاربری یا رمز عبور اشتباه است"
      });
    }

    const user = result.rows[0];

    const match =
      await bcrypt.compare(password, user.password);

    if (!match) {
      return res.status(401).json({
        message: "نام کاربری یا رمز عبور اشتباه است"
      });
    }

    res.json({
      message: "ورود موفق بود",
      user: {
        id: user.id,
        username: user.username
      }
    });

  } catch (error) {

    res.status(500).json({
      message: "خطا در ورود",
      error: error.message
    });

  }

});

app.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port " + PORT);
});
