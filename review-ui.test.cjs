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
  {id:"101",Full_Name:"A",Email:"a@example.invalid",Unsubscribed_Mode:null,Unsubscribed_Time:null},
  {id:"102",Full_Name:"B",Email:"b@example.invalid",Unsubscribed_Mode:null,Unsubscribed_Time:null}
],previous:[]};
const mailPreviewResult = {status:"success",campaign_id:"800",from:"sender@example.invalid",recipients:[
  {id:"101",name:"A",email:"a@example.invalid",subject:"Olá A",body:"Mensagem Empresa",hash:"a".repeat(64)},
  {id:"102",name:"B",email:"b@example.invalid",subject:"Olá B",body:"Mensagem Empresa",hash:"b".repeat(64)}
]};
const submittedMail = {status:"submitted",transport:"native_sendmail",receipt_saved:true};

test("opening saved draft never sends and provides no second editor or preview controls", async () => {
  const s=await setup([mailConfig,mailCampaign]); await s.run("prepararEnvioMassa()");
  assert.deepEqual(s.calls.slice(1).map(c=>c.action),["mail_config","mail_campaign"]);
  for(const id of ["emailBody","emailSubject","emailPreviewButton","emailConfirm"]) assert.equal(s.doc.getElementById(id),null);
  assert.match(s.doc.getElementById("emailDraftSummary").textContent,/Assunto salvo: Olá/);
  assert.equal(s.doc.getElementById("emailSendFinal").disabled,false);
});
test("one send click uses only server saved draft and freezes recipients despite DOM edits",async()=>{
 const s=await setup([mailConfig,mailCampaign,mailPreviewResult,"waiting",submittedMail]);
 await s.run("prepararEnvioMassa()"); const first=s.run("enviarRascunhoSalvo()");
 await new Promise(r=>setImmediate(r)); await s.run("enviarRascunhoSalvo()");
 s.doc.getElementById("corpoInput").value="Unsaved edit must not be sent";
 s.doc.getElementById("emailSender").value="attacker@example.invalid";
 s.release({details:{output:JSON.stringify(submittedMail)}}); await first;
 const sends=s.calls.filter(c=>c.action==="mail_send");
 assert.equal(sends.length,2);
 assert.deepEqual(sends.map(c=>c.contact_ids),[["101"],["102"]]);
 assert.ok(sends.every(c=>c.confirmed===true && c.use_saved_draft===true && !("body" in c) && !("subject" in c) && c.from==="sender@example.invalid"));
 assert.deepEqual(sends.map(c=>c.hash),["a".repeat(64),"b".repeat(64)]);
 await s.run("enviarRascunhoSalvo()");assert.equal(s.calls.filter(c=>c.action==="mail_send").length,2);
});
test("double click during internal validation cannot start another batch or close panel",async()=>{
 const s=await setup([mailConfig,mailCampaign,"waiting",submittedMail,submittedMail]);await s.run("prepararEnvioMassa()");
 const first=s.run("enviarRascunhoSalvo()");await s.run("enviarRascunhoSalvo()");s.run("fecharRevisaoEnvio()");
 assert.equal(s.calls.filter(c=>c.action==="mail_preview").length,1);
 assert.equal(s.doc.getElementById("emailReviewPanel").hidden,false);
 s.release({details:{output:JSON.stringify(mailPreviewResult)}});await first;
 assert.equal(s.calls.filter(c=>c.action==="mail_send").length,2);
});
test("lost send response stops batch and never retries automatically",async()=>{
 const s=await setup([mailConfig,mailCampaign,mailPreviewResult,"lost"]);await s.run("prepararEnvioMassa()");await s.run("enviarRascunhoSalvo()");await s.run("enviarRascunhoSalvo()");
 assert.equal(s.calls.filter(c=>c.action==="mail_send").length,1);
 assert.match(s.doc.getElementById("emailStatus").textContent,/interrompido.*0 email.*Não haverá reenvio automático/s);
 assert.equal(s.doc.getElementById("emailSendFinal").disabled,true);
});
test("unsubscribe, missing email, unreadable eligibility and prior receipts block recipients",async()=>{
 const campaign={...mailCampaign,members:[...mailCampaign.members,
 {id:"103",Email:"c@example.invalid",Unsubscribed_Mode:"Manual",Unsubscribed_Time:null},
 {id:"104",Unsubscribed_Mode:null,Unsubscribed_Time:null},
 {id:"105",Email:"e@example.invalid"},
 {id:"106",Email:"f@example.invalid",Unsubscribed_Mode:null,Unsubscribed_Time:"2026-11-13"},
 {id:"107",Email:"g@example.invalid",Email_Opt_Out:true,Unsubscribed_Mode:null,Unsubscribed_Time:null}
 ],previous:[{Email_Destinatario:"a@example.invalid",Estado_do_Envio:"Aceito pelo Zoho"}]};
 const s=await setup([mailConfig,campaign]);await s.run("prepararEnvioMassa()");
 assert.deepEqual([...s.doc.querySelectorAll(".email-contact")].filter(c=>c.disabled).map(c=>c.value),["101","103","104","105","106","107"]);
 assert.deepEqual([...s.doc.querySelectorAll(".email-contact")].filter(c=>c.checked).map(c=>c.value),["102"]);
});
test("unavailable existing connection never enables sending",async()=>{
 const s=await setup([{status:"unavailable",message:"Conexao zoho_crm indisponivel"}]);await s.run("prepararEnvioMassa()");await s.run("enviarRascunhoSalvo()");
 assert.equal(s.calls.length,2);assert.match(s.doc.getElementById("emailStatus").textContent,/zoho_crm/);assert.equal(s.doc.getElementById("emailSendFinal").disabled,true);
});
test("incomplete or duplicate internal validation cannot send",async()=>{
 for(const recipients of [[mailPreviewResult.recipients[0]],[mailPreviewResult.recipients[0],mailPreviewResult.recipients[0]]]){
 const s=await setup([mailConfig,mailCampaign,{status:"success",recipients}]);await s.run("prepararEnvioMassa()");await s.run("enviarRascunhoSalvo()");
 assert.equal(s.calls.filter(c=>c.action==="mail_send").length,0);
 assert.match(s.doc.getElementById("emailStatus").textContent,/Nenhum envio iniciado/);
 }
});
test("accepted send with missing history receipt counts acceptance and stops batch",async()=>{
 const s=await setup([mailConfig,mailCampaign,mailPreviewResult,{status:"accepted",receipt_saved:false}]);await s.run("prepararEnvioMassa()");await s.run("enviarRascunhoSalvo()");
 assert.equal(s.calls.filter(c=>c.action==="mail_send").length,1);assert.match(s.doc.getElementById("emailStatus").textContent,/interrompido.*1 email/s);
});
test("missing saved draft, empty audience and missing sender do not start send",async()=>{
 for(const campaign of [{...mailCampaign,subject:""},{...mailCampaign,body:""},{...mailCampaign,members:[]}]){
 const s=await setup([mailConfig,campaign]);await s.run("prepararEnvioMassa()");await s.run("enviarRascunhoSalvo()");assert.equal(s.calls.filter(c=>c.action==="mail_send"||c.action==="mail_preview").length,0);
 }
 const s=await setup([{...mailConfig,senders:[]}]);await s.run("prepararEnvioMassa()");await s.run("enviarRascunhoSalvo()");assert.equal(s.calls.length,2);
});
test("server changed draft hash is rejected and remaining recipients are not sent",async()=>{
 const s=await setup([mailConfig,mailCampaign,mailPreviewResult,{status:"error",message:"O rascunho mudou. Tente novamente."}]);
 await s.run("prepararEnvioMassa()");await s.run("enviarRascunhoSalvo()");
 assert.equal(s.calls.filter(c=>c.action==="mail_send").length,1);
 assert.match(s.doc.getElementById("emailStatus").textContent,/rascunho mudou/);
});

