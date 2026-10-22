# FitStock — Criar Campanha no Zoho CRM

Widget externo do botão **Criar Campanha**. Carrega os contatos associados à oportunidade pela função Deluge `dispararcampanhawidget` e permite selecionar os destinatários antes de criar a campanha e enviar e-mails.

## Origem e histórico

Copiado de https://github.com/abiezerlima/campanha em 20/10/2026, preservando os nove commits originais. O último commit importado é `cbe754e30658dd8663df78ec2d32879d5db36de3`.

A tag `before-contacts-migration-2026-10-20` aponta para esse código original. As mudanças da FitStock estão nos commits posteriores. O remoto `upstream`, no clone de trabalho, mantém a referência ao repositório de origem.

## Hospedagem

GitHub Pages serve a raiz da branch `main` em:

https://fitstock.github.io/zoho-crm-campanha/index.html

O widget **Criar Campanha** do Zoho CRM deve usar essa URL externa. Não são necessárias chaves de API no HTML: a autenticação acontece pelo SDK incorporado do Zoho na sessão do usuário.

## Alterações

- Textos de carregamento e lista vazia referem-se aos Contacts associados à oportunidade, com instrução de usar **Assign**.
- Erros da função são exibidos sem deixar uma lista antiga de destinatários na tela.
- Nomes e e-mails são escapados ao renderizar HTML, inclusive no painel de diagnóstico.
- O contrato `empresas[].contatos[]` e o fluxo de criação/disparo permanecem compatíveis com a função Deluge.

## Verificação

```sh
npm ci
npm run check
```

O teste usa DOM e SDK simulados para conferir carregamento, seleção, caracteres especiais, lista vazia e erro. Não cria campanhas nem envia e-mails. A validação final dentro do CRM deve apenas abrir o widget e conferir os destinatários.

## Reversão

Para reverter apenas esta interface, restaure `index.html` da tag de referência em um novo commit e publique em `main`:

```sh
git restore --source=before-contacts-migration-2026-10-20 -- index.html
git add index.html
git commit -m "Reverte interface ao formato anterior"
git push origin main
```

Na reversão, valide a interface original no CRM. O teste atual exige os textos de Contacts/Assign da versão nova e deve ser atualizado ou revertido junto com a interface, se a reversão for mantida.

A URL anterior do widget era `https://abiezerlima.github.io/campanha/index.html`; restaurá-la no Zoho reverte a hospedagem. A escolha de destinatários fica na função Deluge: reverter somente HTML ou URL não restaura a busca por Possíveis Buyers. O backup dessa função foi preservado separadamente no repositório de administração da FitStock.


## Responsável na criação

O formulário pré-seleciona o usuário conectado ao Zoho CRM e permite escolher outro usuário ativo. O responsável é enviado em Owner; a função dedicada valida o usuário antes de gravar. Falha de leitura de usuários bloqueia a criação. Não muda o remetente do e-mail nem os responsáveis de registros existentes.

Reversão da interface: restaurar os arquivos da tag before-owner-selector-2026-10-21 em um novo commit. O backend mantém compatibilidade com formulários anteriores. Backup privado da função e procedimento completo preservados no projeto administrativo FitStock.
