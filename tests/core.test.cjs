const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {scan,Store,associateResources,mergeRanges}=require('../electron/core.cjs');
function cleanup(root){const absolute=path.resolve(root);assert.ok(absolute.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(absolute).startsWith('cursodesk-'));fs.rmSync(absolute,{recursive:true});}
test('curso anidado, orden numérico y recursos de clase y sección',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'cursodesk-core-'));
  try{
    const base=path.join(root,'Curso','Curso','01 - Sección');fs.mkdirSync(path.join(base,'Recursos Adicionales'),{recursive:true});
    for(const f of ['10 - Diez.mp4','2 - Dos.mp4','2 - Dos.html','2 - datos.csv','Recursos Adicionales/Enlaces.docx'])fs.writeFileSync(path.join(base,f),'fixture');
    fs.writeFileSync(path.join(root,'curso.part1.rar'),'fixture');
    const courses=scan(root);assert.equal(courses.length,1);assert.deepEqual(courses[0].lessons.map(l=>l.title),['Dos','Diez']);assert.equal(courses[0].lessons[0].section,'01 - Sección');assert.equal(associateResources(courses[0],courses[0].lessons[0]).length,3);
  }finally{cleanup(root);}
});
test('90% por fragmentos únicos, posición, historial diario y reapertura SQLite',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'cursodesk-db-'));const file=path.join(root,'course.sqlite');
  try{
    let s=await Store.create(file);const l={id:'Sección/Clase.mp4',title:'Clase',section:'Sección'};
    assert.equal(s.update(l,{position:99,duration:100,day:'2026-10-10'}).completed,false,'saltar al final no cuenta');
    s.update(l,{position:50,duration:100,range:[0,50],day:'2026-10-10'});
    assert.equal(s.update(l,{position:50,duration:100,range:[0,50],day:'2026-10-10'}).completed,false,'repetir no duplica avance');
    assert.equal(s.update(l,{position:90,duration:100,range:[50,90],day:'2026-10-11'}).completed,true);
    assert.equal(s.state().activity.length,2);s.close();
    assert.equal(fs.readFileSync(file).subarray(0,15).toString(),'SQLite format 3');
    s=await Store.create(file);assert.equal(s.state().lessons[l.id].position,90);assert.equal(s.state().lessons[l.id].completed,true);
    s.update(l,{position:90,duration:100,completed:false,day:'2026-10-11'});assert.equal(s.state().lessons[l.id].completed,false);s.close();
    assert.ok(fs.existsSync(file+'.bak'));
  }finally{cleanup(root);}
});
test('rangos solapados y fragmentos inválidos',()=>{assert.deepEqual(mergeRanges([[0,10],[20,30]],[5,25]),[[0,30]]);assert.deepEqual(mergeRanges([],[-1,50]),[]);});
