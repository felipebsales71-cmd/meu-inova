/* Meu Inova - experiência executiva para apresentação e uso diário. */
(() => {
  const previousPageContent = pageContent;
  const previousRenderApp = renderApp;
  const sum = (items, fn) => (items || []).reduce((t, x) => t + Number(fn(x) || 0), 0);
  const firstName = () => String(state.user?.name || 'Usuário').trim().split(/\s+/)[0];

  meta['admin-dashboard'] = ['Visão Executiva','Indicadores acadêmicos, financeiros e operacionais da Inova Cursos Técnicos.'];
  meta['admin-relatorios'] = ['Relatórios Gerenciais','Indicadores calculados a partir dos dados reais cadastrados no Meu Inova.'];
  meta.dashboard = ['Visão Geral','Seu ambiente acadêmico, avaliações, materiais e situação financeira em um só lugar.'];
  meta.notas = ['Notas e Resultados','Resultados das avaliações realizadas no Meu Inova.'];

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

  function realAdminReports() {
    const students = state.students || [];
    const payments = state.payments || [];
    const ac = state.academic?.summary || {};
    const due = sum(payments, p => p.amountDue);
    const paid = sum(payments, p => p.amountPaid);
    const open = Math.max(0, due - paid);
    const rate = due > 0 ? Math.round((paid / due) * 100) : 0;
    const active = students.filter(s => s.access).length;
    const suspended = students.length - active;
    const statuses = ['Pago','Pendente','Atrasado','Parcial'].map(status => {
      const rows = payments.filter(p => p.status === status);
      return {status,count:rows.length,due:sum(rows,p=>p.amountDue),paid:sum(rows,p=>p.amountPaid)};
    }).filter(x => x.count > 0);

    return `<div class="grid grid-4">
      <div class="card stat-card"><div class="stat-icon">CO</div><div><div class="label">Total cobrado</div><div class="value">${money(due)}</div><div class="sub">${payments.length} cobrança(s)</div></div></div>
      <div class="card stat-card green"><div class="stat-icon">RE</div><div><div class="label">Total recebido</div><div class="value">${money(paid)}</div><div class="sub">${rate}% de recebimento</div></div></div>
      <div class="card stat-card orange"><div class="stat-icon">AB</div><div><div class="label">Saldo em aberto</div><div class="value">${money(open)}</div><div class="sub">Carteira financeira atual</div></div></div>
      <div class="card stat-card"><div class="stat-icon">AL</div><div><div class="label">Alunos ativos</div><div class="value">${active}</div><div class="sub">${suspended} suspenso(s)</div></div></div>
    </div>
    <div class="grid grid-3" style="margin-top:16px">
      <div class="card span-2"><div class="card-head"><div><h3>Carteira financeira por situação</h3><p class="small muted">Resumo calculado das cobranças cadastradas.</p></div></div>
        ${statuses.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Situação</th><th>Cobranças</th><th>Valor cobrado</th><th>Recebido</th><th>Saldo</th></tr></thead><tbody>${statuses.map(x=>`<tr><td>${badge(x.status)}</td><td>${x.count}</td><td>${money(x.due)}</td><td>${money(x.paid)}</td><td><b>${money(Math.max(0,x.due-x.paid))}</b></td></tr>`).join('')}</tbody></table></div>` : '<div class="academic-empty">Os indicadores financeiros aparecerão assim que houver cobranças cadastradas.</div>'}
      </div>
      <div class="card"><div class="card-head"><div><h3>Indicadores acadêmicos</h3><p class="small muted">Estrutura atualmente cadastrada.</p></div></div><div class="showcase-side-list"><div class="showcase-side-line"><span>Cursos</span><b>${Number(ac.courses||0)}</b></div><div class="showcase-side-line"><span>Disciplinas</span><b>${Number(ac.disciplines||0)}</b></div><div class="showcase-side-line"><span>Aulas</span><b>${Number(ac.lessons||0)}</b></div><div class="showcase-side-line"><span>Matrículas acadêmicas</span><b>${Number(ac.enrollments||0)}</b></div><div class="showcase-side-line"><span>Provas publicadas</span><b>${Number(ac.publishedExams||0)}</b></div></div></div>
    </div>`;
  }

  function realStudentGrades() {
    const grades = state.academic?.grades || [];
    if (!grades.length) return `<div class="card"><div class="card-head"><div><h3>Notas e resultados</h3><p class="small muted">Os resultados serão registrados aqui após a realização das avaliações online.</p></div><button class="secondary-btn" onclick="go('avaliacoes')">Ver avaliações</button></div><div class="academic-empty">Você ainda não possui avaliações concluídas com nota registrada.</div></div>`;
    return `<div class="card"><div class="card-head"><div><h3>Resultados das avaliações</h3><p class="small muted">Notas calculadas a partir das avaliações realizadas no Meu Inova.</p></div></div><div class="table-wrap"><table class="table"><thead><tr><th>Disciplina</th><th>Avaliação</th><th>Nota</th><th>Aproveitamento</th><th>Realizada em</th></tr></thead><tbody>${grades.map(g=>`<tr><td><b>${esc(g.disciplineName)}</b></td><td>${esc(g.examTitle)}</td><td><b>${Number(g.score).toFixed(1)} / ${Number(g.maxScore).toFixed(1)}</b></td><td>${g.percentage}%</td><td>${new Date(g.submittedAt).toLocaleString('pt-BR')}</td></tr>`).join('')}</tbody></table></div></div>`;
  }

  function cleanEmptyMenuSections() {
    document.querySelectorAll('.menu-section').forEach(section => {
      let node = section.nextElementSibling;
      let hasItem = false;
      while (node && !node.classList.contains('menu-section') && !node.classList.contains('sidebar-footer')) {
        if (node.classList.contains('nav-item')) { hasItem = true; break; }
        node = node.nextElementSibling;
      }
      if (!hasItem) section.remove();
    });
  }

  function hideUnfinishedNavigation() {
    const hidden = portal === 'admin'
      ? ['admin-comunicados']
      : ['historico','atendimento','documentos','certidoes','atividades','comunicados','carteira'];
    hidden.forEach(id => document.querySelector(`[data-page="${id}"]`)?.remove());
    cleanEmptyMenuSections();
  }

  pageContent = function () {
    if (portal === 'admin' && state.page === 'admin-dashboard' && hasDashboardAccess()) return adminDashboardShowcase();
    if (portal === 'admin' && state.page === 'admin-relatorios') return realAdminReports();
    if (portal === 'student' && state.page === 'notas') return realStudentGrades();
    return previousPageContent();
  };

  renderApp = function () {
    previousRenderApp();
    const title = document.querySelector('.top-title');
    if (title) title.textContent = portal === 'admin' ? 'Inova Cursos Técnicos · Meu Inova' : 'Meu Inova · Portal do Aluno';
    const chip = document.querySelector('.portal-chip');
    if (chip) chip.textContent = portal === 'admin' ? 'DIREÇÃO E GESTÃO' : 'PORTAL DO ALUNO';
    const dashboardLabel = document.querySelector('[data-page="admin-dashboard"] span:last-child');
    if (dashboardLabel) dashboardLabel.textContent = 'Visão Executiva';
    const gradesLabel = document.querySelector('[data-page="notas"] span:last-child');
    if (gradesLabel) gradesLabel.textContent = 'Notas e Resultados';
    hideUnfinishedNavigation();
    if (portal === 'student') {
      const topAction = document.querySelector('.top-action');
      if (topAction) {
        topAction.textContent = 'Avaliações';
        topAction.onclick = () => go('avaliacoes');
      }
    }
  };
})();
