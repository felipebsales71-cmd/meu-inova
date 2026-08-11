# Meu Inova - GitHub + Cloudflare

Versão do Meu Inova preparada para funcionar sem VPS, Hostinger ou Supabase.

A arquitetura desta versão é:

- GitHub: repositório do código.
- Cloudflare Workers: frontend e API no mesmo endereço.
- Cloudflare Static Assets: HTML, CSS, JavaScript e logo.
- Cloudflare D1: banco SQL de alunos, mensalidades, pagamentos, requerimentos, auditoria e notificações.
- Cloudflare Cron Trigger: verificação diária de mensalidades vencidas.
- Resend: opcional para e-mail real.
- Twilio: opcional para SMS real.
- WhatsApp Cloud API: opcional para WhatsApp real.

O sistema inicia com notificações em modo de simulação. Assim, é possível publicar e testar o financeiro antes de contratar ou configurar provedores de mensagens.

## O que já está implementado

### Portal do Aluno

- Acesso separado do administrativo.
- Login por e-mail, CPF ou matrícula.
- Bloqueio de login quando a faculdade suspende o acesso.
- Consulta financeira.
- Requerimentos.
- Perfil.
- Alteração da própria senha.
- Recuperação de senha por link temporário enviado ao e-mail do titular, quando o provedor de e-mail estiver configurado.

### Portal Administrativo

- Login administrativo independente.
- Cadastro de aluno.
- Ativação e suspensão do acesso de aluno.
- Valor individual de mensalidade.
- Geração de cobrança.
- Registro de pagamento total ou parcial.
- Controle de inadimplência.
- Configuração de destinatários da faculdade.
- Canais de e-mail, SMS e WhatsApp.
- Histórico de notificações.
- Auditoria de operações.

O administrador não possui rota para visualizar ou definir a senha de um aluno. Ao cadastrar um aluno real, o sistema gera um token de ativação e envia o link diretamente ao e-mail do aluno quando o serviço de e-mail estiver configurado.

## Publicar sem instalar nada no computador

### 1. Criar um repositório no GitHub

Crie um repositório, por exemplo `meu-inova`, e envie todo o conteúdo desta pasta para a raiz do repositório.

A raiz deve conter:

```text
migrations/
public/
src/
.dev.vars.example
.gitignore
package.json
README.md
wrangler.jsonc
```

Não coloque senhas ou tokens dentro do GitHub.

### 2. Conectar o GitHub ao Cloudflare

No painel Cloudflare:

1. Abra `Workers & Pages`.
2. Escolha a opção para importar/conectar um repositório Git.
3. Autorize o GitHub.
4. Selecione o repositório `meu-inova`.
5. Use a branch `main`.
6. Mantenha o projeto como Worker, não como site estático isolado.
7. Use como comando de deploy:

```text
npx wrangler deploy
```

O arquivo `wrangler.jsonc` já informa ao Cloudflare que o projeto possui frontend, API, D1 e tarefa agendada.

O binding D1 está definido somente como `DB`. Em contas compatíveis com o provisionamento automático do Wrangler, o Cloudflare cria o recurso D1 no primeiro deploy. Se a sua conta pedir seleção manual, crie um D1 no painel e vincule-o ao Worker com o nome exato `DB`.

### 3. Criar os dois Secrets obrigatórios

Depois que o Worker aparecer no painel, abra as configurações de variáveis/secrets do projeto e crie:

```text
SESSION_SECRET
SETUP_TOKEN
```

Use valores longos e aleatórios. Exemplo de formato:

```text
SESSION_SECRET = uma-chave-aleatoria-com-pelo-menos-40-caracteres
SETUP_TOKEN = outra-chave-diferente-para-a-instalacao-inicial
```

Não use esses exemplos literalmente.

`SESSION_SECRET` assina as sessões de aluno e administrador.

`SETUP_TOKEN` protege a criação do primeiro administrador.

