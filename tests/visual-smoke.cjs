const {sampleCourses,cleanupSamples}=require('./fixtures.cjs');
const {_electron:electron}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {scan}=require('../electron/core.cjs');
const project=path.resolve(__dirname,'..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'cursodesk-visual-'));
(async()=>{let app;
try{
 const root=path.join(temp,'courses');fs.mkdirSync(root);
 const courses=scan(sampleCourses());
 for(const c of courses)for(const f of [...c.lessons,...c.resources]){const target=path.join(root,c.id,f.relative);fs.mkdirSync(path.dirname(target),{recursive:true});fs.linkSync(path.join(c.folder,f.relative),target);}
 app=await electron.launch({args:process.env.CURSODESK_PACKAGED?[]:[project],...(process.env.CURSODESK_PACKAGED?{executablePath:path.join(project,'release','win-unpacked','CursoDesk.exe')}:{}),env:{...process.env,CURSODESK_ROOT:root,CURSODESK_DATA:path.join(temp,'data'),CURSODESK_TEST:'1'}});
 const page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.getByRole('heading',{name:'Tu biblioteca',exact:true}).waitFor();
 await page.getByRole('button',{name:/Cursos 2/}).click();await page.locator('.detected input').nth(0).check();await page.waitForFunction(()=>document.querySelectorAll('.rail-course').length===1);await page.locator('.detected input').nth(1).check();await page.getByRole('button',{name:'Cerrar cursos'}).click();
 await page.waitForFunction(()=>document.querySelectorAll('.course-card').length===2);
 const styles=await page.evaluate(()=>{const css=s=>getComputedStyle(document.querySelector(s));return {radius:css('.course-card').borderRadius,background:css('.rail').backgroundColor,icon:document.querySelector('.brand-icon').naturalWidth};});
 assert.equal(styles.radius,'2px');assert.equal(styles.background,'rgb(30, 30, 30)');assert.ok(styles.icon>0);
 await page.evaluate(()=>window.scrollTo(0,0));if(!process.env.CURSODESK_PACKAGED)await page.screenshot({path:path.join(project,'release','biblioteca.png')});
 await page.locator('.course-card').first().getByRole('button',{name:'Empezar curso'}).click();await page.waitForFunction(()=>document.querySelector('video')?.readyState>=1);await page.locator('.resource-file').first().click();await page.locator('iframe[title="Contenido del recurso"]').waitFor();
 assert.equal(await page.locator('.lesson.playing').evaluate(e=>getComputedStyle(e).borderLeftWidth),'0px');
 await page.evaluate(()=>window.scrollTo(0,0));if(!process.env.CURSODESK_PACKAGED)await page.screenshot({path:path.join(project,'release','reproductor.png')});assert.deepEqual(errors,[]);console.log('PASS: superficies neutras, esquinas de 2px, selección sin borde lateral, icono generado y pantallas verificadas.');
}finally{if(app)await app.close();cleanupSamples();const absolute=path.resolve(temp);if(absolute.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(absolute).startsWith('cursodesk-visual-'))fs.rmSync(absolute,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
