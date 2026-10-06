'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const host=process.env.HOST||'127.0.0.1',port=Number(process.env.PORT||8080);
const dir=process.env.ZOE_DATA_DIR||path.join(__dirname,'.tmp','zoe');fs.mkdirSync(dir,{recursive:true,mode:0o700});
const db=new DatabaseSync(path.join(dir,'journal.sqlite'));db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,salt TEXT NOT NULL,role TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id INTEGER REFERENCES users(id),expires INTEGER);
CREATE TABLE IF NOT EXISTS invitations(token TEXT PRIMARY KEY,email TEXT NOT NULL,expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS entries(id TEXT PRIMARY KEY,data TEXT NOT NULL);
`);
const isLocal=['127.0.0.1','localhost','::1'].includes(host);
if(!isLocal&&!db.prepare('SELECT id FROM users LIMIT 1').get()&&!process.env.ZOE_SETUP_TOKEN)throw Error('Set ZOE_SETUP_TOKEN before exposing initial account setup.');
const token=()=>crypto.randomBytes(32).toString('hex'),hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const now=()=>Date.now();const limits=new Map();
function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
function user(req){const c=(req.headers.cookie||'').match(/(?:^|;\s*)zoe_session=([a-f0-9]{64})(?:;|$)/);if(!c)return null;return db.prepare('SELECT users.id,name,email,role FROM sessions JOIN users ON users.id=sessions.user_id WHERE token=? AND expires>?').get(hash(c[1]),now());}
async function body(req){let n=0,chunks=[];for await(const c of req){n+=c.length;if(n>3000000)throw Error('Request is too large');chunks.push(c);}return JSON.parse(Buffer.concat(chunks).toString()||'{}');}
function cookie(res,u){const t=token();db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash(t),u.id,now()+7*86400000);res.setHeader('Set-Cookie',`zoe_session=${t}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${process.env.ZOE_SECURE_COOKIES==='1'?'; Secure':''}`);}
function validateEntry(e){if(!e||typeof e.title!=='string'||!e.title.trim()||e.title.length>100)throw Error('A title of up to 100 characters is required');if(!/^\d{4}-\d{2}-\d{2}$/.test(e.date)||!Number.isFinite(Date.parse(e.date+'T12:00:00Z'))||new Date(e.date+'T12:00:00Z').toISOString().slice(0,10)!==e.date)throw Error('A valid date is required');if(!['Activities','Milestones','Progress'].includes(e.category))throw Error('Invalid category');if(!['Planned','In progress','Completed'].includes(e.status))throw Error('Invalid status');if(!Number.isInteger(e.progress)||e.progress<0||e.progress>100)throw Error('Progress must be 0–100');for(const [k,max]of [['location',120],['notes',3000]])if(typeof e[k]!=='string'||e[k].length>max)throw Error('Invalid '+k);if(e.photo!==null&&(typeof e.photo!=='string'||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(e.photo)||e.photo.length>2800000))throw Error('Photo must be JPEG, PNG, or WebP, up to 2 MB');return {id:typeof e.id==='string'&&/^[a-f0-9-]{36}$/.test(e.id)?e.id:crypto.randomUUID(),title:e.title.trim(),date:e.date,category:e.category,status:e.status,progress:e.progress,location:e.location.trim(),notes:e.notes,favorite:!!e.favorite,photo:e.photo};}
const root=path.join(__dirname,'builds','development');
const server=http.createServer(async(req,res)=>{
res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
try{
const url=new URL(req.url,'http://localhost'),p=url.pathname,write=!['GET','HEAD'].includes(req.method);
if(write){if(req.headers.origin&&req.headers.origin!==`${process.env.ZOE_SECURE_COOKIES==='1'?'https':'http'}://${req.headers.host}`)return json(res,403,{error:'Request origin denied'});if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))return json(res,415,{error:'JSON requests required'});}
let ownerExists=!!db.prepare('SELECT id FROM users LIMIT 1').get();const u=user(req);
if(p==='/api/session'&&req.method==='GET')return json(res,200,{user:u,setup:!ownerExists,setupCodeRequired:!ownerExists&&!!process.env.ZOE_SETUP_TOKEN,invited:!!(url.searchParams.get('invite')&&db.prepare('SELECT token FROM invitations WHERE token=? AND expires>?').get(hash(url.searchParams.get('invite')),now()))});
if(['/api/login','/api/register'].includes(p)&&req.method==='POST'){
const key=req.socket.remoteAddress;let rate=limits.get(key)||{n:0,end:now()+60000};if(rate.end<now())rate={n:0,end:now()+60000};rate.n++;limits.set(key,rate);if(rate.n>12)return json(res,429,{error:'Too many attempts. Try again in a minute.'});
const b=await body(req),email=String(b.email||'').trim().toLowerCase();if(email.length>254||!/^\S+@\S+\.\S+$/.test(email)||typeof b.password!=='string'||b.password.length>256)throw Error('Enter a valid email and password');let account;
if(p==='/api/login'){account=db.prepare('SELECT * FROM users WHERE email=?').get(email);const salt=account?account.salt:'invalid-login-salt';const h=crypto.scryptSync(b.password,salt,64).toString('hex');if(!account||!crypto.timingSafeEqual(Buffer.from(h,'hex'),Buffer.from(account.password,'hex')))return json(res,401,{error:'Email or password is incorrect'});}
else{
ownerExists=!!db.prepare('SELECT id FROM users LIMIT 1').get();
if(b.password.length<12)throw Error('Use a password with at least 12 characters');if(typeof b.name!=='string'||!b.name.trim()||b.name.length>80)throw Error('Your name is required');
let invite;if(ownerExists){invite=db.prepare('SELECT * FROM invitations WHERE token=? AND email=? AND expires>?').get(hash(String(b.invite||'')),email,now());if(!invite)return json(res,403,{error:'This invitation is invalid, expired, or belongs to another email'});}else if(process.env.ZOE_SETUP_TOKEN&&b.setupToken!==process.env.ZOE_SETUP_TOKEN)return json(res,403,{error:'Setup code is incorrect'});
if(db.prepare('SELECT id FROM users WHERE email=?').get(email))throw Error('An account already exists for this email. Sign in instead.');const salt=token(),password=crypto.scryptSync(b.password,salt,64).toString('hex');const result=db.prepare('INSERT INTO users(name,email,password,salt,role) VALUES(?,?,?,?,?)').run(b.name.trim(),email,password,salt,ownerExists?'viewer':'owner');account=db.prepare('SELECT * FROM users WHERE id=?').get(result.lastInsertRowid);if(invite)db.prepare('DELETE FROM invitations WHERE token=?').run(invite.token);
}cookie(res,account);return json(res,200,{user:{id:account.id,name:account.name,email:account.email,role:account.role}});
}
if(p==='/api/logout'&&req.method==='POST'){const c=(req.headers.cookie||'').match(/zoe_session=([a-f0-9]{64})/);if(c)db.prepare('DELETE FROM sessions WHERE token=?').run(hash(c[1]));res.setHeader('Set-Cookie','zoe_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return json(res,200,{ok:true});}
if(p.startsWith('/api/')){
if(!u)return json(res,401,{error:'Sign in to access this private journal'});
if(p==='/api/entries'&&req.method==='GET')return json(res,200,db.prepare('SELECT data FROM entries').all().map(r=>JSON.parse(r.data)));
if(u.role!=='owner')return json(res,403,{error:'Only the journal owner can make changes'});
if(p==='/api/members'&&req.method==='GET')return json(res,200,db.prepare("SELECT id,name,email FROM users WHERE role='viewer'").all());
if(p.startsWith('/api/members/')&&req.method==='DELETE'){const id=Number(p.slice(13));const member=db.prepare("SELECT id FROM users WHERE id=? AND role='viewer'").get(id);if(!member)return json(res,404,{error:'Member not found'});db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);db.prepare('DELETE FROM users WHERE id=?').run(id);return json(res,200,{ok:true});}
if(p==='/api/invitations'&&req.method==='DELETE'){db.prepare('DELETE FROM invitations').run();return json(res,200,{ok:true});}
if(p==='/api/entries'&&req.method==='POST'){const e=validateEntry(await body(req));db.prepare('INSERT INTO entries(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(e.id,JSON.stringify(e));return json(res,200,e);}
if(p==='/api/import'&&req.method==='POST'){const b=await body(req);if(!Array.isArray(b.entries)||b.entries.length>1000)throw Error('Import up to 1000 experiences');const entries=b.entries.map(validateEntry);db.exec('BEGIN');try{for(const e of entries)db.prepare('INSERT INTO entries(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(e.id,JSON.stringify(e));db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}return json(res,200,{count:entries.length});}
if(p.startsWith('/api/entries/')&&req.method==='DELETE'){db.prepare('DELETE FROM entries WHERE id=?').run(decodeURIComponent(p.slice(13)));return json(res,200,{ok:true});}
if(p==='/api/invitations'&&req.method==='POST'){const b=await body(req),email=String(b.email||'').trim().toLowerCase();if(!/^\S+@\S+\.\S+$/.test(email)||email.length>254)throw Error('A valid email is required');const t=token();db.prepare('INSERT INTO invitations VALUES(?,?,?)').run(hash(t),email,now()+7*86400000);return json(res,200,{token:t});}
return json(res,404,{error:'Not found'});
}
// Serve only the application shell and its public code, never journal data or legacy JSON.
const files={'/':'index.html','/index.html':'index.html','/css/style.css':'css/style.css','/js/script.js':'js/script.js'};if(!files[p])return json(res,404,{error:'Not found'});if(!['GET','HEAD'].includes(req.method))return json(res,405,{error:'Method not allowed'});
const file=path.join(root,files[p]);res.writeHead(200,{'Content-Type':p.includes('.css')?'text/css; charset=utf-8':p.includes('.js')?'application/javascript; charset=utf-8':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:fs.readFileSync(file));
}catch(e){console.error('Request failed:',e.message);json(res,400,{error:e.message.includes('UNIQUE')?'Account already exists':e.message});}
});server.listen(port,host,()=>console.log(`Zoe journal listening on ${host}:${server.address().port}`));
