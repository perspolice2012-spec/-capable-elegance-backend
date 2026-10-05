خطایی در اعمال تغییرات شما رخ داد: فایل قابل ویرایش نبود
پیام ;

app.get('/db-test', async (req, res) => {
  try {
    const r = await pool.query('SELECT NOW() AS time');

    res.json({
      database: 'connected',
      time: r.rows[0].time
    });
  } catch (e) {
    console.error(e);

    res.status(500).json({
      database: 'error',
      message: e.message
    });
  }
});

app.get('/users', async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT id, username FROM users ORDER BY id'
    );

    res.json
