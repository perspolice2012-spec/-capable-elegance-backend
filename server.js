import express from "express";

const app = express();
const PORT = process.env.PORT || 8080;
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});
app.get("/", (req, res) => {
  res.send("چیکام - سرور فعال است");
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port " + PORT);
});
