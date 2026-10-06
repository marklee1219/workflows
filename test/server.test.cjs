const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const {spawn}=require('node:child_process');
test('private journal persists entries and enforces invitation access',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'zoe-test-'));let child,base;
 async function start(){child=spawn(process.execPath,['server.cjs'],{cwd:path.resolve(__dirname,'..'),env:{...process.env,PORT:'0',HOST:'127.0.0.1',ZOE_DATA_DIR:dir,ZOE_SETUP_TOKEN:'test-setup-code'}});base=await new Promise((resolve,reject)=>{let log='';child.stdout.on('data',d=>{log+=d;const m=log.match(/listening on 127.0.0.1:(\d+)/);if(m)resolve('http://127.0.0.1:'+m[1]);});child.once('error',reject);child.once('exit',code=>reject(Error('Server exited '+code)));});}
 async function stop(){if(child.exitCode!==null)return;const exit=new Promise(r=>child.once('exit',r));child.kill();await exit;}
 t.after(async()=>{await stop();fs.rmSync(dir,{recursive:true,force:true});});await start();
 async function request(p,method='GET',data,cookie){const r=await fetch(base+'/api/'+p,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:data?JSON.stringify(data):undefined});return {status:r.status,body:await r.json(),cookie:(r.headers.get('set-cookie')||'').split(';')[0]};}
 assert.equal((await request('entries')).status,401);
 assert.equal((await request('register','POST',{name:'Zoe',email:'zoe@example.test',password:'a-long-test-password',setupToken:'wrong'})).status,403);
 const owner=await request('register','POST',{name:'Zoe',email:'zoe@example.test',password:'a-long-test-password',setupToken:'test-setup-code'});assert.equal(owner.status,200);assert.equal(owner.body.user.role,'owner');const ownerCookie=owner.cookie;
 assert.equal((await request('register','POST',{name:'Stranger',email:'stranger@example.test',password:'a-long-test-password'})).status,403);
 const example={title:'First swimming lesson',date:'2026-10-05',category:'Milestones',status:'In progress',progress:25,location:'Pool',notes:'Practiced floating',favorite:true,photo:null};
 const created=await request('entries','POST',example,ownerCookie);assert.equal(created.status,200);assert.ok(created.body.id);
 assert.equal((await request('entries','POST',{...example,date:'2026-02-30'},ownerCookie)).status,400);
 const invite=await request('invitations','POST',{email:'friend@example.test'},ownerCookie);assert.equal(invite.status,200);
 assert.equal((await request('register','POST',{name:'Wrong',email:'wrong@example.test',password:'a-long-test-password',invite:invite.body.token})).status,403);
 const viewer=await request('register','POST',{name:'Friend',email:'friend@example.test',password:'a-long-test-password',invite:invite.body.token});assert.equal(viewer.status,200);assert.equal(viewer.body.user.role,'viewer');assert.equal((await request('entries','GET',null,viewer.cookie)).body.length,1);assert.equal((await request('entries','POST',example,viewer.cookie)).status,403);assert.equal((await request('invitations','POST',{email:'other@example.test'},viewer.cookie)).status,403);
 const edited=await request('entries','POST',{...created.body,status:'Completed',progress:100},ownerCookie);assert.equal(edited.body.progress,100);
 const hostile=await fetch(base+'/api/entries',{method:'POST',headers:{'Content-Type':'application/json',Cookie:ownerCookie,Origin:'https://untrusted.test'},body:JSON.stringify(example)});assert.equal(hostile.status,403);
 assert.equal((await fetch(base+'/js/data.json')).status,404);assert.equal((await fetch(base+'/.tmp/zoe/journal.sqlite')).status,404);
 const imported=await request('import','POST',{entries:[{...example,title:'Reading practice',category:'Activities'}]},ownerCookie);assert.equal(imported.body.count,1);
 await stop();await start();const list=await request('entries','GET',null,ownerCookie);assert.equal(list.body.length,2);assert.equal(list.body.find(e=>e.id===created.body.id).progress,100);
 const members=await request('members','GET',null,ownerCookie);assert.equal(members.body.length,1);assert.equal((await request('members/'+viewer.body.user.id,'DELETE',{},ownerCookie)).status,200);assert.equal((await request('entries','GET',null,viewer.cookie)).status,401);
 assert.equal((await request('entries/'+created.body.id,'DELETE',{},ownerCookie)).status,200);assert.equal((await request('entries','GET',null,ownerCookie)).body.length,1);
 assert.equal((await request('logout','POST',{},ownerCookie)).status,200);assert.equal((await request('entries','GET',null,ownerCookie)).status,401);
 const login=await request('login','POST',{email:'zoe@example.test',password:'a-long-test-password'});assert.equal(login.status,200);
});
