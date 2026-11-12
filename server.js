'use strict';
require('dotenv').config();
const express = require('express');
const cookieSession = require('cookie-session');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ROOT_DOMAIN = (process.env.ROOT_DOMAIN || 'mahigo.com').toLowerCase();
const ADMIN_HOST = (process.env.ADMIN_HOST || `admin.${ROOT_DOMAIN}`).toLowerCase();
const API_HOST = (process.env.API_HOST || `api.${ROOT_DOMAIN}`).toLowerCase();
const GAME_BASE_DOMAIN = (process.env.GAME_BASE_DOMAIN || `games.${ROOT_DOMAIN}`).toLowerCase();
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const GAMES_DIR = path.join(DATA_DIR, 'games');
const PUBLIC_DIR = path.join(__dirname, 'public');
const STORE_FILE = path.join(DATA_DIR, 'store.json');
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const SESSION_SECRET = process.env.SESSION_SECRET || '';

if (!ADMIN_PASSWORD || SESSION_SECRET.length < 32) {
  console.error('Configuration error: set ADMIN_PASSWORD and a SESSION_SECRET of at least 32 characters in .env.');
  process.exit(1);
}

fs.mkdirSync(DATA_DIR, {recursive:true});
fs.mkdirSync(GAMES_DIR, {recursive:true});

