const {sampleCourses,cleanupSamples}=require('./fixtures.cjs');
const {_electron:electron}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {scan}=require('../electron/core.cjs');
const project=path.resolve(__dirname,'..');
let original;
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'cursodesk-ui-'));
const root=path.join(temp,'courses'),data=path.join(temp,'data');
const launch=()=>electron.launch({args:process.env.CURSODESK_PACKAGED?[]:[project],...(process.env.CURSODESK_PACKAGED?{executablePath:path.join(project,'release','win-unpacked','CursoDesk.exe')}:{}),env:{...process.env,CURSODESK_ROOT:root,CURSODESK_DATA:data,CURSODESK_TEST:'1'},timeout:60000});
(async()=>{
  let app;
  const errors=[];
  try{
    original=sampleCourses();fs.mkdirSync(root,{recursive:true});
    const source=scan(original);assert.equal(source.length,2);assert.deepEqual(source.map(c=>c.lessons.length),[7,19]);
    for(const c of source)for(const f of [...c.lessons,...c.resources]){
      const dest=path.join(root,c.id,f.relative);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.linkSync(path.join(c.folder,f.relative),dest);
    }
    app=await launch();let page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));
    await page.getByRole('heading',{name:'Tu biblioteca',exact:true}).waitFor();
    await page.getByRole('button',{name:/Cursos 2/}).click();
    const checks=page.locator('.detected input[type=checkbox]');await checks.nth(0).check();await checks.nth(1).check();
    await page.getByRole('button',{name:'Cerrar cursos'}).click();
    await page.locator('.course-card').first().getByRole('button',{name:'Empezar curso'}).click();
    await page.locator('video').waitFor();
    await page.waitForFunction(()=>document.querySelector('video')?.readyState>=1,null,{timeout:30000});
    const duration=await page.locator('video').evaluate(v=>v.duration);assert.ok(duration>0);console.log('Video real cargado:',duration);
    await page.locator('video').evaluate(v=>v.play());await page.waitForFunction(()=>document.querySelector('video').currentTime>1,null,{timeout:15000});await page.locator('video').evaluate(v=>v.pause());
    await page.waitForTimeout(500);
    const resources=page.locator('.resource-file');assert.ok(await resources.count()>0);await resources.first().click();
    await page.locator('iframe[title="Contenido del recurso"]').waitFor();
    await page.frameLocator('iframe[title="Contenido del recurso"]').locator('body').waitFor();
    assert.ok((await page.frameLocator('iframe[title="Contenido del recurso"]').locator('body').innerText()).length>100);
    await page.getByRole('button',{name:'Marcar como completada',exact:true}).click();await page.getByRole('button',{name:'Clase completada',exact:true}).waitFor();
    const state=await page.evaluate(async()=>{const l=await window.courses.library();const c=l.courses[0];return window.courses.detail(c.id);});
    assert.ok(state.state.lessons[state.lessons[0].id].completed);assert.ok(state.state.activity.length>0);
    const range=await page.evaluate(async()=>{const v=document.querySelector('video');const r=await fetch(v.src,{headers:{Range:'bytes=0-99'}});return {status:r.status,length:(await r.arrayBuffer()).byteLength};});assert.deepEqual(range,{status:206,length:100});
    const word=await page.evaluate(async()=>{const l=await window.courses.library();const c=await window.courses.detail(l.courses[1].id);return window.courses.resource(c.id,c.resources.find(r=>r.extension==='.docx').relative);});assert.equal(word.kind,'html');assert.ok(word.content.length>0);
    if(!process.env.CURSODESK_PACKAGED)await page.screenshot({path:path.join(project,'release','reproductor.png')});
    await page.getByRole('button',{name:'Volver a biblioteca'}).click();if(!process.env.CURSODESK_PACKAGED)await page.screenshot({path:path.join(project,'release','biblioteca.png')});
    await page.getByRole('button',{name:'Actividad',exact:true}).click();await page.getByRole('heading',{name:'Hoy',exact:true}).waitFor();
    await app.close();app=null;
    app=await launch();page=await app.firstWindow();await page.getByRole('heading',{name:'Tu biblioteca',exact:true}).waitFor();
    const reopened=await page.evaluate(async()=>{const l=await window.courses.library();return {count:l.courses.filter(c=>c.enabled).length,completed:l.courses[0].completed,activity:l.courses[0].state.activity.length};});assert.equal(reopened.count,2);assert.equal(reopened.completed,1);assert.ok(reopened.activity>0);
    await page.evaluate(async()=>{const l=await window.courses.library();await window.courses.activate(l.courses[0].id,false);await window.courses.activate(l.courses[0].id,true);});
    assert.equal((await page.evaluate(()=>window.courses.library())).courses[0].completed,1);
    const newFolder=path.join(root,'Nuevo curso');fs.mkdirSync(newFolder);require('node:child_process').execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=0x203e38:s=640x360:r=30','-f','lavfi','-i','sine=frequency=440:sample_rate=44100','-t','4','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',path.join(newFolder,'01 - Nueva.mp4')]);fs.copyFileSync(path.join(newFolder,'01 - Nueva.mp4'),path.join(newFolder,'02 - Segunda.mp4'));fs.writeFileSync(path.join(newFolder,'01 - Nueva.srt'),'1\n00:00:00,000 --> 00:00:03,000\nSubtítulo de prueba\n');
    fs.writeFileSync(path.join(newFolder,'01 - Guía.pdf'),require('./pdf-fixture.cjs')());
    for(let attempt=0;attempt<40;attempt++){if((await page.evaluate(()=>window.courses.library())).courses.some(c=>c.id==='Nuevo curso'))break;await page.waitForTimeout(500);}
    const detected=await page.evaluate(()=>window.courses.library());console.log('Cursos tras detectar:',detected.courses.map(c=>({id:c.id,enabled:c.enabled,missing:c.missing,error:c.error})));assert.equal(detected.courses.find(c=>c.id==='Nuevo curso').enabled,false);
    await page.getByRole('button',{name:'Biblioteca',exact:true}).click();await page.getByRole('button',{name:/Cursos 3/}).click();await page.locator('.detected label').filter({hasText:'Nuevo curso'}).locator('input').check();await page.getByRole('button',{name:'Cerrar cursos'}).click();await page.locator('.course-card').filter({hasText:'Nuevo curso'}).getByRole('button',{name:'Empezar curso'}).click();
    await page.waitForFunction(()=>document.querySelector('video')?.readyState>=1);await page.locator('select[aria-label="Velocidad"]').selectOption('3');await page.locator('video').evaluate(v=>v.play());
    await page.getByText(/Siguiente clase en/).waitFor({timeout:15000});await page.getByRole('heading',{name:'Segunda',exact:true}).waitFor({timeout:12000});
    for(let attempt=0;attempt<30;attempt++){const d=await page.evaluate(()=>window.courses.detail('Nuevo curso'));if(d.state.lessons[d.lessons[1].id]?.completed)break;await page.waitForTimeout(400);}
    const automatic=await page.evaluate(()=>window.courses.detail('Nuevo curso'));assert.equal(automatic.state.lessons[automatic.lessons[0].id].completed,true);assert.equal(automatic.state.lessons[automatic.lessons[1].id].completed,true);console.log('PASS: finalización al 90% y siguiente clase automática.');
    await page.getByRole('button',{name:'Todo el curso',exact:true}).click();await page.locator('.resource-file').filter({hasText:'Guía.pdf'}).click();await page.locator('iframe[title="Documento PDF"]').waitFor();await page.waitForTimeout(1500);
    const pdf=await page.evaluate(async()=>{const src=document.querySelector('iframe[title="Documento PDF"]').src;const r=await fetch(src);return {status:r.status,mime:r.headers.get('content-type'),signature:(await r.text()).slice(0,8)};});assert.equal(pdf.status,200);assert.equal(pdf.mime,'application/pdf');assert.equal(pdf.signature,'%PDF-1.4');console.log('PDF frames:',page.frames().map(f=>f.url()));if(!process.env.CURSODESK_PACKAGED)await page.screenshot({path:path.join(project,'release','pdf.png')});
    assert.deepEqual(errors,[]);console.log('PASS: detección 2 cursos/26 videos, reproducción, HTML, Word, rangos HTTP, guardado, historial, reinicio, desactivar/reactivar y curso nuevo sin activar.');
  }finally{if(app)await app.close();cleanupSamples();if(path.resolve(temp).startsWith(path.resolve(os.tmpdir())+path.sep))fs.rmSync(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
