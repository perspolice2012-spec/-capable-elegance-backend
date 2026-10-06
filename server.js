import express from "express";

const app = express();
const PORT = process.env.PORT || 8080;
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});
app.get("/", (req, res) => {
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
  res.send("چیکام - سرور فعال است");
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port " + PORT);
});
