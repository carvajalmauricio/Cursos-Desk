const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const initSqlJs = require('sql.js');
const VIDEO = new Set(['.mp4', '.webm', '.mkv', '.mov', '.m4v', '.avi']);
const SUBTITLE = new Set(['.srt', '.vtt']);
const collator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });
const sort = (a,b) => collator.compare(a.name,b.name);
const title = name => name.replace(/^\d+[\s.\-_]+/, '').replace(/\.[^.]+$/, '').trim();
function walk(dir, base = dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort(sort)) {
    if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, base));
    else if (entry.isFile()) out.push({ name: entry.name, relative: path.relative(base, full).split(path.sep).join('/'), extension: path.extname(entry.name).toLowerCase(), size: fs.statSync(full).size });
  }
  return out;
}
function scan(root) {
  if (!fs.existsSync(root)) throw new Error('No se encuentra la carpeta de cursos: ' + root);
  const courses = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true }).sort(sort)) {
    if (!entry.isDirectory() || entry.isSymbolicLink() || entry.name.startsWith('.')) continue;
    try {
      const folder = path.join(root,entry.name);
      const files = walk(folder);
      const videos = files.filter(f=>VIDEO.has(f.extension));
      if (!videos.length) continue;
      const common = videos.every(f=>f.relative.includes('/') && f.relative.split('/')[0]===videos[0].relative.split('/')[0]) ? videos[0].relative.split('/')[0] : null;
      const unwrap = common && title(common).toLowerCase()===title(entry.name).toLowerCase();
      const lessons = videos.map(f=>{
        const parts = f.relative.split('/');
        if (unwrap) parts.shift();
        parts.pop();
        return { ...f, id: f.relative, title: title(f.name), section: parts.join(' / ') || 'Clases' };
      });
      const resources = files.filter(f=>!VIDEO.has(f.extension) && !SUBTITLE.has(f.extension));
      const cover = files.find(f=>/^cover\.(jpg|jpeg|png|webp)$/i.test(f.name));
      courses.push({ id: entry.name, title: entry.name, folder, lessons, resources, subtitles: files.filter(f=>SUBTITLE.has(f.extension)), cover: cover?.relative || null });
    } catch (error) { courses.push({ id:entry.name, title:entry.name, folder:path.join(root,entry.name), lessons:[], resources:[], error:error.message }); }
  }
  return courses;
}
function mergeRanges(ranges, incoming) {
  const all = [...ranges];
  if (incoming && Number.isFinite(incoming[0]) && Number.isFinite(incoming[1]) && incoming[1]>incoming[0] && incoming[0]>=0) all.push(incoming);
  const merged=[];
  for (const [a,b] of all.sort((a,b)=>a[0]-b[0])) {
    const last=merged.at(-1);
    if(last && a<=last[1]+0.25) last[1]=Math.max(last[1],b); else merged.push([a,b]);
  }
  return merged;
}
class Store {
  static async create(file) {
    const SQL=await initSqlJs({ locateFile: f=>require.resolve('sql.js/dist/'+f) });
    return new Store(SQL,file);
  }
  constructor(SQL,file) {
    this.file=file;
    fs.mkdirSync(path.dirname(file),{recursive:true});
    try { this.db=new SQL.Database(fs.existsSync(file)?fs.readFileSync(file):undefined); }
    catch(error) { throw new Error('No se pudo abrir el seguimiento. Conservamos el archivo: '+file+' ('+error.message+')'); }
    this.db.run('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT); CREATE TABLE IF NOT EXISTS lessons (id TEXT PRIMARY KEY, position REAL DEFAULT 0, duration REAL DEFAULT 0, completed INTEGER DEFAULT 0, ranges TEXT DEFAULT \'[]\', lastSeen TEXT); CREATE TABLE IF NOT EXISTS activity (day TEXT, lesson TEXT, position REAL, title TEXT, section TEXT, PRIMARY KEY(day,lesson));');
    if(!this.get('uuid')) this.set('uuid',crypto.randomUUID());
  }
  query(sql,params=[]) { const s=this.db.prepare(sql); try {s.bind(params); const rows=[];while(s.step())rows.push(s.getAsObject());return rows;}finally{s.free();} }
  get(key,fallback=null) { const row=this.query('SELECT value FROM meta WHERE key=?',[key])[0];return row ? JSON.parse(row.value) : fallback; }
  set(key,value) {this.db.run('INSERT OR REPLACE INTO meta VALUES (?,?)',[key,JSON.stringify(value)]);this.flush();}
  state() { return { lessons:Object.fromEntries(this.query('SELECT * FROM lessons').map(r=>[r.id,{...r,completed:!!r.completed,ranges:JSON.parse(r.ranges)}])), activity:this.query('SELECT * FROM activity ORDER BY day DESC'), lastLesson:this.get('lastLesson') }; }
  update(lesson,{position=0,duration=0,range=null,completed,day}) {
    if(!Number.isFinite(position)||position<0||!Number.isFinite(duration)||duration<0) throw new Error('Posición de reproducción inválida');
    const old=this.state().lessons[lesson.id] || {ranges:[],completed:false};
    if(range && (range[1]-range[0]>60 || range[1]>duration+1)) throw new Error('Fragmento de reproducción inválido');
    const ranges=mergeRanges(old.ranges,range);
    const watched=ranges.reduce((n,[a,b])=>n+b-a,0);
    const done=typeof completed==='boolean'?completed:(old.completed || (duration>0&&watched/duration>=0.9));
    const stamp=new Date().toISOString();
    this.db.run('INSERT OR REPLACE INTO lessons VALUES (?,?,?,?,?,?)',[lesson.id,position,duration,done?1:0,JSON.stringify(ranges),stamp]);
    if(range) this.db.run('INSERT OR REPLACE INTO activity VALUES (?,?,?,?,?)',[day,lesson.id,position,lesson.title,lesson.section]);
    this.db.run('INSERT OR REPLACE INTO meta VALUES (?,?)',['lastLesson',JSON.stringify(lesson.id)]);
    this.flush();
    return {id:lesson.id,position,duration,completed:done,ranges,lastSeen:stamp};
  }
  flush() {
    const tmp=this.file+'.tmp';
    fs.writeFileSync(tmp,Buffer.from(this.db.export()));
    if(fs.existsSync(this.file) && (!fs.existsSync(this.file+'.bak') || Date.now()-fs.statSync(this.file+'.bak').mtimeMs>86400000)) fs.copyFileSync(this.file,this.file+'.bak');
    fs.renameSync(tmp,this.file);
  }
  close(){if(this.closed)return;this.closed=true;if(fs.existsSync(path.dirname(this.file)))this.flush();this.db.close();}
}
function associateResources(course,lesson) {
  const dir=path.posix.dirname(lesson.id);
  const stem=path.posix.basename(lesson.id,path.posix.extname(lesson.id)).trim().toLowerCase();
  const number=path.posix.basename(lesson.id).match(/^\d+/)?.[0];
  return course.resources.filter(r=>{
    const rd=path.posix.dirname(r.relative);
    const rs=path.posix.basename(r.relative,path.posix.extname(r.relative)).trim().toLowerCase();
    if(rd===dir && (rs===stem || (number && r.name.match(/^\d+/)?.[0]===number))) return true;
    if(rd.startsWith(dir+'/') && /recursos|resources|material/i.test(rd.slice(dir.length))) return true;
    return false;
  });
}
module.exports={scan,Store,mergeRanges,associateResources,VIDEO};