const defaults = {
  websites: [], games: [], apis: [], db: null, activity: [],
  brands: [
    {name:'MahigoWebs',desc:'Website creation and subdomain hosting',domain:'.mahigo.com'},
    {name:'Mahigo Kusum API',desc:'Custom API and endpoint platform',domain:'api.mahigo.com'},
    {name:'MahigoHeadquarters Bangladesh',desc:'Corporate headquarters and administration',domain:'—'},
    {name:'MahigoGames',desc:'Interactive Scratch game hosting',domain:'.games.mahigo.com'}
  ],
  settings: {hq:'Bangladesh',address:'',contact:'',siteTitle:'Mahigo Group',adminName:'Administrator'}
};
function readStore(){
  try {
    const saved = JSON.parse(fs.readFileSync(STORE_FILE,'utf8'));
    return {...structuredClone(defaults),...saved,
      websites:Array.isArray(saved.websites)?saved.websites:[],
      games:Array.isArray(saved.games)?saved.games:[],
      apis:Array.isArray(saved.apis)?saved.apis:[],
      activity:Array.isArray(saved.activity)?saved.activity:[],
      brands:Array.isArray(saved.brands)?saved.brands:defaults.brands,
      settings:{...defaults.settings,...(saved.settings||{})}};
  } catch { return structuredClone(defaults); }
}
let store = readStore();
function writeStore(){
  const temp = `${STORE_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(store,null,2), {mode:0o600});
  fs.renameSync(temp, STORE_FILE);
}
function logActivity(message){
  store.activity.unshift({text:message,time:new Date().toLocaleString('en-GB',{timeZone:'Asia/Dhaka'})+' (Asia/Dhaka)'});
  store.activity = store.activity.slice(0,30);
}
function safeSlug(value){
  const slug=String(value||'').trim().toLowerCase();
  if(!/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/.test(slug)) return null;
  return slug;
}
function sameSecret(a,b){
  const left=Buffer.from(String(a||'')); const right=Buffer.from(String(b||''));
  return left.length===right.length && crypto.timingSafeEqual(left,right);
}
function adminOnly(req,res,next){
  if(req.session && req.session.admin===true) return next();
  return res.status(401).json({error:'Administrator session required.'});
}
function htmlEscape(text){return String(text||'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
function landingPage(website){
  const name=htmlEscape(website.name); const description=htmlEscape(website.description||'A website published with MahigoWebs.');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${name}</title><style>body{margin:0;background:linear-gradient(145deg,#eaf4ff,#fff);font:16px Tahoma,Arial;color:#17345f;min-height:100vh;display:grid;place-items:center}.card{width:min(760px,calc(100% - 40px));padding:48px;border:1px solid #dce8f8;border-radius:28px;background:white;box-shadow:0 18px 60px #174d8b18}h1{font:700 clamp(32px,6vw,54px) Fredoka,Tahoma;margin:0 0 12px;color:#102b61}p{line-height:1.7;color:#657f9f}.mark{font-weight:bold;letter-spacing:2px;color:#368cf0;font-size:11px}</style><main class="card"><div class="mark">MAHIGOWEBS</div><h1>${name}</h1><p>${description}</p></main></html>`;
}
const upload = multer({storage:multer.memoryStorage(),limits:{fileSize:50*1024*1024,files:1}});
app.set('trust proxy',1);
app.disable('x-powered-by');
app.use((req,res,next)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');res.setHeader('X-Frame-Options','SAMEORIGIN');next();});
app.use(express.json({limit:'18mb'}));
app.use(express.urlencoded({extended:false,limit:'1mb'}));
app.use(cookieSession({
  name:'mahigo.admin', keys:[SESSION_SECRET], maxAge:8*60*60*1000,
  httpOnly:true, secure:process.env.COOKIE_SECURE==='true', sameSite:'lax'
}));
// Reject cross-origin state-changing requests. This protects the administrator
// session from sibling-subdomain HTML attempting to submit requests to the panel.
app.use('/api/admin',(req,res,next)=>{
  if(['GET','HEAD','OPTIONS'].includes(req.method)) return next();
  const origin=req.get('origin');
  if(!origin) return res.status(403).json({error:'A same-origin request is required.'});
  let originUrl;
  try { originUrl=new URL(origin); } catch { return res.status(403).json({error:'Invalid request origin.'}); }
  const expectedOrigin=`${req.protocol}://${req.get('host')}`;
  if(originUrl.origin!==expectedOrigin) return res.status(403).json({error:'Cross-origin administrator requests are blocked.'});
  next();
});
app.use(express.static(PUBLIC_DIR,{index:false,etag:true,maxAge:process.env.NODE_ENV==='production'?'1h':0}));

app.get('/api/health',(req,res)=>res.json({ok:true,service:'Mahigo Group Platform',storage:'persistent-server'}));
const loginTries = new Map();
app.post('/api/admin/login',(req,res)=>{
  const ip=req.ip||req.socket.remoteAddress||'unknown'; const now=Date.now();
  const attempts=loginTries.get(ip)||{count:0,started:now};
  if(now-attempts.started>10*60*1000){attempts.count=0;attempts.started=now;}
  if(attempts.count>=10) return res.status(429).json({error:'Too many login attempts. Try again in ten minutes.'});
  const good = sameSecret(req.body?.username,ADMIN_USERNAME) && sameSecret(req.body?.password,ADMIN_PASSWORD);
  if(!good){attempts.count++;loginTries.set(ip,attempts);return res.status(401).json({error:'Incorrect administrator username or password.'});}
  loginTries.delete(ip); req.session={admin:true,issuedAt:now}; res.json({ok:true});
});
app.get('/api/admin/me',adminOnly,(req,res)=>res.json({ok:true,username:ADMIN_USERNAME}));
app.post('/api/admin/logout',(req,res)=>{req.session=null;res.json({ok:true});});
app.get('/api/admin/state',adminOnly,(req,res)=>res.json(store));

app.post('/api/admin/websites',adminOnly,(req,res)=>{
  const {name,subdomain,description='',html=''}=req.body||{}; const slug=safeSlug(subdomain);
  if(!String(name||'').trim()||!slug) return res.status(400).json({error:'Enter a website name and a valid subdomain slug.'});
  if(['www','admin','api','games'].includes(slug)) return res.status(400).json({error:'That subdomain is reserved by Mahigo Group.'});
  if(store.websites.some(item=>item.subdomain===slug)) return res.status(409).json({error:'That website subdomain is already in use.'});
  const website={id:crypto.randomUUID(),name:String(name).trim().slice(0,100),subdomain:slug,description:String(description).slice(0,1000),html:String(html).trim()||null,status:'Server saved · DNS pending',createdAt:new Date().toISOString()};
  store.websites.push(website);logActivity(`Created MahigoWebs project ${slug}.${ROOT_DOMAIN}`);writeStore();
  res.status(201).json({website,url:`https://${slug}.${ROOT_DOMAIN}`});
});

app.post('/api/admin/games',adminOnly,upload.single('file'),async(req,res)=>{
  const {name,subdomain}=req.body||{};const slug=safeSlug(subdomain);const file=req.file;
  if(!String(name||'').trim()||!slug||!file) return res.status(400).json({error:'Game name, valid subdomain, and .sb3 file are required.'});
  if(store.games.some(item=>item.subdomain===slug)) return res.status(409).json({error:'That game subdomain is already in use.'});
  if(!file.originalname.toLowerCase().endsWith('.sb3')||file.buffer[0]!==0x50||file.buffer[1]!==0x4b) return res.status(400).json({error:'Upload a valid Scratch .sb3 ZIP project.'});
  let Packager;
  try {
    Packager=require('@turbowarp/packager');
    const loadedProject=await Packager.loadProject(file.buffer);
    const packager=new Packager.Packager();
    packager.project=loadedProject;
    const result=await packager.package();
    if(result.type!=='text/html') throw new Error(`TurboWarp returned ${result.type}; expected a standalone HTML game.`);
    const id=crypto.randomUUID();const dir=path.join(GAMES_DIR,id);fs.mkdirSync(dir,{recursive:true});
    fs.writeFileSync(path.join(dir,'original.sb3'),file.buffer,{mode:0o600});
    fs.writeFileSync(path.join(dir,'index.html'),Buffer.from(result.data),{mode:0o644});
    const game={id,name:String(name).trim().slice(0,100),subdomain:slug,file:file.originalname,size:file.size,status:'Packaged · DNS pending',createdAt:new Date().toISOString()};
    store.games.push(game);logActivity(`Imported and packaged Scratch game ${file.originalname}`);writeStore();
    res.status(201).json({game,url:`https://${slug}.${GAME_BASE_DOMAIN}`});
  } catch(error) {
    console.error('Scratch packaging failed:',error);
    res.status(422).json({error:`Could not package this Scratch project: ${error.message||'unknown packaging error'}`});
  }
});

app.post('/api/admin/apis',adminOnly,(req,res)=>{
  const {name,method,path:apiPath,source='Imported database',responseJson='{}',description=''}=req.body||{};
  const verb=String(method||'GET').toUpperCase();
  if(!String(name||'').trim()||!['GET','POST'].includes(verb)) return res.status(400).json({error:'Enter an API name and choose GET or POST.'});
  if(typeof apiPath!=='string'||!/^\/[A-Za-z0-9_./-]*$/.test(apiPath)||apiPath.includes('..')||apiPath==='/') return res.status(400).json({error:'Enter a valid endpoint path, such as /v1/customers.'});
  let parsed=null;
  if(source==='Custom JSON response'){try{parsed=JSON.parse(responseJson||'{}');}catch{return res.status(400).json({error:'Custom JSON response is not valid JSON.'});}}
  else if(!store.db) return res.status(400).json({error:'Import a JSON database first, or choose Custom JSON response.'});
  if(store.apis.some(item=>item.path===apiPath&&item.method===verb)) return res.status(409).json({error:'An endpoint with this method and path already exists.'});
  const api={id:crypto.randomUUID(),name:String(name).trim().slice(0,100),method:verb,path:apiPath,source,responseJson:parsed,description:String(description).slice(0,1000),status:'Server route ready',createdAt:new Date().toISOString()};
  store.apis.push(api);logActivity(`Created Mahigo Kusum endpoint ${verb} ${apiPath}`);writeStore();
  res.status(201).json({api,url:`https://${API_HOST}${apiPath}`});
});

app.post('/api/admin/database',adminOnly,upload.single('file'),(req,res)=>{
  if(!req.file) return res.status(400).json({error:'Choose a JSON database file.'});
  if(!req.file.originalname.toLowerCase().endsWith('.json')) return res.status(400).json({error:'Database must be a .json file.'});
  let data;try{data=JSON.parse(req.file.buffer.toString('utf8'));}catch{return res.status(400).json({error:'The uploaded file is not valid JSON.'});}
  store.db={name:req.file.originalname,time:new Date().toLocaleString('en-GB',{timeZone:'Asia/Dhaka'})+' (Asia/Dhaka)',bytes:req.file.size,data};
  logActivity(`Imported database ${req.file.originalname}`);writeStore();res.json({ok:true,name:store.db.name});
});
app.delete('/api/admin/database',adminOnly,(req,res)=>{store.db=null;logActivity('Removed imported database');writeStore();res.json({ok:true});});
app.put('/api/admin/settings',adminOnly,(req,res)=>{
  const allowed=['siteTitle','hq','address','contact'];
  for(const key of allowed) if(typeof req.body?.[key]==='string') store.settings[key]=req.body[key].slice(0,2000);
  logActivity('Updated organization and headquarters settings');writeStore();res.json({settings:store.settings});
});
app.post('/api/admin/reset',adminOnly,(req,res)=>{
  for(const folder of fs.readdirSync(GAMES_DIR,{withFileTypes:true})) fs.rmSync(path.join(GAMES_DIR,folder.name),{recursive:true,force:true});
  store=structuredClone(defaults);writeStore();res.json({ok:true});
});
for(const resource of ['websites','games','apis']){
  app.delete(`/api/admin/${resource}/:id`,adminOnly,(req,res)=>{
    const index=store[resource].findIndex(item=>item.id===req.params.id);
    if(index<0)return res.status(404).json({error:'Record not found.'});
    const [removed]=store[resource].splice(index,1);
    if(resource==='games') fs.rmSync(path.join(GAMES_DIR,removed.id),{recursive:true,force:true});
    logActivity(`Deleted ${resource} record ${removed.name||removed.subdomain||''}`);writeStore();res.json({ok:true});
  });
}

// Public API host: each registered method + path becomes a real JSON HTTP endpoint.
app.use(async(req,res,next)=>{
  if(req.hostname.toLowerCase()!==API_HOST||req.path.startsWith('/api/'))return next();
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if(req.method==='OPTIONS')return res.sendStatus(204);
  const endpoint=store.apis.find(item=>item.path===req.path&&item.method===req.method);
  if(!endpoint)return res.status(404).json({error:'Mahigo Kusum endpoint not found.'});
  if(endpoint.source==='Custom JSON response')return res.json(endpoint.responseJson??{});
  if(!store.db)return res.status(503).json({error:'No database has been imported.'});
  if(req.method==='GET')return res.json(store.db.data);
  if(req.method==='POST'){
    const record=req.body;
    if(Array.isArray(store.db.data))store.db.data.push(record);
    else if(store.db.data&&typeof store.db.data==='object'){
      if(!Array.isArray(store.db.data.records))store.db.data.records=[];
      store.db.data.records.push(record);
    } else return res.status(409).json({error:'The imported JSON root must be an array or object to accept POST records.'});
    logActivity(`A public POST request added a record through ${endpoint.path}`);writeStore();return res.status(201).json({ok:true,record});
  }
  return res.status(405).json({error:'Method not allowed.'});
});

// Hostname router for public websites and packaged Scratch games.
app.get('*',(req,res)=>{
  const host=req.hostname.toLowerCase();
  if(host===ROOT_DOMAIN||host===`www.${ROOT_DOMAIN}`||host===ADMIN_HOST||host==='localhost'||host==='127.0.0.1') return res.sendFile(path.join(PUBLIC_DIR,'index.html'));
  if(host.endsWith(`.${GAME_BASE_DOMAIN}`)){
    const slug=host.slice(0,-(GAME_BASE_DOMAIN.length+1));
    const game=store.games.find(item=>item.subdomain===slug);
    if(!game)return res.status(404).send('MahigoGames: game not found.');
    const htmlPath=path.join(GAMES_DIR,game.id,'index.html');
    if(!fs.existsSync(htmlPath))return res.status(503).send('Game package is not ready.');
    res.setHeader('Cache-Control','public, max-age=60');return res.sendFile(htmlPath);
  }
  if(host.endsWith(`.${ROOT_DOMAIN}`)){
    const slug=host.slice(0,-(ROOT_DOMAIN.length+1));
    if(['admin','api','www','games'].includes(slug))return res.status(404).send('Mahigo Group host not found.');
    const website=store.websites.find(item=>item.subdomain===slug);
    if(!website)return res.status(404).send('MahigoWebs: website not found.');
    res.setHeader('X-Robots-Tag','index, follow');
    let pageHtml=website.html;
    if(!pageHtml) pageHtml=landingPage(website);
    else if(!/<!doctype|<html[\s>]/i.test(pageHtml)) {
      pageHtml=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${htmlEscape(website.name)}</title></head><body>${pageHtml}</body></html>`;
    }
    return res.type('html').send(pageHtml);
  }
  return res.status(404).send('Mahigo Group: host not configured.');
});

app.use((error,req,res,next)=>{
  console.error(error);
  if(error instanceof multer.MulterError) return res.status(400).json({error:error.code==='LIMIT_FILE_SIZE'?'Upload is too large. Maximum size is 50 MB.':error.message});
  return res.status(500).json({error:'Unexpected server error.'});
});
app.listen(PORT,()=>{
  console.log(`Mahigo Group Platform listening on port ${PORT}`);
  console.log(`Admin host: ${ADMIN_HOST} | Public root: ${ROOT_DOMAIN} | API host: ${API_HOST} | Game base: ${GAME_BASE_DOMAIN}`);
});
