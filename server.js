const express = require("express");
const path = require("path");
const { Pool } = require("pg");
const crypto = require("crypto");
const bodyParser = require("body-parser");

const app = express();
app.use(express.static(path.join(__dirname, "public")));
app.use(bodyParser.json());

const pool = new Pool({
  user: "muhammadjonparpiyev",
  host: "localhost",
  database: "upvote_db",
  password: "root",
  port: 5432,
});

// Telegram Auth Verification
const BOT_TOKEN = "7550159253:AAGKzBL6s2xKRTgt_eige8eO5aEJUrEsXsg";

function verifyTelegramAuth(data, botToken) {
  const { hash, ...fields } = data;
  const sorted = Object.keys(fields)
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join("\n");
  const secret = crypto.createHash("sha256").update(botToken).digest();
  const hmac = crypto.createHmac("sha256", secret).update(sorted).digest("hex");
  return hmac === hash;
}

// Auth Route
app.post("/auth/telegram", async (req, res) => {
  const data = req.body;
  if (!verifyTelegramAuth(data, BOT_TOKEN)) {
    return res.status(403).send({ error: "Auth failed" });
  }

  const { id: telegram_id, username, first_name, photo_url } = data;

  try {
    const result = await pool.query(
      `
      INSERT INTO users (telegram_id, username, first_name, photo_url)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (telegram_id) 
      DO UPDATE SET username = EXCLUDED.username, photo_url = EXCLUDED.photo_url
      RETURNING *
    `,
      [telegram_id, username, first_name, photo_url]
    );

    res.send(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).send(err);
  }
});

// Create Post
app.post("/post", async (req, res) => {
  const { user_id, content } = req.body;
  try {
    const result = await pool.query(
      `
      INSERT INTO posts (user_id, content)
      VALUES ($1, $2)
      RETURNING *
    `,
      [user_id, content]
    );
    res.send(result.rows[0]);
  } catch (err) {
    res.status(500).send(err);
  }
});

// Upvote Post
app.post("/upvote", async (req, res) => {
  const { user_id, post_id } = req.body;
  try {
    await pool.query(
      `
  INSERT INTO upvotes (user_id, post_id)
  VALUES ($1, $2)
  ON CONFLICT (user_id, post_id)
  DO NOTHING
`,
      [user_id, post_id]
    );
    res.send({ success: true });
  } catch (err) {
    res.status(500).send(err);
  }
});

// Get Posts with Upvotes
app.get("/posts", async (req, res) => {
  try {
    const { month } = req.query;
    let query = `
      SELECT 
        posts.id, posts.content, posts.created_at, 
        users.username, users.first_name, users.photo_url,
        COUNT(upvotes.id) AS upvotes
      FROM posts
      JOIN users ON posts.user_id = users.id
      LEFT JOIN upvotes ON posts.id = upvotes.post_id
    `;
    let params = [];
    if (month) {
      // Use PostgreSQL's date_trunc function to filter by month
      // This is more reliable than manual date calculations
      query += ` WHERE DATE_TRUNC('month', posts.created_at) = DATE_TRUNC('month', $1::date)`;
      params.push(`${month}-01`);
    }

    query += ` GROUP BY posts.id, users.username, users.first_name, users.photo_url
      ORDER BY upvotes DESC, posts.created_at DESC`;
    const result = await pool.query(query, params);

    res.send(result.rows);
  } catch (err) {
    console.error("Error in /posts:", err);
    res.status(500).send(err);
  }
});

// Serve index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Serve community.html
app.get("/community", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "community.html"));
});

app.listen(3000, () => {
  console.log("✅ Server running at http://localhost:3000");
});
