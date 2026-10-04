import express from 'express';
import pg from 'pg';
const { Pool } = pg;
const app = express();
app.use(express.json());
const port = process.env.PORT || 3000;
if (!process.env.DATABASE_URL) { console.error('DATABASE_URL is not set.'); process.exit(1); }
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL.includes('sslmode=require') ? {rejectUnauthorized:false} : false });
app.get('/', (req,res)=>res.json({status:'online',service:'capable-elegance-backend'}));
app.get('/db-test', async (req,res)=>{ try { const r=await pool.query('SELECT NOW() AS time'); res.json({database:'connected',time:r.rows[0].time}); } catch(e) { console.error(e); res.status(500).json({database:'error',message:e.message}); }});
app.get('/users', async (req,res)=>{ try { const r=await pool.query('SELECT * FROM users ORDER BY id'); res.json(r.rows); } catch(e) { console.error(e); res.status(500).json({error:e.message}); }});
app.listen(port,'0.0.0.0',()=>console.log(`Backend listening on port ${port}`));
