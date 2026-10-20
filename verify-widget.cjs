const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { JSDOM } = require("jsdom");

const html = fs.readFileSync(`${__dirname}/index.html`, "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

async function load(output) {
  const dom = new JSDOM(html);
  let calls = 0;
  const context = vm.createContext({
    document: dom.window.document,
    setTimeout() {},
    ZOHO: {
      embeddedApp: { on() {}, init: () => Promise.resolve() },
      CRM: {
        INTERACTOR: { getRecord: () => Promise.resolve({}) },
        FUNCTIONS: {
          execute: async (name, request) => {
            assert.equal(name, "dispararcampanhawidget");
            assert.deepEqual(JSON.parse(request.arguments), {
              oppId: "synthetic-opportunity",
            });
            calls++;
            return { details: { output: JSON.stringify(output) } };
          },
        },
      },
    },
  });
  vm.runInContext(script, context);
  await vm.runInContext(
    'currentOppId = "synthetic-opportunity"; carregarDados()',
    context,
  );
  assert.equal(calls, 1);
  return { document: dom.window.document, context };
}

(async () => {
  const { document, context } = await load({
    status: "success",
    produto_nome: "Produto",
    empresas: [
      {
        id: "company-1",
        nome: 'Empresa "A" & Filhos',
        contatos: [
          {
            id: "contact-1",
            nome: 'Maria "Compras" <teste>',
            email: "maria@example.invalid",
          },
        ],
      },
    ],
  });
  const checks = document.querySelectorAll(".chk-membro");
  assert.equal(checks.length, 1);
  assert.equal(checks[0].getAttribute("data-contato-id"), "contact-1");
  assert.equal(
    checks[0].getAttribute("data-contato-nome"),
    'Maria "Compras" <teste>',
  );
  assert.equal(
    checks[0].getAttribute("data-empresa-nome"),
    'Empresa "A" & Filhos',
  );
  assert.equal(document.querySelector("teste"), null);
  vm.runInContext("marcarTodos(false)", context);
  assert.equal(checks[0].checked, false);
  vm.runInContext("marcarTodos(true)", context);
  assert.equal(checks[0].checked, true);

  const empty = await load({ status: "success", empresas: [] });
  assert.equal(empty.document.querySelectorAll(".chk-membro").length, 0);
  assert.match(
    empty.document.getElementById("membrosContainer").textContent,
    /Assign/,
  );

  const error = await load({
    status: "error",
    message: "Falha ao consultar contatos.",
  });
  assert.equal(error.document.querySelectorAll(".chk-membro").length, 0);
  assert.equal(
    error.document.getElementById("status").textContent,
    "Falha ao consultar contatos.",
  );
  assert.equal(
    error.document.getElementById("membrosContainer").textContent,
    "",
  );
  console.info(
    "Widget: contatos, selecao, nomes especiais, lista vazia e erro verificados. Nenhum disparo executado.",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
