# Criar campanha e enviar rascunho salvo — FitStock

Atualizado em 13/11/2026.

1. **Criar campanha** salva assunto, mensagem e contatos vinculados, sem enviar emails.
2. **Enviar emails em massa** permite escolher a campanha, o remetente autorizado e os destinatários.
3. **Enviar rascunho agora** dispara o rascunho já salvo, sem outro editor, prévia visível ou caixa de confirmação. O próprio clique é a autorização de envio.

Para mudar o conteúdo, salve os campos Assunto Revisao e Mensagem Revisao na campanha antes de enviar. O servidor relê esses campos na validação e em cada disparo; alterações não salvas no formulário não são usadas. As variáveis {{Nome_Contato}} e {{Nome_Empresa}} são personalizadas por destinatário. Se o conteúdo mudar durante o lote, a validação bloqueia o envio da próxima mensagem.

O acompanhamento continua em **Envios de Campanha** na oportunidade. Permanecem os bloqueios de descadastro, email ausente, destinatário fora da campanha e endereço já registrado. Respostas incertas interrompem o lote, sem reenvio automático. Aceito pelo Zoho não comprova entrega ou abertura. Até 200 membros, com bloqueio de leituras incompletas; quotas da conta se aplicam.

A conexão de envio é a existente **zoho_crm**, sem alteração de escopos. Na última prova real ela aparecia conectada mas falhou nas consultas de remetentes e organização. O envio permanece bloqueado enquanto essa execução não funcionar. Nenhum email real foi enviado na validação.

`npm run check` executa 22 testes do widget com SDK simulado: criação, envio do rascunho salvo, ausência de segundo editor/prévia, duplo clique, descadastro, alterações concorrentes, resposta perdida e falha no recibo. A função privada mantém compatibilidade com as ações existentes e acrescenta o parâmetro `use_saved_draft: true`.

## Histórico da criação para revisão

# Criar campanha para revisão — FitStock

Atualizado em 11/11/2026.

## Fluxo atual

1. Na oportunidade de mercado, associe os contatos desejados e abra **Criar Campanha**.
2. Revise responsável, tipo, contatos selecionados, assunto e mensagem.
3. Clique em **Criar campanha para revisão**. A campanha é gravada em **Planejamento**, com os contatos vinculados. Esta etapa não envia emails.
4. Se houver vínculos pendentes, use **Concluir vínculos nesta campanha** no mesmo formulário. A mesma chave retoma a preparação e evita campanha duplicada.
5. Abra a campanha e revise **Assunto Revisao**, **Mensagem Revisao** e a lista **Contacts**. Selecione os contatos e use o botão nativo **Send Email** somente quando a operação decidir preparar o envio. O envio final é manual.

Os campos de revisão são rascunhos de conteúdo; não são um email agendado nem um template carregado automaticamente no compositor. Na etapa manual, revise a personalização e configure os campos de mesclagem do Zoho; os marcadores `{{Nome_Contato}}` e `{{Nome_Empresa}}` do rascunho não devem ser enviados literalmente.

## Backend

Função existente `dispararcampanhawidget`, ID `4606955000026521051`. O nome foi conservado para manter as referências do widget. O código V11 não contém `sendmail`, endpoint de envio ou rotina automática de disparo. Autenticação e botão existentes foram preservados.

- Lê apenas contatos associados à oportunidade, com email, e relê a associação ao confirmar.
- Grava `Campaign_Name`, `Type`, `Owner`, `Status: Planejamento`, `Assunto_Revisao`, `Mensagem_Revisao`, `Description` e a chave única `Chave_Preparacao_Campanha`.
- A criação usa `trigger: []` e a autorização nativa que já era usada pela função; nenhum escopo foi ampliado.
- Vincula contatos por `zoho.crm.updateRelatedRecord` e verifica a lista relacionada após gravar.
- Usa no máximo 50 novos vínculos por passagem. Volumes maiores ou falhas parciais podem exigir continuar a mesma tentativa; não declara sucesso antes da confirmação completa.
- A chave tem o formato `OM_<opportunity_id>_<request_id>`. Um novo formulário representa nova intenção; retente no mesmo formulário se a resposta se perder.
- O assunto aceita até 255 caracteres e a mensagem até 32.000. Os limites de leitura do caminho existente e os tempos de execução do Zoho continuam se aplicando.

## Validação

`npm run check` executa a validação do HTML, os testes de responsável e os testes de criação, seleção, perda de resposta, repetição, falha parcial e clique duplo. Os testes usam SDK simulado e não enviam emails.

A prova pela interface do CRM criou uma campanha fictícia, gravou o rascunho e confirmou dois membros com `Sent_On: null`. Uma retomada concluiu o segundo vínculo na mesma campanha. Os registros usados na prova são identificados como testes e devem ser removidos após o registro das evidências.

## Histórico anterior à alteração de 11/11/2026

As notas abaixo descrevem entregas anteriores; quando mencionam criação com disparo, esse comportamento foi substituído pelo fluxo de revisão acima.

---

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