### 4. Fazer a instalação inicial

Depois do deploy, o Cloudflare mostrará um endereço parecido com:

```text
https://meu-inova.<sua-conta>.workers.dev
```

Abra:

```text
https://meu-inova.<sua-conta>.workers.dev/setup.html
```

Informe:

- a chave `SETUP_TOKEN`;
- nome do primeiro administrador;
- e-mail do administrador;
- senha administrativa.

Opcionalmente, a tela permite criar um aluno de teste. Essa opção existe apenas para homologação. Em alunos reais, a senha é definida pelo próprio aluno pelo fluxo de ativação.

A primeira chamada da API cria automaticamente as tabelas necessárias dentro do D1. Depois que o primeiro administrador é criado, a instalação inicial fica bloqueada.

### 5. Entrar no sistema

Página inicial:

```text
/
```

Portal do aluno:

```text
/aluno.html
```

Portal administrativo:

```text
/admin.html
```

## E-mail real e recuperação de senha

Para enviar links de ativação e recuperação de senha, configure no Cloudflare:

Secret:

```text
RESEND_API_KEY
```

Variável:

```text
MAIL_FROM
```

O remetente precisa ser aceito pelo provedor de e-mail escolhido.

Sem `RESEND_API_KEY`, o sistema continua funcionando, mas não afirma que o link foi efetivamente entregue. O token de senha não é exibido ao administrador.

## SMS real

Para ativar SMS via Twilio, crie os secrets:

```text
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_SMS_FROM
```

Depois, no Portal Administrativo, abra Notificações e habilite SMS.

## WhatsApp real

Para ativar WhatsApp Cloud API, configure:

```text
WHATSAPP_ACCESS_TOKEN
WHATSAPP_PHONE_NUMBER_ID
WHATSAPP_GRAPH_VERSION
WHATSAPP_TEMPLATE_NAME
WHATSAPP_TEMPLATE_LANG
```

O template configurado no provedor precisa ser compatível com o corpo enviado pelo sistema.

Depois, no Portal Administrativo, habilite WhatsApp e desative o modo de simulação somente depois de testar as credenciais.

## Verificação automática de inadimplência

O `wrangler.jsonc` contém:

```json
"triggers": {
  "crons": ["0 12 * * *"]
}
```

Isso executa a verificação uma vez por dia, às 12:00 UTC. O sistema usa `America/Cuiaba` para calcular vencimento e dias de atraso.

Também existe o botão de verificação manual dentro do Portal Administrativo.

A rotina:

1. atualiza o status das cobranças;
2. encontra cobranças vencidas com saldo restante;
3. respeita a quantidade de dias após o vencimento definida pelo administrador;
4. respeita o intervalo de repetição;
5. envia ou simula e-mail, SMS e WhatsApp;
6. grava o resultado em `notification_logs`.

## Banco de dados

As tabelas são criadas pelo próprio Worker na primeira chamada de API. O arquivo `migrations/0001_schema.sql` também foi mantido no repositório como referência e para futuras migrações controladas.

Principais tabelas:

```text
admins
students
payments
student_requests
notification_settings
notification_logs
reset_tokens
audit_log
```

## Segurança

Para uso com alunos reais:

- não publique tokens em GitHub;
- mantenha o repositório privado enquanto estiver em desenvolvimento;
- use secrets no Cloudflare;
- mantenha o modo de simulação de mensagens ativo até configurar os provedores;
- não use conta de aluno de teste como conta real;
- use senhas administrativas longas;
- revise os logs de auditoria;
- configure domínio próprio antes da operação definitiva;
- revise LGPD, política de privacidade, retenção de dados e perfis de acesso antes de inserir dados acadêmicos reais.

## Desenvolvimento local opcional

Se um dia quiser rodar localmente:

```bash
npm install
cp .dev.vars.example .dev.vars
npm run dev
```

Mas isso não é necessário para publicar pelo fluxo GitHub + Cloudflare.
