const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync(`${__dirname}/index.html`, 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
async function setup(results) {
  const dom = new JSDOM(html); const calls = []; let alerts=0; let release;
  const context = vm.createContext({document:dom.window.document, setTimeout(){}, alert(){alerts++;}, ZOHO:{embeddedApp:{on(){},init:()=>Promise.resolve()},CRM:{...require('./owner-fixture.cjs'), INTERACTOR:{getRecord:async()=>({})},UI:{Record:{open(){}}},FUNCTIONS:{execute:async(name,req)=>{
    const args=JSON.parse(req.arguments); calls.push(args);
    if(!args.action)return {details:{output:JSON.stringify({status:'success',empresas:[{id:'100',nome:'Empresa',contatos:[{id:'101',nome:'A',email:'a@example.invalid'},{id:'102',nome:'B',email:'b@example.invalid'}]}]})}};
    const result=results.shift();
    if(result==='lost')throw Error('response lost');
    if(result==='waiting')return new Promise(r=>release=r);
    return {details:{output:JSON.stringify(result)}};
  }}}}});
  vm.runInContext(script,context); await vm.runInContext("currentOppId='700'; carregarDados()",context);
  return {doc:dom.window.document,calls,run:s=>vm.runInContext(s,context),release:r=>release(r),get alerts(){return alerts;}};
}
test('creation sends selected contact IDs only, stores plain draft, forces Planning, never displays sent emails',async()=>{
 const s=await setup([{status:'success',campanha_id:'800',total_vinculados:1,total_disparados:0}]);
 s.doc.querySelectorAll('.chk-membro')[1].checked=false;
 s.doc.getElementById('corpoInput').value='Linha 1\nLinha 2';
 await s.run('executarCampanha()'); const req=s.calls[1];
 assert.equal(req.action,'criar_campanha'); assert.match(req.request_id,/^[A-Za-z0-9_-]{8,80}$/);
 assert.deepEqual(req.payload.membros,[{contato_id:'101'}]); assert.equal(req.payload.status_campanha,'Planejamento');
 assert.equal(req.payload.corpo_email,'Linha 1\nLinha 2');
 assert.equal(s.doc.getElementById('campanhaButton').disabled,true);
 assert.match(s.doc.getElementById('status').textContent,/Nenhum e-mail enviado/);
 assert.equal(s.doc.getElementById('status').style.display,'block');
 assert.equal(s.doc.getElementById('abrirCampanhaButton').hidden,false);
 await s.run('executarCampanha()'); assert.equal(s.calls.length,2);
});
test('partial membership retries same key and immutable payload rather than creating another campaign',async()=>{
 const s=await setup([{status:'partial_failure',campanha_id:'800',total_vinculados:1,pendentes:['102']},{status:'success',campanha_id:'800',total_vinculados:2}]);
 await s.run('executarCampanha()');assert.match(s.doc.getElementById('campanhaButton').textContent,/Concluir vínculos/);
 assert.equal(s.doc.getElementById('nomeCampanha').disabled,true);
 s.doc.getElementById('nomeCampanha').value='DOM changed after partial response';
 await s.run('executarCampanha()');assert.deepEqual(s.calls[1],s.calls[2]);
});
test('response loss retries original key and selection',async()=>{
 const s=await setup(['lost',{status:'success',campanha_id:'800',total_vinculados:2}]);
 await s.run('executarCampanha()'); assert.equal(s.doc.getElementById('campanhaButton').disabled,false);
 await s.run('executarCampanha()');assert.deepEqual(s.calls[1],s.calls[2]);
});
test('empty audience and missing name never call creation',async()=>{
 const s=await setup([]);s.doc.getElementById('nomeCampanha').value='';
 await s.run('executarCampanha()');assert.equal(s.calls.length,1);
 s.doc.getElementById('nomeCampanha').value='Campanha';s.run('marcarTodos(false)');
 await s.run('executarCampanha()');assert.equal(s.calls.length,1);assert.equal(s.alerts,1);
});
test('double click cannot run two simultaneous creations',async()=>{
 const s=await setup(['waiting']); const first=s.run('executarCampanha()');
 await s.run('executarCampanha()');assert.equal(s.calls.length,2);
 s.release({details:{output:JSON.stringify({status:'success',campanha_id:'800',total_vinculados:2})}});await first;
});
