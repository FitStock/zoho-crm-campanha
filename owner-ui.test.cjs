const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { JSDOM } = require("jsdom");
const users = [
  { id: "9001", full_name: "Quem está criando", status: "active" },
  { id: "9002", full_name: "Outra pessoa", status: "active" },
  { id: "9003", full_name: "Inativo", status: "inactive" },
];
async function ui(folder, custom = {}) {
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  const dom = new JSDOM(html);
  const calls = [];
  const pages = [];
  const sdk = {
    CONFIG: { getCurrentUser: async () => users[0] },
    API: {
      getAllUsers: async (q) => {
        pages.push(q);
        return { users, info: { more_records: false } };
      },
      ...custom,
    },
    FUNCTIONS: {
      execute: async (_name, req) => {
        const args = JSON.parse(req.arguments);
        calls.push(args);
        return {
          details: {
            output: JSON.stringify(
              args.action
                ? {
                    status: "success",
                    deal_id: "700",
                    campanha_id: "701",
                    total_disparados: 0,
                  }
                : {
                    status: "success",
                    empresas: [
                      {
                        id: "200",
                        nome: "Parceira",
                        contatos: [
                          {
                            id: "201",
                            nome: "Contato",
                            email: "test@example.invalid",
                          },
                        ],
                      },
                    ],
                    dados_oportunidade: {},
                    tipo_oportunidade: "Venda",
                    produto_nome: "Produto",
                    produto_id: "9",
                    empresa_origem_id: "100",
                    contato_origem_id: "101",
                  },
            ),
          },
        };
      },
    },
    UI: { Record: { open() {} } },
  };
  const ctx = vm.createContext({
    document: dom.window.document,
    setTimeout() {},
    alert() {},
    ZOHO: { embeddedApp: { on() {}, init: () => Promise.resolve() }, CRM: sdk },
  });
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], ctx);
  await vm.runInContext("currentOppId='1'; carregarDados()", ctx);
  return {
    dom,
    doc: dom.window.document,
    calls,
    pages,
    sdk,
    run: (s) => vm.runInContext(s, ctx),
    submit: () =>
      vm.runInContext(
        folder === "negociacao" ? "confirmarCriacao()" : "executarCampanha()",
        ctx,
      ),
  };
}
for (const folder of ["campanha"]) {
  test(`${folder}: usuário conectado padrão e troca grava Owner no payload`, async () => {
    const s = await ui(folder);
    const select = s.doc.getElementById("responsavelSelect");
    assert.equal(select.value, "9001");
    assert.equal(select.disabled, false);
    assert.equal(select.options.length, 2);
    assert.match(select.selectedOptions[0].textContent, /você/);
    assert.equal(s.pages[0].Type, "ActiveUsers");
    select.value = "9002";
    if (folder === "negociacao") {
      s.doc.getElementById("empresaSelect").value = "200";
      s.run("aoSelecionarEmpresa()");
    }
    await s.submit();
    assert.equal(s.calls[1].payload.Owner.id, "9002");
    s.dom.window.close();
  });
  test(`${folder}: falha da lista bloqueia criação e não escolhe outro usuário silenciosamente`, async () => {
    const s = await ui(folder, {
      getAllUsers: async () => {
        throw Error("forbidden");
      },
    });
    assert.equal(s.doc.getElementById("responsavelSelect").disabled, true);
    if (folder === "negociacao") {
      s.doc.getElementById("empresaSelect").value = "200";
      s.run("aoSelecionarEmpresa()");
    }
    await s.submit();
    assert.equal(s.calls.length, 1);
    s.dom.window.close();
  });
  test(`${folder}: paginação não omite responsáveis e pagina incompleta bloqueia`, async () => {
    let calls = 0;
    const s = await ui(folder, {
      getAllUsers: async () =>
        ++calls === 1
          ? { users: [users[0]], info: { more_records: true } }
          : { users: [users[1]], info: { more_records: false } },
    });
    assert.equal(calls, 2);
    assert.equal(s.doc.getElementById("responsavelSelect").options.length, 2);
    s.dom.window.close();
    const fail = await ui(folder, {
      getAllUsers: async () => ({
        users: [users[0]],
        info: { more_records: true },
      }),
    });
    assert.equal(fail.doc.getElementById("responsavelSelect").disabled, true);
    fail.dom.window.close();
  });
  test(`${folder}: valor adulterado no select bloqueia a criação`, async () => {
    const s = await ui(folder);
    const option = s.doc.createElement("option");
    option.value = "9999";
    s.doc.getElementById("responsavelSelect").append(option);
    s.doc.getElementById("responsavelSelect").value = "9999";
    if (folder === "negociacao") {
      s.doc.getElementById("empresaSelect").value = "200";
      s.run("aoSelecionarEmpresa()");
    }
    await s.submit();
    assert.equal(s.calls.length, 1);
    s.dom.window.close();
  });
}
