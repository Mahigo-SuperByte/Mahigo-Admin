'use strict';
const STORAGE_KEY = 'mahigo_admin_console_v2';
const GAME_SUFFIX = 'games.mahigo.com';
const defaults = {
  websites: [], games: [], apis: [],
  brands: [
    {name:'MahigoWebs',desc:'Website creation and subdomain hosting',domain:'.mahigo.com'},
    {name:'Mahigo Kusum API',desc:'Custom API and endpoint platform',domain:'api.mahigo.com'},
    {name:'MahigoHeadquarters Bangladesh',desc:'Corporate headquarters and administration',domain:'—'},
    {name:'MahigoGames',desc:'Interactive games and Scratch project hosting',domain:'.games.mahigo.com'}
  ],
  settings: {hq:'Bangladesh',address:'',contact:'',siteTitle:'Mahigo Group',adminName:'Administrator'},
  db: null, activity: []
};
let state = loadLocal();
let page = 'overview';
let backendMode = false;
const clone = value => JSON.parse(JSON.stringify(value));
function loadLocal(){
  try { return {...clone(defaults), ...JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}')}; }
  catch { return clone(defaults); }
}
function saveLocal(){
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); return true; }
  catch (error) { toast('Browser storage is full. Use the server version for larger imports.'); return false; }
}
async function request(url, options={}){
  const response = await fetch(url, {credentials:'same-origin', ...options});
  const type = response.headers.get('content-type')||'';
  const body = type.includes('application/json') ? await response.json() : await response.text();
  if(!response.ok) throw new Error(body && body.error ? body.error : `Request failed (${response.status})`);
  return body;
}
async function refreshServerState(){ state = await request('/api/admin/state'); }
function esc(value=''){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function toast(message){const el=document.getElementById('toast');el.textContent=message;el.style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.style.display='none',3200);}
function log(message){state.activity.unshift({text:message,time:new Date().toLocaleString()});state.activity=state.activity.slice(0,12);saveLocal();}
function syncNav(){document.querySelectorAll('.nav button[data-page]').forEach(button=>button.classList.toggle('active',button.dataset.page===page));}
function showApp(){document.getElementById('login').style.display='none';document.getElementById('app').style.display='block';syncNav();render();}
async function initialize(){
  try {
    await request('/api/health');
    backendMode = true;
    try { await request('/api/admin/me'); await refreshServerState(); showApp(); }
    catch { /* Not signed in; keep the login screen visible. */ }
  } catch {
    backendMode = false;
    // Opening the HTML file directly is supported as a local demo only.
    if(location.protocol === 'file:' && sessionStorage.getItem('mahigo_local_session')==='yes') showApp();
  }
}

