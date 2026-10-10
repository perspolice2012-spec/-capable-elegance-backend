import express from "express";
import pg from "pg";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";

const app = express();
const PORT = process.env.PORT || 8080;
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production"
    ? { rejectUnauthorized: false }
    : false
});

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

const sessions = new Map();
const COOKIE = "chikam_session";

function cookies(req) {
  const result = {};
  (req.headers.cookie || "").split(";").forEach(function (item) {
    const i = item.indexOf("=");
    if (i > -1) {
      result[item.slice(0, i).trim()] =
        decodeURIComponent(item.slice(i + 1).trim());
    }
  });
  return result;
}

function setSession(res, user) {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, {
    id: user.id,
    username: user.username,
    createdAt: Date.now()
  });
  res.setHeader(
    "Set-Cookie",
    COOKIE + "=" + token +
    "; HttpOnly; SameSite=Lax; Path=/; Secure"
  );
}

function currentUser(req) {
  const token = cookies(req)[COOKIE];
  const user = token ? sessions.get(token) : null;
  if (!user) return null;

  if (Date.now() - user.createdAt > 604800000) {
    sessions.delete(token);
    return null;
  }
  return user;
}

function requireUser(req, res, next) {
  const user = currentUser(req);
  if (!user) {
    return res.status(401).json({
      error: "ابتدا وارد حساب کاربری شوید."
    });
  }
  req.user = user;
  next();
}

