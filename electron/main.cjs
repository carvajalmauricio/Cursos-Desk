const {app,BrowserWindow,ipcMain,protocol,shell,Menu}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const {Readable}=require('node:stream');
const mammoth=require('mammoth');
const {scan,Store,associateResources}=require('./core.cjs');
protocol.registerSchemesAsPrivileged([{scheme:'coursefile',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true,corsEnabled:true}}]);
let win,globalStore,root,catalog=[],watcher,timer,canClose=false;
const stores=new Map();
if(process.env.CURSODESK_DATA) app.setPath('userData',process.env.CURSODESK_DATA);
const instance=app.requestSingleInstanceLock();
if(!instance)app.quit();
app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.focus();}});
const localDay=()=>new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const url=(course,relative)=>'coursefile://local/'+encodeURIComponent(course)+'/'+relative.split('/').map(encodeURIComponent).join('/');
function course(id){const c=catalog.find(c=>c.id===id);if(!c)throw new Error('El curso no está disponible');return c;}
function fileFor(id,relative){
  const c=course(id);
  if(typeof relative!=='string')throw new Error('Archivo inválido');
  const target=path.resolve(c.folder,relative);
  const base=fs.realpathSync(c.folder);
  const real=fs.realpathSync(target);
  if(!real.startsWith(base+path.sep)||!fs.statSync(real).isFile())throw new Error('Archivo fuera del curso');
  return real;
}
async function getStore(id){
  const c=course(id);
  if(!stores.has(id))stores.set(id,await Store.create(path.join(c.folder,'.course-player','course.sqlite')));
  return stores.get(id);
}
function refresh(){
  catalog=scan(root);
  for(const [id,s] of stores)if(!catalog.some(c=>c.id===id)){s.close();stores.delete(id);}
}
async function library(){
  const enabled=globalStore.get('enabled',[]);
  const result=[];
  for(const c of catalog){
    let state={lessons:{},activity:[]},error=c.error;
    try {if(enabled.includes(c.id))state=(await getStore(c.id)).state();}catch(e){error=e.message;}
    const completed=c.lessons.filter(l=>state.lessons[l.id]?.completed).length;
    result.push({id:c.id,title:c.title,enabled:enabled.includes(c.id),total:c.lessons.length,completed,sections:new Set(c.lessons.map(l=>l.section)).size,cover:c.cover?url(c.id,c.cover):null,state,error});
  }
  for(const id of enabled)if(!catalog.some(c=>c.id===id))result.push({id,title:id,enabled:true,missing:true,total:0,completed:0,state:{lessons:{},activity:[]}});
  return {courses:result,root,settings:globalStore.get('settings',{autoplay:true,speed:1,volume:0.8}),day:localDay()};
}
app.whenReady().then(async()=>{
  globalStore=await Store.create(path.join(app.getPath('userData'),'library.sqlite'));
  root=process.env.CURSODESK_ROOT || globalStore.get('root') || path.join(app.getPath('downloads'),'Telegram Desktop');
  if(!fs.existsSync(root))fs.mkdirSync(root,{recursive:true});
  refresh();
  const changed=()=>{clearTimeout(timer);timer=setTimeout(()=>{try{refresh();win?.webContents.send('changed');}catch(e){console.error(e.message);}},800);};
  const observe=()=>{watcher?.close();try{watcher=fs.watch(root,{recursive:true},(_,name)=>{if(name && !name.includes('.course-player'))changed();});watcher.on('error',e=>console.error('Observador de carpetas:',e.message));}catch(e){console.error(e.message);}};
  observe();
  const poll=setInterval(changed,30000);poll.unref();
  protocol.handle('coursefile',async request=>{
    try {
      const u=new URL(request.url);const parts=u.pathname.slice(1).split('/').map(decodeURIComponent);const id=parts.shift();const relative=parts.join('/');
      const file=fileFor(id,relative);const size=fs.statSync(file).size;const ext=path.extname(file).toLowerCase();
      const mime={'.mp4':'video/mp4','.webm':'video/webm','.mkv':'video/x-matroska','.mov':'video/quicktime','.m4v':'video/mp4','.pdf':'application/pdf','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp','.vtt':'text/vtt','.css':'text/css'}[ext] || 'application/octet-stream';
      const headers={'Content-Type':mime,'Accept-Ranges':'bytes','Cache-Control':'no-store','Access-Control-Allow-Origin':'*'};
      let start=0,end=size-1,status=200;
      const range=request.headers.get('range');
      if(range){const m=range.match(/^bytes=(\d*)-(\d*)$/);if(!m)return new Response(null,{status:416});if(!m[1]&&m[2])start=Math.max(0,size-Number(m[2]));else{start=Number(m[1]);if(m[2])end=Math.min(end,Number(m[2]));}if(start>end||start>=size)return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+size}});status=206;headers['Content-Range']=`bytes ${start}-${end}/${size}`;}
      headers['Content-Length']=String(Math.max(0,end-start+1));
      if(request.method==='HEAD'||size===0)return new Response(null,{status,headers});
      return new Response(Readable.toWeb(fs.createReadStream(file,{start,end})),{status,headers});
    }catch(e){return new Response('Archivo no disponible',{status:404});}
  });
  ipcMain.handle('library',library);
  ipcMain.handle('rescan',async()=>{refresh();return library();});
  ipcMain.handle('set-root',async(_,folder)=>{
    if(typeof folder!=='string'||!path.isAbsolute(folder.trim()))throw new Error('Escribe una ruta absoluta a la carpeta de cursos.');
    const next=path.resolve(folder.trim());
    if(!fs.existsSync(next)||!fs.statSync(next).isDirectory())throw new Error('La carpeta no existe o no es una carpeta.');
    const nextCatalog=scan(next);
    if(next===root)return library();
    const selections=globalStore.get('roots',{});selections[root]=globalStore.get('enabled',[]);
    for(const s of stores.values())s.close();stores.clear();
    root=next;catalog=nextCatalog;
    globalStore.set('root',root);globalStore.set('roots',selections);globalStore.set('enabled',selections[root]||[]);
    clearTimeout(timer);observe();return library();
  });
  ipcMain.handle('activate',async(_,id,enabled)=>{
    if(typeof enabled!=='boolean')throw new Error('Selección inválida');
    if(enabled)await getStore(id);
    const list=new Set(globalStore.get('enabled',[]));
    if(enabled)list.add(id);else list.delete(id);
    globalStore.set('enabled',[...list]);return library();
  });
  ipcMain.handle('detail',async(_,id)=>{
    const c=course(id);const state=(await getStore(id)).state();
    return {id:c.id,title:c.title,lessons:c.lessons.map(l=>({...l,url:url(id,l.relative),resources:associateResources(c,l),subtitle:c.subtitles.find(s=>path.posix.dirname(s.relative)===path.posix.dirname(l.id)&&path.posix.basename(s.relative,s.extension).trim()===path.posix.basename(l.id,l.extension).trim())?.relative})),resources:c.resources,state};
  });
  ipcMain.handle('save',async(_,id,lessonId,data)=>{
    const c=course(id),l=c.lessons.find(l=>l.id===lessonId);if(!l)throw new Error('Clase no encontrada');
    return (await getStore(id)).update(l,{...data,day:localDay()});
  });
  ipcMain.handle('resource',async(_,id,relative)=>{
    const file=fileFor(id,relative),ext=path.extname(file).toLowerCase();
    if(ext==='.pdf'||['.jpg','.jpeg','.png','.webp','.gif'].includes(ext))return {kind:ext==='.pdf'?'pdf':'image',url:url(id,relative)};
    if(ext==='.docx'){const result=await mammoth.convertToHtml({path:file});return {kind:'html',content:result.value,word:true};}
    if(ext==='.vtt'||ext==='.srt'){
      let content=fs.readFileSync(file,'utf8');
      if(ext==='.srt')content='WEBVTT\n\n'+content.replace(/\r/g,'').replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g,'$1.$2');
      return {kind:'subtitle',content};
    }
    if(['.html','.htm','.txt','.md','.csv','.json','.py','.js'].includes(ext)){
      if(fs.statSync(file).size>20*1024*1024)return {kind:'external'};
      return {kind:['.html','.htm'].includes(ext)?'html':'text',content:fs.readFileSync(file,'utf8')};
    }
    return {kind:'external'};
  });
  ipcMain.handle('open',async(_,id,relative,choose)=>{
    const file=fileFor(id,relative);
    if(choose&&process.platform==='win32'){
      await new Promise((resolve,reject)=>require('node:child_process').execFile('rundll32.exe',['shell32.dll,OpenAs_RunDLL',file],e=>e?reject(e):resolve()));
    }else {const error=await shell.openPath(file);if(error)throw new Error(error);}
    return true;
  });
  ipcMain.handle('settings',(_,patch)=>{
    const old=globalStore.get('settings',{autoplay:true,speed:1,volume:0.8});
    if(patch){if(typeof patch.autoplay==='boolean')old.autoplay=patch.autoplay;if([0.5,0.75,1,1.25,1.5,1.75,2,2.5,3].includes(patch.speed))old.speed=patch.speed;if(Number.isFinite(patch.volume)&&patch.volume>=0&&patch.volume<=1)old.volume=patch.volume;globalStore.set('settings',old);}return old;
  });
  Menu.setApplicationMenu(null);
  win=new BrowserWindow({width:1440,height:940,minWidth:1000,minHeight:680,backgroundColor:'#191919',title:'CursoDesk',icon:path.join(__dirname,'../assets/icon.png'),show:!process.env.CURSODESK_TEST,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.on('close',event=>{if(!canClose){event.preventDefault();win.webContents.send('closing');}});
  ipcMain.on('ready-close',()=>{canClose=true;win.close();});
  win.webContents.on('will-navigate',(event,target)=>{if(target!==win.webContents.getURL())event.preventDefault();});
  win.webContents.session.webRequest.onHeadersReceived((details,callback)=>{
    if(details.url.startsWith('file:'))callback({responseHeaders:{...details.responseHeaders,'Content-Security-Policy':["default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' coursefile: data: blob:; media-src coursefile: blob:; frame-src coursefile: blob:; connect-src 'self' coursefile:; object-src coursefile:; base-uri 'none'"]}});else callback({responseHeaders:details.responseHeaders});
  });
  await win.loadFile(path.join(__dirname,'../dist/index.html'));
}).catch(error=>{require('electron').dialog.showErrorBox('CursoDesk',error.message);app.quit();});
app.on('window-all-closed',()=>app.quit());
app.on('will-quit',()=>{watcher?.close();clearTimeout(timer);for(const s of stores.values())s.close();globalStore?.close();});
