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

test("default draft contains no characters that CRM replaces with question marks", async () => {
  const s = await setup([]);
  assert.equal([...s.doc.getElementById("corpoInput").value].some(c => c.codePointAt(0) > 0xFFFF), false);
});

test("unsupported characters are rejected before creation and can be corrected", async () => {
  for (const field of ["nomeCampanha", "assuntoInput", "corpoInput"]) {
    const s = await setup([{status:"success",campanha_id:"800",total_vinculados:2}]);
    s.doc.getElementById(field).value = "Conteúdo 📲";
    await s.run("executarCampanha()");
    assert.equal(s.calls.length, 1, `no creation for ${field}`);
    assert.match(s.doc.getElementById("status").textContent, /caracteres|emojis/i);
    assert.equal(s.doc.getElementById(field).disabled, false);
    s.doc.getElementById(field).value = "Conteúdo corrigido";
    await s.run("executarCampanha()");
    assert.equal(s.calls.length, 2);
  }
});

test("accents, supported Unicode and line breaks remain unchanged", async () => {
  const s = await setup([{status:"success",campanha_id:"800",total_vinculados:2}]);
  const body = "Olá, ação e negociação.\nSão Paulo — 中文";
  s.doc.getElementById("corpoInput").value = body;
  await s.run("executarCampanha()");
  assert.equal(s.calls[1].payload.corpo_email, body);
});

