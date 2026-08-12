# Meu Inova — GitHub + Cloudflare

O Meu Inova é um portal acadêmico, financeiro e administrativo executado em Cloudflare Workers, com código versionado no GitHub e dados transacionais no Cloudflare D1.

## Arquitetura

- **GitHub**: versionamento e origem dos deploys.
- **Cloudflare Workers**: API, autenticação, regras de negócio e entrega do frontend.
- **Cloudflare Static Assets**: HTML, CSS, JavaScript e identidade visual.
- **Cloudflare D1**: alunos, financeiro, acadêmico, provas, notas, auditoria e notificações.
- **Cloudflare Cron Trigger**: rotina diária de inadimplência.
- **Brevo**: e-mails transacionais de ativação, recuperação de senha e avisos.
- **Twilio**: integração opcional para SMS.
- **WhatsApp Cloud API**: integração opcional para WhatsApp.
- **Cloudflare R2**: armazenamento privado preparado para PDFs e arquivos acadêmicos; o binding será `MATERIALS` quando o bucket for criado.

O Portal do Aluno e o Portal Administrativo são separados. A senha do aluno não é exibida nem definida pela administração.

## Portal do Aluno

- Login por e-mail, CPF ou matrícula.
- Bloqueio quando o acesso é suspenso.
- Recuperação de senha por link enviado ao titular.
- Financeiro e cobranças.
- Requerimentos e perfil.
- Disciplinas matriculadas.
- Progresso por aula.
- Módulos e aulas.
- Videoaulas incorporadas a partir de URL, incluindo YouTube não listado.
- PDFs, documentos, apresentações e links de apoio.
- Avaliações online.
- Cronômetro de prova.
- Salvamento de respostas durante a tentativa.
- Envio automático ao término do tempo.
- Notas de questões objetivas calculadas no backend.

## Portal Administrativo

- Cadastro, ativação e suspensão de alunos.
- Mensalidade individual.
- Cobranças e pagamentos parciais ou totais.
- Inadimplência e notificações.
- Auditoria.
- Cadastro de cursos.
- Cadastro de disciplinas.
- Professor, período, código e carga horária por disciplina.
- Matrícula de alunos por disciplina.
- Criação de módulos e aulas.
- Cadastro de videoaulas e materiais.
- Criação de avaliações online.
- Questões objetivas e alternativas.
- Definição de gabarito somente no backend.
- Janela de disponibilidade, duração e limite de tentativas.
- Embaralhamento de questões e alternativas.
- Publicação da prova somente depois de existir questão cadastrada.
- Consulta de tentativas e resultados.

## Modelo acadêmico

A hierarquia principal é:

```text
Curso
└── Disciplina
    ├── Matrículas de alunos
    ├── Módulos
    │   └── Aulas
    │       ├── Videoaula
    │       └── Materiais
    └── Avaliações
        └── Questões
            └── Alternativas
```

O D1 cria automaticamente as tabelas acadêmicas na primeira chamada das rotas `/api/academic/*`.

Principais tabelas acadêmicas:

```text
academic_courses
academic_disciplines
academic_enrollments
academic_modules
academic_lessons
academic_materials
academic_lesson_progress
academic_exams
academic_questions
academic_question_options
academic_exam_attempts
academic_exam_answers
```

## Segurança das avaliações

O navegador do aluno não recebe o campo que identifica a alternativa correta. O gabarito permanece no D1 e a correção é realizada no Worker.

Cada tentativa registra, entre outros dados:

- aluno;
- prova;
- número da tentativa;
- início;
- prazo final;
- questões atribuídas;
- respostas;
- data de finalização;
- nota.

A API verifica a matrícula do aluno na disciplina antes de liberar conteúdo e prova.

## Materiais e PDFs

Existem duas modalidades de material:

1. **Material por URL** — já funcional. Pode apontar para PDF, documento, apresentação ou outro recurso externo.
2. **Arquivo privado no R2** — backend preparado, mas depende da criação de um bucket Cloudflare R2 e do binding `MATERIALS`.

Não armazene PDFs grandes no GitHub ou no D1. O desenho definitivo utiliza R2 para arquivos e D1 apenas para metadados e permissões.

Para videoaulas, a fase inicial utiliza URL de vídeo, preferencialmente YouTube não listado. Isso evita usar armazenamento do sistema com arquivos de vídeo pesados enquanto o produto está em homologação.

## E-mail com Brevo

Secrets/variáveis usados no Worker:

```text
BREVO_API_KEY          # Secret
BREVO_SENDER_EMAIL     # variável
BREVO_SENDER_NAME      # variável
```

A chave não deve ser colocada no GitHub.

O e-mail é usado para:

- ativação de aluno;
- recuperação de senha;
- notificações de inadimplência quando o canal está habilitado.

## Secrets obrigatórios

No Cloudflare Worker:

```text
SESSION_SECRET
SETUP_TOKEN
BREVO_API_KEY
```

`SESSION_SECRET` assina as sessões. `SETUP_TOKEN` é utilizado no fluxo inicial de instalação. `BREVO_API_KEY` autentica os e-mails transacionais.

## D1

Binding:

```text
DB
```

Banco atual:

```text
meu-inova-db
```

As tabelas financeiras/administrativas principais são:

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

## Publicação

O repositório está conectado ao Cloudflare. A branch de produção é `main` e o comando de deploy é:

```bash
npx wrangler deploy
```

Cada commit na `main` inicia um novo build/deploy pelo Cloudflare.

## URLs

```text
/                escolha do portal
/aluno.html      Portal do Aluno
/admin.html      Portal Administrativo
/reset.html      redefinição de senha
/setup.html      instalação inicial, bloqueada após o primeiro administrador
```

## Notificações de inadimplência

A rotina diária:

1. atualiza o status das cobranças;
2. identifica saldo vencido;
3. aplica a carência configurada;
4. respeita o intervalo de repetição;
5. envia ou simula os canais habilitados;
6. grava o resultado no histórico.

O cron atualmente é executado uma vez por dia e o cálculo acadêmico/financeiro usa `America/Cuiaba` como timezone da aplicação.

## Próximas evoluções planejadas

- Criar e vincular o bucket R2 `meu-inova-materiais` como `MATERIALS`.
- Ativar upload direto de PDFs pelo painel administrativo.
- Criar Portal do Professor com acesso apenas às próprias disciplinas.
- Adicionar questões discursivas e correção manual.
- Acrescentar banco de questões reutilizável entre avaliações.
- Histórico e diário acadêmico integralmente alimentados pelos dados reais do AVA.
- Frequência baseada em aulas/atividades conforme regra institucional.
- Relatórios acadêmicos e exportações.

## Segurança e operação real

Antes de uso definitivo com dados acadêmicos reais:

- manter todos os tokens somente em Cloudflare Secrets;
- configurar domínio próprio e HTTPS;
- revisar perfis de acesso e trilha de auditoria;
- revisar política de backups do D1/R2;
- revisar LGPD, base legal, política de privacidade, retenção e descarte;
- substituir qualquer configuração de homologação por parâmetros de produção;
- realizar testes de autorização, recuperação de senha, provas simultâneas e indisponibilidade de provedores externos.