test("native unsubscribe fields and unavailable eligibility block recipients before preview", async () => {
  const campaign={...mailCampaign,members:[...mailCampaign.members,
    {id:"105",Full_Name:"E",Email:"e@example.invalid",Unsubscribed_Mode:"Manual",Unsubscribed_Time:null},
    {id:"106",Full_Name:"F",Email:"f@example.invalid",Unsubscribed_Mode:null,Unsubscribed_Time:"2026-11-13T00:00:00-03:00"},
    {id:"107",Full_Name:"G",Email:"g@example.invalid"}
  ]};
  const s=await setup([mailConfig,campaign]); await s.run("prepararEnvioMassa()");
  assert.deepEqual([...s.doc.querySelectorAll(".email-contact")].filter(c=>c.disabled).map(c=>c.value),["105","106","107"]);
  assert.deepEqual([...s.doc.querySelectorAll(".email-contact")].filter(c=>c.checked).map(c=>c.value),["101","102"]);
});

test("native submission is counted without claiming API acceptance or delivery",async()=>{
 const s=await setup([mailConfig,mailCampaign,mailPreviewResult,submittedMail,submittedMail]);
 await s.run("prepararEnvioMassa()");await s.run("enviarRascunhoSalvo()");
 assert.equal(s.calls.filter(c=>c.action==="mail_send").length,2);
 assert.ok(s.calls.filter(c=>c.action==="mail_preview"||c.action==="mail_send").every(c=>c.transport==="native_sendmail"));
 assert.match(s.doc.getElementById("emailStatus").textContent,/2 email.*2 submetido.*não comprova entrega/s);
 assert.doesNotMatch(s.doc.getElementById("emailStatus").textContent,/aceito|entregue/i);
});
test("native submission with a lost receipt remains counted and stops the next recipient",async()=>{
 const s=await setup([mailConfig,mailCampaign,mailPreviewResult,{...submittedMail,receipt_saved:false}]);
 await s.run("prepararEnvioMassa()");await s.run("enviarRascunhoSalvo()");await s.run("enviarRascunhoSalvo()");
 assert.equal(s.calls.filter(c=>c.action==="mail_send").length,1);
 assert.match(s.doc.getElementById("emailStatus").textContent,/interrompido.*1 email.*1 submetido.*Não haverá reenvio automático/s);
});
test("unknown transport never counts a submission as confirmed",async()=>{
 const s=await setup([mailConfig,mailCampaign,mailPreviewResult,{status:"submitted",transport:"unknown",receipt_saved:true}]);
 await s.run("prepararEnvioMassa()");await s.run("enviarRascunhoSalvo()");
 assert.equal(s.calls.filter(c=>c.action==="mail_send").length,1);
 assert.match(s.doc.getElementById("emailStatus").textContent,/interrompido.*0 email/s);
});
test("native history and reconciled CRM history remain blocked against resend",async()=>{
 const s=await setup([mailConfig,{...mailCampaign,previous:[
 {Email_Destinatario:"a@example.invalid",Estado_do_Envio:"Submetido ao envio nativo"},
 {Email_Destinatario:"b@example.invalid",Estado_do_Envio:"Registrado como enviado no CRM"}
 ]}]);
 await s.run("prepararEnvioMassa()");await s.run("enviarRascunhoSalvo()");
 assert.equal(s.calls.filter(c=>c.action==="mail_send"||c.action==="mail_preview").length,0);
 assert.ok([...s.doc.querySelectorAll(".email-contact")].every(c=>c.disabled&&!c.checked));
});
