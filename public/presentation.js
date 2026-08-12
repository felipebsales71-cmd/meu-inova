/* Meu Inova - dashboards orientados a dados reais para apresentação institucional. */
(() => {
  const previousPageContent = pageContent;

  const sum = (items, fn) => (items || []).reduce((total, item) => total + Number(fn(item) || 0), 0);
  const firstName = () => String(state.user?.name || 'Usuário').trim().split(/\s+/)[0];
  const semesterLabel = () => { const d = new Date(); return `${d.getFullYear()}.${d.getMonth() < 6 ? '1' : '2'}`; };

  function executiveDashboard() {
    const students = state.students || [];
    const payments = state.payments || [];
    const ac = state.academic?.summary || {};
    const due = sum(payments, p => p.amountDue);
    const paid = sum(payments, p => p.amountPaid);
    const open = Math.max(0, due - paid);
    const overdue = payments.filter(p => p.status === 'Atrasado').length;
    const activeStudents = students.filter(s => s.access).length;
    const receiveRate = due > 0 ? Math.round((paid / due) * 100) : 0;
    const staffRole = state.user?.staffRole || 'Administração';
    return `<div class="executive-hero card">
      <div><span class="executive-eyebrow">VISÃO EXECUTIVA · ${esc(staffRole).toUpperCase()}</span><h2>Olá, ${esc(firstName())}. O Meu Inova está pronto para centralizar a operação da faculdade.</h2><p>Acadêmico, ambiente virtual, avaliações, alunos e financeiro conectados no mesmo painel.</p></div>
      <div class="executive-actions"><button class="primary-btn" onclick="go('admin-academico')">Gestão Acadêmica</button><button class="secondary-btn" onclick="go('admin-avaliacoes')">Avaliações Online</button></div>
    </div>
    <div class="grid grid-4 executive-kpis" style="margin-top:16px">
      <div class="card stat-card"><div class="stat-icon">AL</div><div><div class="label">Alunos cadastrados</div><div class="value">${students.length}</div><div class="sub">${activeStudents} com acesso ativo</div></div></div>
      <div class="card stat-card green"><div class="stat-icon">RX</div><div><div class="label">Taxa de recebimento</div><div class="value">${receiveRate}%</div><div class="sub">${money(paid)} recebido</div></div></div>
      <div class="card stat-card ${overdue ? 'red' : 'green'}"><div class="stat-icon">AT</div><div><div class="label">Cobranças atrasadas</div><div class="value">${overdue}</div><div class="sub">${money(open)} em aberto</div></div></div>
      <div class="card stat-card orange"><div class="stat-icon">DI</div><div><div class="label">Disciplinas no AVA</div><div class="value">${Number(ac.disciplines || 0)}</div><div class="sub">${Number(ac.lessons || 0)} aula(s) cadastrada(s)</div></div></div>
    </div>
    <div class="grid grid-3" style="margin-top:16px">
      <div class="card span-2"><div class="card-head"><div><h3>Operação acadêmica</h3><p class="small muted">Indicadores do ambiente virtual e avaliações.</p></div><button class="action-link" onclick="go('admin-academico')">Abrir acadêmico</button></div>
        <div class="executive-modules">
          <button onclick="go('admin-academico')"><span>CR</span><div><b>${Number(ac.courses || 0)} curso(s)</b><small>Matriz e organização curricular</small></div></button>
          <button onclick="go('admin-academico')"><span>AU</span><div><b>${Number(ac.lessons || 0)} aula(s)</b><small>Videoaulas e materiais</small></div></button>
          <button onclick="go('admin-avaliacoes')"><span>AV</span><div><b>${Number(ac.publishedExams || 0)} prova(s) publicada(s)</b><small>Avaliações com correção automática</small></div></button>
          <button onclick="go('equipe')"><span>EQ</span><div><b>${(state.staff || []).length} acesso(s) de gestão</b><small>Credenciais individuais</small></div></button>
        </div>
      </div>
      <div class="card"><h3>Prontidão da plataforma</h3><div class="readiness-line"><span>Portal do Aluno</span>${badge('Ativo')}</div><div class="readiness-line"><span>Portal Administrativo</span>${badge('Ativo')}</div><div class="readiness-line"><span>AVA / Videoaulas</span>${badge('Ativo')}</div><div class="readiness-line"><span>Provas online</span>${badge('Ativo')}</div><div class="readiness-line"><span>E-mail transacional</span>${badge('Ativo')}</div><div class="readiness-line"><span>Upload direto de PDF</span>${badge('Pendente')}</div></div>
      <div class="card span-3"><div class="card-head"><div><h3>Atalhos de gestão</h3><p class="small muted">Acesso rápido aos módulos que serão usados no dia a dia.</p></div></div><div class="executive-shortcuts"><button onclick="go('alunos')"><b>Alunos e Acessos</b><span>Cadastro, suspensão e recuperação</span></button><button onclick="go('admin-financeiro')"><b>Financeiro</b><span>Cobranças e pagamentos</span></button><button onclick="go('admin-academico')"><b>Conteúdo Acadêmico</b><span>Disciplinas, módulos e aulas</span></button><button onclick="go('admin-avaliacoes')"><b>Provas Online</b><span>Questões, tentativas e notas</span></button><button onclick="go('equipe')"><b>Equipe e Permissões</b><span>Direção e gestão</span></button></div></div>
    </div>`;
  }

  function studentDashboard() {
    const disciplines = state.academic?.overview?.disciplines || [];
    const exams = state.academic?.overview?.exams || [];
    const payments = state.payments || [];
    const open = sum(payments.filter(p => p.status !== 'Pago'), p => Number(p.amountDue) - Number(p.amountPaid));
    const lessonCount = sum(disciplines, d => d.lessonCount);
    const completed = sum(disciplines, d => d.completedCount);
    const overall = lessonCount ? Math.round(completed * 100 / lessonCount) : 0;
    const availableExams = exams.filter(e => (!e.availableFrom || Date.parse(e.availableFrom) <= Date.now()) && (!e.availableUntil || Date.parse(e.availableUntil) >= Date.now()) && e.attemptsUsed < e.attemptsAllowed);
    return `<div class="student-welcome card"><div><span class="executive-eyebrow">SEMESTRE ${semesterLabel()}</span><h2>Olá, ${esc(firstName())}.</h2><p>Continue seus estudos, acompanhe avaliações e consulte sua situação acadêmica e financeira.</p></div><button class="primary-btn" onclick="go('disciplinas')">Continuar estudando</button></div>
      <div class="grid grid-4" style="margin-top:16px">
        <div class="card stat-card"><div class="stat-icon">DI</div><div><div class="label">Disciplinas</div><div class="value">${disciplines.length}</div><div class="sub">Matriculadas no AVA</div></div></div>
        <div class="card stat-card green"><div class="stat-icon">PR</div><div><div class="label">Progresso geral</div><div class="value">${overall}%</div><div class="sub">${completed}/${lessonCount} aulas concluídas</div></div></div>
        <div class="card stat-card orange"><div class="stat-icon">AV</div><div><div class="label">Avaliações disponíveis</div><div class="value">${availableExams.length}</div><div class="sub">Acesse pela área de provas</div></div></div>
        <div class="card stat-card ${open > 0 ? 'orange' : 'green'}"><div class="stat-icon">R$</div><div><div class="label">Saldo em aberto</div><div class="value">${money(open)}</div><div class="sub">Consulte o financeiro</div></div></div>
      </div>
      <div class="grid grid-3" style="margin-top:16px"><div class="card span-2"><div class="card-head"><div><h3>Minhas disciplinas</h3><p class="small muted">Seu progresso é atualizado conforme as aulas são concluídas.</p></div><button class="action-link" onclick="go('disciplinas')">Ver todas</button></div>${disciplines.length ? disciplines.slice(0,5).map(d => `<div class="list-row"><div class="list-main"><b>${esc(d.name)}</b><span>${esc(d.professor || 'Professor a definir')} · ${d.completedCount}/${d.lessonCount} aulas</span></div><div style="width:min(42%,260px)"><div class="subject-meta"><span>Progresso</span><b>${d.progress}%</b></div>${progress(d.progress)}</div></div>`).join('') : '<div class="academic-empty">As disciplinas aparecerão aqui assim que a coordenação concluir sua matrícula acadêmica.</div>'}</div>
      <div class="card"><div class="card-head"><h3>Próximas avaliações</h3><button class="action-link" onclick="go('avaliacoes')">Abrir provas</button></div>${exams.length ? exams.slice(0,4).map(e => `<div class="notice"><h4>${esc(e.title)}</h4><p>${esc(e.disciplineName)} · ${e.durationMinutes} min · ${e.attemptsUsed}/${e.attemptsAllowed} tentativa(s)</p></div>`).join('') : '<div class="academic-empty">Nenhuma avaliação publicada no momento.</div>'}</div></div>`;
  }

  function studentAcademicOverview() {
    const disciplines = state.academic?.overview?.disciplines || [];
    return `<div class="card"><div class="card-head"><div><h3>Disciplinas matriculadas · ${semesterLabel()}</h3><p class="small muted">Dados carregados diretamente da gestão acadêmica.</p></div><button class="primary-btn" onclick="go('disciplinas')">Abrir ambiente virtual</button></div>${disciplines.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Disciplina</th><th>Professor</th><th>Carga horária</th><th>Aulas</th><th>Progresso</th></tr></thead><tbody>${disciplines.map(d => `<tr><td><b>${esc(d.name)}</b><br><span class="muted">${esc(d.code)}</span></td><td>${esc(d.professor || 'A definir')}</td><td>${d.workloadHours}h</td><td>${d.completedCount}/${d.lessonCount}</td><td><div style="min-width:130px">${progress(d.progress)}<span class="small muted">${d.progress}%</span></div></td></tr>`).join('')}</tbody></table></div>` : '<div class="academic-empty">Nenhuma disciplina acadêmica vinculada ao seu acesso ainda.</div>'}</div>`;
  }

  function studentCalendar() {
    const exams = state.academic?.overview?.exams || [];
    const ordered = [...exams].filter(e => e.availableFrom || e.availableUntil).sort((a,b) => Date.parse(a.availableFrom || a.availableUntil) - Date.parse(b.availableFrom || b.availableUntil));
    return `<div class="grid grid-3"><div class="card span-2"><div class="card-head"><div><h3>Agenda de avaliações</h3><p class="small muted">Datas publicadas pela gestão acadêmica.</p></div></div>${ordered.length ? ordered.map(e => `<div class="calendar-event-real"><div class="calendar-date-box"><b>${e.availableFrom ? new Date(e.availableFrom).toLocaleDateString('pt-BR',{day:'2-digit'}) : '--'}</b><span>${e.availableFrom ? new Date(e.availableFrom).toLocaleDateString('pt-BR',{month:'short'}).replace('.','') : 'prazo'}</span></div><div><h4>${esc(e.title)}</h4><p>${esc(e.disciplineName)} · ${e.durationMinutes} minutos</p></div>${badge(e.attemptsUsed < e.attemptsAllowed ? 'Ativo' : 'Concluído')}</div>`).join('') : '<div class="academic-empty">Nenhuma data acadêmica publicada no momento.</div>'}</div><div class="card"><h3>Orientação</h3><p class="small muted">As avaliações liberadas também ficam disponíveis em “Avaliações Online”. O prazo e o cronômetro são validados pelo servidor.</p><button class="secondary-btn full" onclick="go('avaliacoes')">Ver avaliações online</button></div></div>`;
  }

  pageContent = function () {
    if (portal === 'admin' && state.page === 'admin-dashboard') return executiveDashboard();
    if (portal === 'student' && state.page === 'dashboard') return studentDashboard();
    if (portal === 'student' && state.page === 'academico') return studentAcademicOverview();
    if (portal === 'student' && state.page === 'calendario') return studentCalendar();
    return previousPageContent();
  };
})();