const mailConfig = {status:"success", campaigns:[{id:"800",name:"Campanha"}], senders:[{email:"sender@example.invalid",user_name:"Operação"}]};
const mailCampaign = {status:"success",subject:"Olá {{Nome_Contato}}",body:"Mensagem {{Nome_Empresa}}",members:[
  {id:"101",Full_Name:"A",Email:"a@example.invalid"},
  {id:"102",Full_Name:"B",Email:"b@example.invalid"}
],previous:[]};
const mailPreviewResult = {status:"success",campaign_id:"800",from:"sender@example.invalid",recipients:[
  {id:"101",name:"A",email:"a@example.invalid",subject:"Olá A",body:"Mensagem Empresa",hash:"a".repeat(64)},
  {id:"102",name:"B",email:"b@example.invalid",subject:"Olá B",body:"Mensagem Empresa",hash:"b".repeat(64)}
]};
const acceptedMail = {status:"accepted",receipt_saved:true};
test("opening review and generating a preview never send email or create a campaign", async () => {
  const s = await setup([mailConfig, mailCampaign, mailPreviewResult]);
  assert.equal(s.doc.getElementById("enviarEmailsButton").disabled,false);
  await s.run("prepararEnvioMassa()");
  await s.run("gerarPreviaEnvio()");
  assert.deepEqual(s.calls.slice(1).map(c=>c.action),["mail_config","mail_campaign","mail_preview"]);
  assert.equal(s.doc.getElementById("emailSendFinal").disabled,true);
  await s.run("confirmarEnvioMassa()");
  assert.equal(s.calls.length,4);
  assert.equal(s.doc.getElementById("emailPreview").hidden,false);
});
test("explicit confirmation sends each reviewed contact separately and blocks double clicks", async () => {
  const s = await setup([mailConfig,mailCampaign,mailPreviewResult,"waiting",acceptedMail]);
  await s.run("prepararEnvioMassa()"); await s.run("gerarPreviaEnvio()");
  s.doc.getElementById("emailConfirm").checked=true;
  s.run("habilitarConfirmacaoEnvio()");
  assert.equal(s.doc.getElementById("emailSendFinal").disabled,false);
  s.doc.getElementById("emailBody").value="DOM altered after review";
  const first=s.run("confirmarEnvioMassa()"); await s.run("confirmarEnvioMassa()");
  assert.equal(s.calls.length,5);
  s.release({details:{output:JSON.stringify(acceptedMail)}}); await first;
  const sends=s.calls.filter(c=>c.action==="mail_send");
  assert.equal(sends.length,2);
  assert.deepEqual(sends.map(c=>c.contact_ids),[["101"],["102"]]);
  assert.deepEqual(sends.map(c=>c.hash),["a".repeat(64),"b".repeat(64)]);
  assert.ok(sends.every(c=>c.confirmed===true && c.body==="Mensagem {{Nome_Empresa}}"));
  await s.run("confirmarEnvioMassa()"); assert.equal(s.calls.length,6);
  assert.match(s.doc.getElementById("emailStatus").textContent,/2 email.*aceito/);
});
test("a lost response stops the batch and never retries the uncertain contact automatically", async () => {
  const s=await setup([mailConfig,mailCampaign,mailPreviewResult,"lost"]);
  await s.run("prepararEnvioMassa()"); await s.run("gerarPreviaEnvio()");
  s.doc.getElementById("emailConfirm").checked=true;
  await s.run("confirmarEnvioMassa()"); await s.run("confirmarEnvioMassa()");
  assert.equal(s.calls.filter(c=>c.action==="mail_send").length,1);
  assert.match(s.doc.getElementById("emailStatus").textContent,/interrompido.*0 aceito.*Não haverá reenvio automático/s);
  assert.equal(s.doc.getElementById("emailSendFinal").disabled,true);
});
test("opt-out, missing email and previously recorded addresses cannot be selected", async () => {
  const campaign={...mailCampaign,members:[
    ...mailCampaign.members,
    {id:"103",Full_Name:"C",Email_Opt_Out:true,Email:"c@example.invalid"},
    {id:"104",Full_Name:"D"}
  ],previous:[{Email_Destinatario:"a@example.invalid",Estado_do_Envio:"Aceito pelo Zoho"}]};
  const s=await setup([mailConfig,campaign]); await s.run("prepararEnvioMassa()");
  const boxes=[...s.doc.querySelectorAll(".email-contact")];
  assert.deepEqual(boxes.filter(c=>c.disabled).map(c=>c.value),["101","103","104"]);
  assert.deepEqual(boxes.filter(c=>c.checked).map(c=>c.value),["102"]);
});
test("unavailable OAuth connection shows its pending setup and never enables sending", async () => {
  const s=await setup([{status:"unavailable",message:"Conecte FitStock Campanhas Email"}]);
  await s.run("prepararEnvioMassa()");
  assert.equal(s.calls.length,2);
  assert.match(s.doc.getElementById("emailStatus").textContent,/Conecte FitStock Campanhas Email/);
  assert.equal(s.doc.getElementById("emailSendFinal").disabled,true);
});
test("editing invalidates confirmation and incomplete preview responses cannot send", async () => {
  const s=await setup([mailConfig,mailCampaign,mailPreviewResult]);
  await s.run("prepararEnvioMassa()"); await s.run("gerarPreviaEnvio()");
  s.doc.getElementById("emailConfirm").checked=true;
  s.run("editarRevisaoEnvio()"); await s.run("confirmarEnvioMassa()");
  assert.equal(s.calls.length,4); assert.equal(s.doc.getElementById("emailConfirm").checked,false);
  assert.equal(s.doc.getElementById("emailSendFinal").disabled,true);
  const bad=await setup([mailConfig,mailCampaign,{status:"success",recipients:[mailPreviewResult.recipients[0]]}]);
  await bad.run("prepararEnvioMassa()"); await bad.run("gerarPreviaEnvio()");
  bad.doc.getElementById("emailConfirm").checked=true; await bad.run("confirmarEnvioMassa()");
  assert.equal(bad.calls.length,4); assert.match(bad.doc.getElementById("emailStatus").textContent,/incompleta/);
});
test("an accepted email with a missing history receipt stops the batch without understating the known acceptance", async () => {
  const s=await setup([mailConfig,mailCampaign,mailPreviewResult,{status:"accepted",receipt_saved:false,message:"Confira o histórico"}]);
  await s.run("prepararEnvioMassa()"); await s.run("gerarPreviaEnvio()");
  s.doc.getElementById("emailConfirm").checked=true;
  await s.run("confirmarEnvioMassa()");
  assert.equal(s.calls.filter(c=>c.action==="mail_send").length,1);
  assert.match(s.doc.getElementById("emailStatus").textContent,/interrompido.*1 aceito/s);
});