function clean(value, max) {
  return String(value || "").trim().slice(0, max);
}

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      phone VARCHAR(40),
      email VARCHAR(150),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ideas (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      username VARCHAR(50),
      title VARCHAR(200) NOT NULL,
      description TEXT NOT NULL,
      category VARCHAR(80) DEFAULT 'عمومی',
      votes INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS comments (
      id SERIAL PRIMARY KEY,
      idea_id INTEGER NOT NULL
        REFERENCES ideas(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      username VARCHAR(50),
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS idea_votes (
      id SERIAL PRIMARY KEY,
      idea_id INTEGER NOT NULL
        REFERENCES ideas(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(idea_id, user_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ads (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      username VARCHAR(50),
      title VARCHAR(150) NOT NULL,
      body TEXT NOT NULL,
      contact VARCHAR(200),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

app.get("/db-test", async function (req, res) {
  try {
    const result = await pool.query("SELECT NOW() AS time");
    res.json({
      ok: true,
      message: "اتصال پایگاه داده برقرار است.",
      time: result.rows[0].time
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      ok: false,
      error: "اتصال پایگاه داده ناموفق بود."
    });
  }
});

app.post("/register", async function (req, res) {
  try {
    const username = clean(req.body.username, 50);
    const password = String(req.body.password || "");
    const phone = clean(req.body.phone, 40);
    const email = clean(req.body.email, 150);

    if (username.length < 3 || password.length < 6) {
      return res.status(400).json({
        error: "نام کاربری حداقل ۳ و رمز عبور حداقل ۶ نویسه باشد."
      });
    }

    const hash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      "INSERT INTO users (username,password_hash,phone,email) VALUES ($1,$2,$3,$4) RETURNING id,username",
      [username, hash, phone || null, email || null]
    );

    setSession(res, result.rows[0]);

    res.json({
      ok: true,
      user: result.rows[0],
      message: "ثبت‌نام موفق بود."
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        error: "این نام کاربری قبلاً ثبت شده است."
      });
    }

    console.error(error);
    res.status(500).json({ error: "ثبت‌نام انجام نشد." });
  }
});

app.post("/login", async function (req, res) {
  try {
    const username = clean(req.body.username, 50);
    const password = String(req.body.password || "");

    const result = await pool.query(
      "SELECT id,username,password_hash FROM users WHERE username=$1",
      [username]
    );

    if (
      !result.rows.length ||
      !(await bcrypt.compare(password, result.rows[0].password_hash))
    ) {
      return res.status(401).json({
        error: "نام کاربری یا رمز عبور اشتباه است."
      });
    }

    const user = {
      id: result.rows[0].id,
      username: result.rows[0].username
    };

    setSession(res, user);

    res.json({
      ok: true,
      user: user,
      message: "ورود موفق بود."
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "ورود انجام نشد." });
  }
});

app.get("/me", function (req, res) {
  res.json({ user: currentUser(req) });
});

app.post("/logout", function (req, res) {
  const token = cookies(req)[COOKIE];

  if (token) sessions.delete(token);

  res.setHeader(
    "Set-Cookie",
    COOKIE + "=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0; Secure"
  );

  res.json({ ok: true, message: "خارج شدید." });
});

app.get("/ideas", async function (req, res) {
  try {
    const result = await pool.query(`
      SELECT i.id, i.username, i.title, i.description,
             i.category, i.votes, i.created_at,
             (SELECT COUNT(*)::int FROM comments c
              WHERE c.idea_id = i.id) AS comments_count
      FROM ideas i
      ORDER BY i.created_at DESC
      LIMIT 100
    `);

    res.json({ ideas: result.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "دریافت ایده‌ها ناموفق بود."
    });
  }
});

app.post("/ideas", requireUser, async function (req, res) {
  try {
    const title = clean(req.body.title, 200);
    const description = clean(req.body.description, 5000);
    const category = clean(req.body.category || "عمومی", 80);

    if (title.length < 3 || description.length < 5) {
      return res.status(400).json({
        error: "عنوان و توضیح ایده را کامل وارد کنید."
      });
    }

    const result = await pool.query(
      "INSERT INTO ideas (user_id,username,title,description,category) VALUES ($1,$2,$3,$4,$5) RETURNING *",
      [
        req.user.id,
        req.user.username,
        title,
        description,
        category
      ]
    );

    res.json({
      ok: true,
      idea: result.rows[0],
      message: "ایده ثبت شد."
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "ثبت ایده ناموفق بود."
    });
  }
});

app.post("/ideas/:id/vote", requireUser, async function (req, res) {
  try {
    const ideaId = Number(req.params.id);

    if (!Number.isInteger(ideaId) || ideaId < 1) {
      return res.status(400).json({ error: "شناسه ایده معتبر نیست." });
    }

    const result = await pool.query(
      "UPDATE ideas SET votes = COALESCE(votes, 0) + 1 WHERE id = $1 RETURNING id, votes",
      [ideaId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "ایده پیدا نشد." });
    }

    res.json({
      ok: true,
      idea: result.rows[0],
      message: "رأی شما ثبت شد."
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "ثبت رأی انجام نشد." });
  }
});

app.post("/ideas/:id/comments", requireUser, async function (req, res) {
  try {
    const ideaId = Number(req.params.id);
    const body = clean(req.body.body, 2000);

    if (!Number.isInteger(ideaId) || ideaId < 1 || body.length < 2) {
      return res.status(400).json({
        error: "شناسه ایده یا متن نظر معتبر نیست."
      });
    }

    const idea = await pool.query(
      "SELECT id FROM ideas WHERE id = $1",
      [ideaId]
    );

    if (!idea.rows.length) {
      return res.status(404).json({ error: "ایده پیدا نشد." });
    }

    const result = await pool.query(
      "INSERT INTO comments (idea_id,user_id,username,body) VALUES ($1,$2,$3,$4) RETURNING id,idea_id,username,body,created_at",
      [ideaId, req.user.id, req.user.username, body]
    );

    res.json({
      ok: true,
      comment: result.rows[0],
      message: "نظر شما ثبت شد."
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "ثبت نظر انجام نشد." });
  }
});

app.get("/ideas/:id/comments", async function (req, res) {
  try {
    const ideaId = Number(req.params.id);

    if (!Number.isInteger(ideaId) || ideaId < 1) {
      return res.status(400).json({ error: "شناسه ایده معتبر نیست." });
    }

    const result = await pool.query(
      "SELECT id,username,body,created_at FROM comments WHERE idea_id = $1 ORDER BY created_at ASC LIMIT 200",
      [ideaId]
    );

    res.json({ comments: result.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "دریافت نظرها انجام نشد." });
  }
});

app.get("/ads", async function (req, res) {
  try {
    const result = await pool.query(
      "SELECT id,username,title,description,created_at FROM ads ORDER BY created_at DESC LIMIT 50"
    );

    res.json({ ads: result.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "دریافت تبلیغات انجام نشد." });
  }
});

app.post("/ads", requireUser, async function (req, res) {
  try {
    const title = clean(req.body.title, 150);
    const description = clean(req.body.description, 1500);

    if (title.length < 3 || description.length < 5) {
      return res.status(400).json({
        error: "عنوان و توضیحات تبلیغ را کامل وارد کنید."
      });
    }

    const result = await pool.query(
      "INSERT INTO ads (user_id,username,title,description) VALUES ($1,$2,$3,$4) RETURNING *",
      [req.user.id, req.user.username, title, description]
    );

    res.json({
      ok: true,
      ad: result.rows[0],
      message: "تبلیغ ثبت شد."
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "ثبت تبلیغ انجام نشد." });
  }
});

  event.preventDefault();

  try {
    const data = await api("/ideas/" + ideaId + "/comments", {
      method: "POST",
      body: JSON.stringify(formData(event.target))
    });

    showMessage(data.message);
    await loadIdeas();
  } catch (error) {
    showMessage(error.message);
  }
});

async function loadAds() {
  const list = document.getElementById("adList");

  try {
    const data = await api("/ads");

    if (!data.ads.length) {
      list.textContent = "هنوز تبلیغی ثبت نشده است.";
      return;
    }

    list.innerHTML = data.ads.map(function (ad) {
      return '<article class="ad">' +
        '<h3>' + escapeHtml(ad.title) + '</h3>' +
        '<p>' + escapeHtml(ad.description) + '</p>' +
        '<p class="small">منتشرکننده: ' +
        escapeHtml(ad.username) + '</p>' +
        '</article>';
    }).join("");
  } catch (error) {
    list.textContent = error.message;
  }
}

document.getElementById("adForm").addEventListener("submit", async function (event) {
  event.preventDefault();

  try {
    const data = await api("/ads", {
      method: "POST",
      body: JSON.stringify(formData(event.target))
    });

    showMessage(data.message);
    event.target.reset();
    await loadAds();
  } catch (error) {
    showMessage(error.message);
  }
});

document.getElementById("refreshIdeas").addEventListener("click", loadIdeas);

loadIdeas();
loadAds();
refreshUser();
</script>
</body>
</html>`);
    });

    const PORT = process.env.PORT || 8080;

    app.listen(PORT, "0.0.0.0", function () {
      console.log("CHIKAM server listening on port " + PORT);
    });
  } catch (error) {
    console.error("CHIKAM startup failed:", error);
    process.exit(1);
  }
}

startServer();
