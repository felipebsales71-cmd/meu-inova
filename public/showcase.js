/* Meu Inova - experiência executiva para apresentação e uso diário. */
(() => {
  const previousPageContent = pageContent;
  const previousRenderApp = renderApp;
  const sum = (items, fn) => (items || []).reduce((t, x) => t + Number(fn(x) || 0), 0);
  const firstName = () => String(state.user?.name || 'Usuário').trim().split(/\s+/)[0];

  meta['admin-dashboard'] = ['Visão Executiva','Indicadores acadêmicos, financeiros e operacionais da Inova Cursos Técnicos.'];
  meta.dashboard = ['Visão Geral','Seu ambiente acadêmico, avaliações, materiais e situação financeira em um só lugar.'];

  function hasDashboardAccess() {
    return !Array.isArray(state.user?.permissions) || state.user.permissions.includes('dashboard.view');
  }

  function adminDashboardShowcase() {
    const students = state.students || [];
    const payments = state.payments || [];
    const ac = state.academic?.summary || {};
    const staff = state.staff || [];
    const faculty = state.faculty || [];
    const due = sum(payments, p => p.amountDue);
    const paid = sum(payments, p => p.amountPaid);
    const open = Math.max(0, due - paid);
    const overdue = payments.filter(p => p.status === 'Atrasado').length;
    const activeStudents = students.filter(s => s.access).length;
    const receiveRate = due > 0 ? Math.round((paid / due) * 100) : 0;
    const role = state.user?.staffRole || 'Administração';

    return `<div class="showcase-hero card">
      <div class="showcase-hero-copy">
        <span class="showcase-eyebrow">GESTÃO INTEGRADA · ${esc(String(role).toUpperCase())}</span>
        <h2>Olá, ${esc(firstName())}. Esta é a visão 360° da Inova Cursos Técnicos.</h2>
        <p>Alunos, acadêmico, professores, ambiente virtual, avaliações e financeiro conectados em uma única operação.</p>
      </div>
      <div class="showcase-hero-actions">
        <button class="secondary-btn" onclick="go('alunos')">Alunos e acessos</button>
        <button class="primary-btn" onclick="go('admin-academico')">Abrir gestão acadêmica</button>
      </div>
    </div>

    <div class="grid grid-4 executive-kpis" style="margin-top:16px">
      <div class="card stat-card"><div class="stat-icon">AL</div><div><div class="label">Alunos cadastrados</div><div class="value">${students.length}</div><div class="sub">${activeStudents} com acesso ativo</div></div></div>
      <div class="card stat-card green"><div class="stat-icon">RX</div><div><div class="label">Recebimento</div><div class="value">${receiveRate}%</div><div class="sub">${money(paid)} recebido</div></div></div>
      <div class="card stat-card ${overdue ? 'red' : 'green'}"><div class="stat-icon">FI</div><div><div class="label">Em aberto</div><div class="value">${money(open)}</div><div class="sub">${overdue} cobrança(s) atrasada(s)</div></div></div>
      <div class="card stat-card orange"><div class="stat-icon">AVA</div><div><div class="label">Ambiente virtual</div><div class="value">${Number(ac.disciplines || 0)}</div><div class="sub">${Number(ac.lessons || 0)} aula(s) cadastrada(s)</div></div></div>
    </div>

    <div class="showcase-section-title"><div><h3>Jornada integrada do aluno</h3><p>Do cadastro à avaliação e ao acompanhamento financeiro.</p></div></div>
    <div class="grid grid-3">
      <div class="card span-2 journey-card">
        <div class="journey-flow">
          <div class="journey-step"><span>01</span><b>Cadastro</b><small>Aluno, matrícula e acesso individual.</small></div>
          <div class="journey-step"><span>02</span><b>Grade</b><small>Curso, disciplinas, professor e carga horária.</small></div>
          <div class="journey-step"><span>03</span><b>AVA</b><small>Videoaulas, materiais e progresso.</small></div>
          <div class="journey-step"><span>04</span><b>Avaliação</b><small>Provas online, tempo e tentativas.</small></div>
          <div class="journey-step"><span>05</span><b>Resultados</b><small>Correção objetiva e histórico de notas.</small></div>
          <div class="journey-step"><span>06</span><b>Financeiro</b><small>Mensalidades, pagamentos e inadimplência.</small></div>
        </div>
      </div>
      <div class="card"><div class="card-head"><div><h3>Operação atual</h3><p class="small muted">Dados do ambiente em uso.</p></div></div>
        <div class="showcase-side-list">
          <div class="showcase-side-line"><span>Cursos</span><b>${Number(ac.courses || 0)}</b></div>
          <div class="showcase-side-line"><span>Disciplinas</span><b>${Number(ac.disciplines || 0)}</b></div>
          <div class="showcase-side-line"><span>Professores</span><b>${faculty.length}</b></div>
          <div class="showcase-side-line"><span>Provas publicadas</span><b>${Number(ac.publishedExams || 0)}</b></div>
          <div class="showcase-side-line"><span>Acessos de gestão</span><b>${staff.length}</b></div>
        </div>
      </div>
    </div>

    <div class="showcase-section-title"><div><h3>Módulos do Meu Inova</h3><p>Uma visão clara do que a direção controla no sistema.</p></div></div>
    <div class="module-showcase">
      <button class="module-tile" onclick="go('alunos')"><span class="module-icon">AL</span><h4>Alunos e Acessos</h4><p>Cadastro, matrícula, ativação, suspensão e recuperação segura de senha.</p></button>
      <button class="module-tile" onclick="go('admin-academico')"><span class="module-icon">AC</span><h4>Gestão Acadêmica</h4><p>Cursos, disciplinas, módulos, aulas, materiais e matrículas acadêmicas.</p></button>
      <button class="module-tile" onclick="go('professores')"><span class="module-icon">PR</span><h4>Professores</h4><p>Corpo docente, vínculos por disciplina e importação da grade curricular.</p></button>
      <button class="module-tile" onclick="go('admin-avaliacoes')"><span class="module-icon">AV</span><h4>Avaliações Online</h4><p>Questões, provas, cronômetro, tentativas e correção automática.</p></button>
      <button class="module-tile" onclick="go('admin-financeiro')"><span class="module-icon">FI</span><h4>Financeiro</h4><p>Mensalidades, pagamentos, saldo em aberto e acompanhamento de inadimplência.</p></button>
      <button class="module-tile" onclick="go('equipe')"><span class="module-icon">EQ</span><h4>Equipe e Permissões</h4><p>Credenciais individuais, perfis de acesso e permissões por função.</p></button>
    </div>`;
  }

  pageContent = function () {
    if (portal === 'admin' && state.page === 'admin-dashboard' && hasDashboardAccess()) return adminDashboardShowcase();
    return previousPageContent();
  };

  renderApp = function () {
    previousRenderApp();
    const title = document.querySelector('.top-title');
    if (title) title.textContent = portal === 'admin' ? 'Inova Cursos Técnicos · Meu Inova' : 'Meu Inova · Portal do Aluno';
    const chip = document.querySelector('.portal-chip');
    if (chip) chip.textContent = portal === 'admin' ? 'DIREÇÃO E GESTÃO' : 'PORTAL DO ALUNO';
  };
})();