document.getElementById('loginForm').addEventListener('submit', async event=>{
  event.preventDefault();
  const username=document.getElementById('username').value.trim();
  const password=document.getElementById('password').value;
  const error=document.getElementById('loginError');
  const button=event.currentTarget.querySelector('button[type="submit"]');
  button.disabled=true; button.textContent='Signing in…'; error.textContent='';
  try {
    if(backendMode){
      await request('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})});
      await refreshServerState();
    } else if(location.protocol==='file:' && username==='admin' && password==='mahir7532') {
      sessionStorage.setItem('mahigo_local_session','yes'); state=loadLocal();
    } else {
      throw new Error(backendMode ? 'Incorrect administrator username or password.' : 'Backend is not connected. Start the server package to use secure administrator login.');
    }
    showApp();
  } catch(err){ error.textContent=err.message||'Sign in failed.'; }
  finally {button.disabled=false;button.textContent='Enter Admin Console →';}
});
document.getElementById('logout').onclick=async()=>{
  try { if(backendMode) await request('/api/admin/logout',{method:'POST'}); } catch {}
  sessionStorage.removeItem('mahigo_local_session');
  document.getElementById('app').style.display='none';document.getElementById('login').style.display='grid';document.getElementById('password').value='';
};
document.querySelectorAll('.nav button[data-page]').forEach(button=>button.addEventListener('click',()=>go(button.dataset.page)));

function heading(title,desc,action=''){return `<div class="pagehead"><div><h2>${title}</h2><p>${desc}</p></div>${action}</div>`;}
function stat(label,value,icon,sub){return `<div class="stat"><div class="stat-top"><span>${label}</span><span class="stat-icon">${icon}</span></div><strong>${value}</strong><small>${sub}</small></div>`;}
function render(){
  const titles={overview:'Overview',websites:'MahigoWebs',games:'MahigoGames',apis:'Mahigo Kusum API',database:'Database Center',brands:'Sub-brands',settings:'Settings'};
  document.getElementById('crumb').textContent=titles[page]||'Overview';
  const pages={overview,websites,games,apis,database,brands,settings};
  document.getElementById('content').innerHTML=pages[page]();
  syncNav(); wirePage();
}
function statusPill(value='Saved'){
  const good=/live|ready|packaged/i.test(value);
  return `<span class="pill ${good?'':'gray'}">${esc(value)}</span>`;
}
function overview(){
  const activity=state.activity||[];
  return heading('Welcome to Mahigo Group', 'Your organization, services, and digital properties in one place.')+
  `<div class="grid stats">${stat('WEBSITES',(state.websites||[]).length,'◫','MahigoWebs projects')}${stat('GAMES',(state.games||[]).length,'▶','Scratch projects')}${stat('API ENDPOINTS',(state.apis||[]).length,'⌘','Mahigo Kusum API')}${stat('DATABASE',state.db?'Imported':'Empty','▤',state.db?'JSON data loaded':'No database imported')}</div>
  <div class="grid cols"><section class="panel"><h3>Recent activity</h3><div class="activity">${activity.length?activity.slice(0,6).map(item=>`<div class="activity-item"><i class="activity-dot"></i><div>${esc(item.text)}<small>${esc(item.time)}</small></div></div>`).join(''):'<div class="empty">Your admin activity will appear here.</div>'}</div></section>
  <section class="panel"><h3>Quick actions</h3><div class="quick"><button data-go="websites"><span>🌐</span><b>Create website</b></button><button data-go="games"><span>🎮</span><b>Import Scratch game</b></button><button data-go="apis"><span>⚡</span><b>Create API</b></button><button data-go="database"><span>🗄️</span><b>Import database</b></button></div></section></div>
  <div class="notice"><b>${backendMode?'Server mode connected':'Local demo mode'}.</b> ${backendMode?'Projects are saved on the server. Public subdomains still require the DNS and HTTPS records described in the deployment guide.':'This standalone file stores data in this browser only. Run the included server package for persistent hosting and server-side login.'}</div>`;
}
function table(items,columns,empty){
  if(!items?.length) return `<div class="empty">${empty}</div>`;
  return `<div class="tablewrap"><table><thead><tr>${columns.map(column=>`<th>${column}</th>`).join('')}<th>Actions</th></tr></thead><tbody>${items.map((item,index)=>`<tr>${columns.map(column=>`<td>${column==='Status'?statusPill(item.status||'Draft'):esc(item[column.toLowerCase()]||'—')}</td>`).join('')}<td><div class="rowactions"><button class="btn secondary small" data-delete="${index}">Delete</button></div></td></tr>`).join('')}</tbody></table></div>`;
}
function websites(){
  const action='<button class="btn" id="createWebsite">＋ Create website</button>';
  return heading('MahigoWebs','Create websites and publish them on .mahigo.com subdomains.',action)+
  `<section class="panel"><h3>Website projects</h3>${table(state.websites,['Name','Subdomain','Status'],'No websites yet. Create your first MahigoWebs website.')}</section>
  <div class="notice">A website created on the server is routed by hostname. For public access, configure wildcard DNS and HTTPS for <b>*.mahigo.com</b>.</div>`;
}
function games(){
  const rows=(state.games||[]).map(game=>({...game,subdomain:game.subdomain+'.games.mahigo.com',status:game.status||'Stored locally'}));
  return heading('MahigoGames','Import Scratch .sb3 projects and package them as playable web games.','<button class="btn" id="importGame">＋ Import Scratch game</button>')+
  `<section class="panel"><h3>Game library</h3>${rows.length?`<div class="tablewrap"><table><thead><tr><th>Game</th><th>Project file</th><th>Game hostname</th><th>Status</th><th>Actions</th></tr></thead><tbody>${rows.map((game,index)=>`<tr><td>${esc(game.name)}</td><td>${esc(game.file)}</td><td>${esc(game.subdomain)}</td><td>${statusPill(game.status)}</td><td><div class="rowactions"><button class="btn secondary small" data-game="${index}">Details</button><button class="btn danger small" data-delete="${index}">Delete</button></div></td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">No games yet. Import a Scratch .sb3 project.</div>'}</section>
  <div class="notice"><b>Game domain:</b> the requested <code>.mahigo.gms</code> suffix is not currently a delegated public DNS top-level domain in IANA's root database. This build uses <b>game-name.games.mahigo.com</b> as the public-hosting-compatible address instead. <a href="https://www.iana.org/domains/root/db" target="_blank" rel="noopener">IANA root database</a>.</div>`;
}
function apis(){
  return heading('Mahigo Kusum API','Create custom endpoints that return your imported database or a JSON response.','<button class="btn" id="createApi">＋ Create API</button>')+
  `<section class="panel"><h3>Custom endpoints</h3>${state.apis.length?`<div class="tablewrap"><table><thead><tr><th>Name</th><th>Method</th><th>Path</th><th>Status</th><th>Actions</th></tr></thead><tbody>${state.apis.map((api,index)=>`<tr><td>${esc(api.name)}</td><td><span class="pill">${esc(api.method)}</span></td><td><code>${esc(api.path)}</code></td><td>${statusPill(api.status||'Draft')}</td><td><div class="rowactions"><button class="btn secondary small" data-api="${index}">Details</button><button class="btn danger small" data-delete="${index}">Delete</button></div></td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">No APIs created. Create your first Mahigo Kusum endpoint.</div>'}</section>
  <div class="notice">In server mode, endpoints are served from <b>https://api.mahigo.com/your/path</b> after DNS is configured. The server enforces the method selected for each endpoint.</div>`;
}
function database(){
  return heading('Database Center','Import a JSON database and make it available to Mahigo Kusum API.','<button class="btn" id="importDb">↑ Import JSON</button>')+
  `<section class="panel"><h3>Current database</h3>${state.db?`<p><b>${esc(state.db.name)}</b> <span class="pill">Imported</span></p><p class="hint">Imported ${esc(state.db.time||'')} · ${Number(state.db.bytes||0).toLocaleString()} bytes</p><pre style="white-space:pre-wrap;overflow:auto;background:#f3f8ff;padding:14px;border-radius:12px;font-size:11px;max-height:320px">${esc(JSON.stringify(state.db.data,null,2).slice(0,12000))}</pre><button class="btn danger small" id="clearDb">Remove database</button>`:'<div class="empty">No database imported. Select a .json file to load your database.</div>'}</section>
  <div class="notice">In server mode the JSON database is stored on the server's persistent data volume. Protect sensitive data and use authentication on any endpoint that exposes private records.</div>`;
}
function brands(){return heading('Sub-brands','The Mahigo Group family of services and divisions.')+`<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr))">${state.brands.map(brand=>`<section class="panel"><div class="stat-icon">✧</div><h3 style="margin:12px 0 5px">${esc(brand.name)}</h3><p class="hint">${esc(brand.desc)}</p><span class="pill">${esc(brand.domain)}</span></section>`).join('')}</div>`;}
function settings(){
  return heading('Settings','Organization profile and Mahigo Headquarters Bangladesh details.')+
  `<section class="panel"><h3>Headquarters profile</h3><form id="settingsForm"><div class="formgrid">
  <div class="field"><label>ORGANIZATION NAME</label><input name="siteTitle" value="${esc(state.settings.siteTitle)}"></div>
  <div class="field"><label>HEADQUARTERS COUNTRY / REGION</label><input name="hq" value="${esc(state.settings.hq)}"></div>
  <div class="field full"><label>HEADQUARTERS ADDRESS</label><textarea name="address" rows="3" placeholder="Enter the official Mahigo Group headquarters address">${esc(state.settings.address)}</textarea></div>
  <div class="field full"><label>CONTACT EMAIL / PHONE</label><input name="contact" value="${esc(state.settings.contact)}" placeholder="Official contact details"></div>
  <div class="field full"><button class="btn" type="submit">Save organization settings</button></div></div></form></section>
  <section class="panel"><h3>Appearance</h3><p class="hint">Mahigo blue palette · Fredoka · Lilita One · Tahoma. Add your licensed Riffic Bold font file to the production build to use it here.</p></section>
  <section class="panel dangerzone"><h3>Workspace</h3><p class="hint">Reset the saved workspace. This removes website, game, API, and database records stored by this Mahigo instance.</p><button class="btn danger small" id="resetData">Reset workspace</button></section>`;
}
function openModal(title,html){document.getElementById('modalTitle').textContent=title;document.getElementById('modalBody').innerHTML=html;document.getElementById('modalback').style.display='grid';wireModal();}
function closeModal(){document.getElementById('modalback').style.display='none';}
document.getElementById('modalClose').onclick=closeModal;
document.getElementById('modalback').onclick=event=>{if(event.target.id==='modalback')closeModal();};
async function afterServerMutation(message){closeModal();try{await refreshServerState();render();toast(message);}catch(error){render();toast(message+' The save succeeded, but refreshing the list failed: '+(error.message||'unknown error'));}}
function wirePage(){
  document.querySelectorAll('[data-go]').forEach(button=>button.onclick=()=>go(button.dataset.go));
  const createWebsite=document.getElementById('createWebsite');
  if(createWebsite) createWebsite.onclick=()=>openModal('Create MahigoWebs website',`<form id="websiteForm">
    <div class="field"><label>WEBSITE NAME</label><input name="name" required placeholder="My website"></div>
    <div class="field"><label>SUBDOMAIN</label><input name="subdomain" required pattern="[a-z0-9-]+" maxlength="40" placeholder="mywebsite"><div class="hint">Preview: <b id="domainPreview">mywebsite.mahigo.com</b></div></div>
    <div class="field"><label>DESCRIPTION</label><textarea name="description" rows="2" placeholder="What is this website about?"></textarea></div>
    <div class="field"><label>PAGE HTML (OPTIONAL)</label><textarea name="html" rows="5" placeholder="<main><h1>Welcome to my website</h1><p>Created with MahigoWebs.</p></main>"></textarea><div class="hint">Leave blank to publish an automatically generated landing page.</div></div>
    <button class="btn" type="submit">Save website project</button></form>`);
  const importGame=document.getElementById('importGame');
  if(importGame) importGame.onclick=()=>openModal('Import Scratch game',`<form id="gameForm">
    <div class="field"><label>GAME NAME</label><input name="name" required placeholder="My Scratch game"></div>
    <div class="field"><label>GAME SUBDOMAIN SLUG</label><input name="subdomain" required pattern="[a-z0-9-]+" maxlength="40" placeholder="mygame"><div class="hint">Public host preview: <b id="gameDomainPreview">mygame.${GAME_SUFFIX}</b></div></div>
    <div class="field"><label>SCRATCH PROJECT (.SB3)</label><input name="file" type="file" accept=".sb3,application/zip" required><div class="hint">Server mode packages the project into a standalone playable HTML game.</div></div>
    <button class="btn" type="submit">Import and package game</button></form>`);
  const createApi=document.getElementById('createApi');
  if(createApi) createApi.onclick=()=>openModal('Create Mahigo Kusum API',`<form id="apiForm">
    <div class="field"><label>API NAME</label><input name="name" required placeholder="Customer API"></div>
    <div class="field"><label>HTTP METHOD</label><select name="method"><option>GET</option><option>POST</option></select></div>
    <div class="field"><label>ENDPOINT PATH</label><input name="path" required pattern="/[A-Za-z0-9_./-]*" placeholder="/v1/customers"><div class="hint">Your public endpoint will be https://api.mahigo.com/v1/customers</div></div>
    <div class="field"><label>DATA SOURCE</label><select name="source"><option>Imported database</option><option>Custom JSON response</option></select></div>
    <div class="field"><label>CUSTOM JSON RESPONSE (FOR CUSTOM JSON SOURCE)</label><textarea name="responseJson" rows="4" placeholder='{"message":"Hello from Mahigo Kusum"}'></textarea></div>
    <div class="field"><label>DESCRIPTION</label><textarea name="description" rows="2"></textarea></div>
    <button class="btn" type="submit">Save and activate API</button></form>`);
  const importDb=document.getElementById('importDb');
  if(importDb) importDb.onclick=()=>{const input=document.createElement('input');input.type='file';input.accept='.json,application/json';input.onchange=async()=>{const file=input.files?.[0];if(!file)return;
    try{
      if(backendMode){const form=new FormData();form.append('file',file);await request('/api/admin/database',{method:'POST',body:form});await refreshServerState();render();toast('Database imported and saved on server');}
      else{const data=JSON.parse(await file.text());state.db={name:file.name,time:new Date().toLocaleString(),bytes:file.size,data};saveLocal();log('Imported database '+file.name);render();toast('Database imported in this browser');}
    }catch(error){toast(error.message||'Could not import JSON file');}
  };input.click();};
  const settingsForm=document.getElementById('settingsForm');
  if(settingsForm) settingsForm.onsubmit=async event=>{event.preventDefault();const values=Object.fromEntries(new FormData(settingsForm));
    try{if(backendMode){await request('/api/admin/settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(values)});await refreshServerState();}else{Object.assign(state.settings,values);saveLocal();log('Updated headquarters and organization settings');}render();toast('Organization settings saved');}
    catch(error){toast(error.message||'Settings could not be saved');}
  };
  const clearDb=document.getElementById('clearDb');
  if(clearDb) clearDb.onclick=async()=>{if(!confirm('Remove the imported database?'))return;try{if(backendMode){await request('/api/admin/database',{method:'DELETE'});await refreshServerState();}else{state.db=null;saveLocal();log('Removed database');}render();toast('Database removed');}catch(error){toast(error.message);}};
  const reset=document.getElementById('resetData');
  if(reset) reset.onclick=async()=>{if(!confirm('Reset all Mahigo Group workspace records?'))return;try{if(backendMode){await request('/api/admin/reset',{method:'POST'});await refreshServerState();}else{state=clone(defaults);saveLocal();}render();toast('Workspace reset');}catch(error){toast(error.message);}};
  document.querySelectorAll('[data-delete]').forEach(button=>button.onclick=async()=>{
    const index=Number(button.dataset.delete);const resource=page==='websites'?'websites':page==='games'?'games':'apis';const list=state[resource]||[];const item=list[index];if(!item)return;
    if(!confirm(`Delete ${item.name||'this record'}?`))return;
    try{if(backendMode){await request(`/api/admin/${resource}/${encodeURIComponent(item.id)}`,{method:'DELETE'});await refreshServerState();}else{list.splice(index,1);saveLocal();log(`Deleted ${resource} record`);}render();toast('Record deleted');}
    catch(error){toast(error.message||'Delete failed');}
  });
  document.querySelectorAll('[data-api]').forEach(button=>button.onclick=()=>{const api=state.apis[Number(button.dataset.api)];if(!api)return;const url=`https://api.mahigo.com${api.path}`;openModal('API endpoint details',`<p><b>${esc(api.name)}</b></p><p><span class="pill">${esc(api.method)}</span> <code>${esc(api.path)}</code></p><p class="hint">${esc(api.description||'No description')}</p><p class="hint">Data source: ${esc(api.source)}</p><p><a href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a></p><div class="notice">${backendMode?'This endpoint is registered on the server. It becomes publicly reachable once api.mahigo.com points to this server.':'Local demo only: this is not a live endpoint.'}</div>`);});
  document.querySelectorAll('[data-game]').forEach(button=>button.onclick=()=>{const game=state.games[Number(button.dataset.game)];if(!game)return;const url=`https://${game.subdomain}.${GAME_SUFFIX}`;openModal('Game hosting details',`<p><b>${esc(game.name)}</b></p><p>File: ${esc(game.file)}</p><p>Public game host: <code>${esc(url)}</code></p><p>Status: ${statusPill(game.status||'Stored locally')}</p><div class="notice">${backendMode?'The server has saved the .sb3 upload and created a packaged HTML player. Configure *.games.mahigo.com DNS and TLS to make the URL publicly accessible.':'This standalone demo stores the game locally and does not host it.'}</div>`);});
}
function wireModal(){
  const websiteForm=document.getElementById('websiteForm');
  if(websiteForm){const slug=websiteForm.elements.subdomain;slug.oninput=()=>document.getElementById('domainPreview').textContent=(slug.value||'yourname')+'.mahigo.com';websiteForm.onsubmit=async event=>{event.preventDefault();const payload=Object.fromEntries(new FormData(websiteForm));payload.subdomain=payload.subdomain.toLowerCase();
    try{if(backendMode){await request('/api/admin/websites',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});await afterServerMutation('Website saved on server. DNS is the remaining public step.');}
      else{if(state.websites.some(item=>item.subdomain===payload.subdomain))throw new Error('That subdomain is already used');state.websites.push({id:crypto.randomUUID(),name:payload.name,subdomain:payload.subdomain,status:'Draft (local)',description:payload.description});saveLocal();log('Created website project '+payload.subdomain);closeModal();render();toast('Website saved in this browser only');}}
    catch(error){toast(error.message||'Website could not be saved');}
  };}
  const gameForm=document.getElementById('gameForm');
  if(gameForm){const slug=gameForm.elements.subdomain;slug.oninput=()=>document.getElementById('gameDomainPreview').textContent=(slug.value||'mygame')+'.'+GAME_SUFFIX;gameForm.onsubmit=async event=>{event.preventDefault();const file=gameForm.elements.file.files?.[0];if(!file)return;const subdomain=slug.value.toLowerCase();const submit=gameForm.querySelector('button[type="submit"],button:not([type])');submit.disabled=true;submit.textContent='Saving and packaging…';
    try{if(backendMode){const form=new FormData();form.append('name',gameForm.elements.name.value);form.append('subdomain',subdomain);form.append('file',file);await request('/api/admin/games',{method:'POST',body:form});await afterServerMutation('Game uploaded, packaged and saved on server.');}
      else{if(state.games.some(item=>item.subdomain===subdomain))throw new Error('That game subdomain is already in use');if(file.size>40*1024*1024)throw new Error('File exceeds the 40 MB local demo limit');const buffer=await file.arrayBuffer();const bytes=new Uint8Array(buffer);if(bytes[0]!==0x50||bytes[1]!==0x4b)throw new Error('This does not look like a valid .sb3 ZIP file');const id='game_'+Date.now();await storeGameBlob(id,file);state.games.push({id,name:gameForm.elements.name.value,subdomain,file:file.name,size:file.size,status:'Stored locally'});saveLocal();log('Imported Scratch game '+file.name);closeModal();render();toast('Game saved in this browser only');}}
    catch(error){toast(error.message||'Game import failed');submit.disabled=false;submit.textContent='Import and package game';}
  };}
  const apiForm=document.getElementById('apiForm');
  if(apiForm) apiForm.onsubmit=async event=>{event.preventDefault();const payload=Object.fromEntries(new FormData(apiForm));if(!payload.path.startsWith('/'))return toast('Endpoint path must start with /');
    try{if(backendMode){await request('/api/admin/apis',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});await afterServerMutation('Mahigo Kusum endpoint saved on server.');}
      else{if(state.apis.some(item=>item.path===payload.path&&item.method===payload.method))throw new Error('This method and path are already defined');let parsed=null;if(payload.source==='Custom JSON response')parsed=JSON.parse(payload.responseJson||'{}');state.apis.push({id:crypto.randomUUID(),...payload,response:parsed,status:'Draft (local)'});saveLocal();log('Created API draft '+payload.path);closeModal();render();toast('API saved in this browser only');}}
    catch(error){toast(error.message||'API could not be saved');}
  };
}
function storeGameBlob(key,blob){return new Promise((resolve,reject)=>{const open=indexedDB.open('MahigoGroupFiles',1);open.onupgradeneeded=()=>{if(!open.result.objectStoreNames.contains('games'))open.result.createObjectStore('games');};open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result;const tx=db.transaction('games','readwrite');tx.objectStore('games').put(blob,key);tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>{db.close();reject(tx.error);};};});}
function go(next){page=next;render();}
initialize();
