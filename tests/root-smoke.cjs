const {_electron:electron}=require('playwright');
const {sampleCourses,cleanupSamples}=require('./fixtures.cjs');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const project=path.resolve(__dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'cursodesk-root-'));
(async()=>{let app;try{
 const root=sampleCourses(),other=path.join(temp,'other');fs.mkdirSync(other);
 const env={...process.env,CURSODESK_DATA:path.join(temp,'data'),CURSODESK_TEST:'1'};delete env.CURSODESK_ROOT;
 const launch=extra=>electron.launch({args:process.env.CURSODESK_PACKAGED?[]:[project],...(process.env.CURSODESK_PACKAGED?{executablePath:path.join(project,'release','win-unpacked','CursoDesk.exe')}:{}),env:{...env,...extra}});
 app=await launch({CURSODESK_ROOT:root});let page=await app.firstWindow();await page.getByRole('heading',{name:'Tu biblioteca',exact:true}).waitFor();
 const id=await page.evaluate(async()=>{const l=await window.courses.library();await window.courses.activate(l.courses[0].id,true);return l.courses[0].id;});
 await page.getByRole('button',{name:'Preferencias',exact:true}).click();await page.getByLabel('Carpeta de cursos',{exact:true}).fill(other);await page.getByRole('button',{name:'Cambiar carpeta',exact:true}).click();
 await page.waitForFunction(r=>document.querySelector('#root-folder').placeholder===r,other);
 assert.equal((await page.evaluate(()=>window.courses.library())).courses.length,0);
 await assert.rejects(page.evaluate(()=>window.courses.setRoot('relative-folder')));
 await app.close();app=null;app=await launch({});page=await app.firstWindow();await page.getByRole('heading',{name:'Tu biblioteca',exact:true}).waitFor();
 assert.equal((await page.evaluate(()=>window.courses.library())).root,other);
 const back=await page.evaluate(r=>window.courses.setRoot(r),root);assert.equal(back.courses.find(c=>c.id===id).enabled,true);
 console.log('PASS: cambio de raíz desde Preferencias, validación, persistencia y selección independiente.');
 }finally{if(app)await app.close();cleanupSamples();const target=path.resolve(temp);if(target.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(target).startsWith('cursodesk-root-'))fs.rmSync(target,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
