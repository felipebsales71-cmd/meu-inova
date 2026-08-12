/* Meu Inova - equipe, direção, RBAC e primeiro acesso. */
(() => {
  if (portal !== 'admin') return;

  const previousBoot = boot;
  const previousPageContent = pageContent;
  const previousRenderLogin = renderLogin;
  const previousRenderApp = renderApp;

  state.staff = state.staff || [];

  const PROFILES = {
    owner:{label:'Proprietário',description:'Acesso total ao Meu Inova.',permissions:['dashboard.view','students.view','students.manage','finance.view','finance.manage','academic.view','academic.manage','exams.view','exams.manage','faculty.view','faculty.manage','reports.view','notifications.manage','communications.manage','staff.view','staff.manage','audit.view','system.manage']},
    management:{label:'Gestão',description:'Operação ampla, sem administrar proprietários ou configurações críticas.',permissions:['dashboard.view','students.view','students.manage','finance.view','finance.manage','academic.view','academic.manage','exams.view','exams.manage','faculty.view','faculty.manage','reports.view','notifications.manage','communications.manage','staff.view','audit.view']},
    coordination:{label:'Coordenação',description:'Gestão acadêmica, professores, alunos e avaliações.',permissions:['dashboard.view','students.view','academic.view','academic.manage','exams.view','exams.manage','faculty.view','faculty.manage','reports.view','communications.manage']},
    secretary:{label:'Secretaria',description:'Cadastro de alunos, consultas acadêmicas e atendimento institucional.',permissions:['dashboard.view','students.view','students.manage','finance.view','academic.view','faculty.view','reports.view','communications.manage']},
    finance:{label:'Financeiro',description:'Cobranças, pagamentos, inadimplência e relatórios financeiros.',permissions:['dashboard.view','students.view','finance.view','finance.manage','reports.view','notifications.manage']},
    professor:{label:'Professor',description:'Conteúdo acadêmico e avaliações. Portal docente dedicado será a próxima evolução.',permissions:['dashboard.view','academic.view','exams.view','exams.manage','faculty.view']},
    custom:{label:'Personalizado',description:'Permissões escolhidas individualmente.',permissions:['dashboard.view']},
  };

  const GROUPS = [
    ['Visão geral',[['dashboard.view','Acessar dashboard executivo']]],
    ['Alunos',[['students.view','Ver alunos'],['students.manage','Cadastrar, editar e suspender alunos']]],
    ['Financeiro',[['finance.view','Ver financeiro e inadimplência'],['finance.manage','Criar cobranças e registrar pagamentos']]],
    ['Acadêmico',[['academic.view','Ver cursos, disciplinas e materiais'],['academic.manage','Criar e editar cursos, disciplinas, módulos e aulas']]],
    ['Avaliações',[['exams.view','Ver provas e tentativas'],['exams.manage','Criar, editar e publicar provas']]],
    ['Professores',[['faculty.view','Ver corpo docente'],['faculty.manage','Cadastrar e vincular professores']]],
    ['Relatórios e comunicação',[['reports.view','Ver relatórios'],['notifications.manage','Gerenciar notificações de inadimplência'],['communications.manage','Publicar comunicados']]],
    ['Sistema',[['staff.view','Ver equipe e permissões'],['staff.manage','Criar usuários e alterar permissões'],['audit.view','Ver auditoria'],['system.manage','Alterar configurações críticas']]],
  ];

  const PAGE_PERMISSION = {
    'admin-dashboard':'dashboard.view',
    alunos:'students.view',
    'admin-financeiro':'finance.view',
    notificacoes:'notifications.manage',
    'admin-relatorios':'reports.view',
    'admin-academico':'academic.view',
    professores:'faculty.view',
    'admin-avaliacoes':'exams.view',
    'admin-comunicados':'communications.manage',
    equipe:'staff.view',
    auditoria:'audit.view',
  };

  const request = async (path, opts = {}) => {
    const headers = { 'Content-Type':'application/json', ...(opts.headers || {}) };
    const token = sessionStorage.getItem('mi_token');
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(path, { ...opts, headers });
    let data = {};
    try { data = await res.json(); } catch {}
    if (!res.ok) throw new Error(data.detail || `Falha na equipe (${res.status}).`);
    return data;
  };

  const StaffAPI = {
    list: () => request('/api/staff'),
    create: payload => request('/api/staff', { method:'POST', body:JSON.stringify(payload) }),
    update: (id, patch) => request(`/api/staff/${id}`, { method:'PATCH', body:JSON.stringify(patch) }),
    accessLink: (id, sendEmail=false) => request(`/api/staff/${id}/access-link`, { method:'POST', body:JSON.stringify({sendEmail}) }),
  };

  const sys = adminNav.find(x => x[0] === 'Sistema');
  if (sys && !sys[1].some(x => x[0] === 'equipe')) sys[1].unshift(['equipe','EQ','Equipe e Permissões']);
  meta.equipe = ['Equipe e Permissões','Crie acessos individuais, defina perfis e controle exatamente o que cada pessoa pode fazer.'];

  const isNativeAdmin = () => !Array.isArray(state.user?.permissions);
  const can = permission => isNativeAdmin() || state.user.permissions.includes(permission);

  function polishAdminLogin() {
    const input = document.getElementById('loginUser');
    if (!input) return;
    const label = input.closest('.field')?.querySelector('label');
    if (label) label.textContent = 'E-mail ou usuário institucional';
    input.placeholder = 'Ex.: nilvan.santos';
    const intro = document.querySelector('.login-card .intro');
    if (intro) intro.textContent = 'Use seu e-mail administrativo ou usuário institucional.';
    const demo = document.querySelector('.login-demo');
    if (demo) demo.innerHTML = '<b>Acesso individual e auditável</b><br><span class="muted">Direção, gestão, secretaria e financeiro podem ter credenciais e permissões diferentes.</span>';
  }

  function applyNavigationPermissions() {
    if (isNativeAdmin()) return;
    document.querySelectorAll('[data-page]').forEach(el => {
      const permission = PAGE_PERMISSION[el.dataset.page];
      if (permission && !can(permission)) el.remove();
    });
  }

  renderLogin = function () {
    previousRenderLogin();
    polishAdminLogin();
  };

  renderApp = function () {
    previousRenderApp();
    const role = state.user?.staffRole;
    if (role) {
      const roleEl = document.querySelector('.profile-chip .who span');
      if (roleEl) roleEl.textContent = role;
    }
    applyNavigationPermissions();
  };

  async function loadStaff(render=false) {
    try {
      state.staff = await StaffAPI.list();
      if (render) renderApp();
    } catch (e) {
      state.staff = [];
      console.error('staff-load', e);
      if (render && can('staff.view')) toast(`Equipe: ${e.message}`, 'error');
    }
  }

  boot = async function () {
    await previousBoot();
    if (state.user) await loadStaff(true);
  };

  function permissionChecklist(selected=[]) {
    const set = new Set(selected);
    return `<div class="permission-groups">${GROUPS.map(([title,items]) => `<section class="permission-group"><h4>${esc(title)}</h4>${items.map(([key,label]) => `<label class="permission-item"><input type="checkbox" data-permission="${key}" ${set.has(key)?'checked':''}><span><b>${esc(label)}</b><small>${key}</small></span></label>`).join('')}</section>`).join('')}</div>`;
  }
  function selectedPermissions(root) {
    return [...root.querySelectorAll('[data-permission]:checked')].map(x => x.dataset.permission);
  }
  function applyProfile(root, key) {
    if (key === 'custom') return;
    const allowed = new Set(PROFILES[key]?.permissions || []);
    root.querySelectorAll('[data-permission]').forEach(x => { x.checked = allowed.has(x.dataset.permission); });
  }
  function profileOptions(current='management') {
    return Object.entries(PROFILES).map(([key,p]) => `<option value="${key}" ${key===current?'selected':''}>${esc(p.label)}</option>`).join('');
  }
  function permissionSummary(s) {
    const labels = [];
    if (s.permissions.includes('students.manage')) labels.push('Alunos');
    if (s.permissions.includes('finance.manage')) labels.push('Financeiro');
    if (s.permissions.includes('academic.manage')) labels.push('Acadêmico');
    if (s.permissions.includes('exams.manage')) labels.push('Provas');
    if (s.permissions.includes('staff.manage')) labels.push('Equipe');
    if (!labels.length) {
      if (s.permissions.includes('students.view')) labels.push('Consulta de alunos');
      if (s.permissions.includes('finance.view')) labels.push('Consulta financeira');
      if (s.permissions.includes('academic.view')) labels.push('Consulta acadêmica');
    }
    return labels.slice(0,4);
  }

  function staffPage() {
    const rows = state.staff || [];
    const active = rows.filter(x => x.active && x.hasPassword).length;
    const pending = rows.filter(x => x.active && !x.hasPassword).length;
    const suspended = rows.filter(x => !x.active).length;
    const canManage = can('staff.manage');
    return `<div class="staff-page-toolbar">
      <div><span class="staff-eyebrow">CONTROLE DE ACESSO</span><h2>Usuários internos</h2><p>Direção, gestão, secretaria, financeiro e coordenação com credenciais individuais.</p></div>
      ${canManage?'<button class="primary-btn staff-add-btn" onclick="newStaffUser()">Adicionar usuário</button>':''}
    </div>
    <div class="grid grid-4 staff-kpis">
      <div class="card stat-card"><div class="stat-icon">EQ</div><div><div class="label">Cadastrados</div><div class="value">${rows.length}</div><div class="sub">Equipe institucional</div></div></div>
      <div class="card stat-card green"><div class="stat-icon">AT</div><div><div class="label">Ativos</div><div class="value">${active}</div><div class="sub">Senha definida</div></div></div>
      <div class="card stat-card orange"><div class="stat-icon">1º</div><div><div class="label">Primeiro acesso</div><div class="value">${pending}</div><div class="sub">Aguardando ativação</div></div></div>
      <div class="card stat-card red"><div class="stat-icon">BL</div><div><div class="label">Suspensos</div><div class="value">${suspended}</div><div class="sub">Sem acesso ao portal</div></div></div>
    </div>
    <div class="card staff-access-card" style="margin-top:16px">
      <div class="card-head"><div><h3>Equipe e permissões</h3><p class="small muted">O acesso é individual. A senha nunca é exibida ao administrador.</p></div><span class="badge blue">RBAC ativo</span></div>
      ${rows.length ? `<div class="staff-grid">${rows.map(s => `<div class="staff-person-card">
        <div class="staff-person-head"><div class="avatar staff-avatar">${initials(s.name)}</div><div><h3>${esc(s.name)}</h3><p>${esc(s.roleLabel)} · ${esc(s.username)}</p></div>${badge(s.status)}</div>
        <div class="staff-details"><div><span>E-mail</span><b>${esc(s.email || 'Não informado')}</b></div><div><span>Perfil</span><b>${esc(PROFILES[s.profileKey]?.label || s.roleLabel)}</b></div></div>
        <div class="permission-pills">${permissionSummary(s).map(x=>`<span>${esc(x)}</span>`).join('')}${s.permissions.length>4?`<span>+${Math.max(0,s.permissions.length-4)} permissões</span>`:''}</div>
        <div class="staff-actions">${canManage?`<button class="primary-btn" onclick="generateStaffAccess(${s.id})">${s.hasPassword?'Redefinir acesso':'Gerar primeiro acesso'}</button><button class="secondary-btn" onclick="editStaffAccess(${s.id})">Editar e permissões</button>`:'<span class="small muted">Visualização do acesso</span>'}</div>
      </div>`).join('')}</div>` : `<div class="staff-empty"><b>Nenhum usuário carregado.</b><span>Atualize a página após o deploy. Se continuar vazio, o painel mostrará o erro da API.</span></div>`}
    </div>
    <div class="grid grid-2" style="margin-top:16px">
      <div class="card"><h3>Perfis prontos</h3><div class="profile-preview-list">${Object.entries(PROFILES).filter(([k])=>k!=='custom').map(([k,p])=>`<div><b>${esc(p.label)}</b><span>${esc(p.description)}</span></div>`).join('')}</div></div>
      <div class="card admin-callout"><h3>Primeiro acesso seguro</h3><p class="small muted">Ao criar um usuário, você gera um link temporário. A pessoa escolhe a própria senha e depois entra pelo portal administrativo com o usuário institucional.</p><div class="success-box">O link pode ser copiado ou enviado por e-mail pela integração Brevo quando o e-mail do usuário estiver cadastrado.</div></div>
    </div>`;
  }

  pageContent = function () {
    const needed = PAGE_PERMISSION[state.page];
    if (needed && !can(needed)) return `<div class="card access-denied"><h3>Acesso restrito</h3><p>Seu perfil não possui permissão para abrir esta área.</p></div>`;
    if (state.page === 'equipe') return staffPage();
    return previousPageContent();
  };

  function showAccessModal(r, id) {
    const expires = new Date(r.expiresAt).toLocaleString('pt-BR');
    const m = modal(`<div class="modal-head"><div><h3>Acesso de ${esc(r.name)}</h3><p class="small muted">Link válido até ${esc(expires)}.</p></div><button class="close-btn">Fechar</button></div>
      <div class="access-link-identity"><div><span>Usuário de login</span><b>${esc(r.username)}</b></div><div><span>Destino</span><b>${esc(r.email || 'Envio manual')}</b></div></div>
      <div class="security-note">Este link é individual e de uso único. A pessoa abre, cria a própria senha e depois entra pelo portal <b>Direção e Gestão</b>.</div>
      <div class="field"><label>Link temporário</label><textarea id="staffLink" rows="4" readonly>${esc(r.link)}</textarea></div>
      <div class="modal-actions access-link-actions"><button class="secondary-btn close-link">Fechar</button>${r.email?'<button class="secondary-btn email-link">Enviar por e-mail</button>':''}<button class="primary-btn copy-link">Copiar link</button></div>`);
    m.querySelector('.close-link').onclick = () => m.remove();
    m.querySelector('.copy-link').onclick = async () => {
      const value = m.querySelector('#staffLink').value;
      try { await navigator.clipboard.writeText(value); toast('Link copiado.'); }
      catch { m.querySelector('#staffLink').select(); document.execCommand('copy'); toast('Link copiado.'); }
    };
    m.querySelector('.email-link')?.addEventListener('click', async e => {
      e.currentTarget.disabled = true;
      try {
        const sent = await StaffAPI.accessLink(id, true);
        m.querySelector('#staffLink').value = sent.link;
        toast(`Acesso enviado para ${sent.email}.`);
      } catch (err) { toast(err.message,'error'); }
      finally { e.currentTarget.disabled = false; }
    });
  }

  window.generateStaffAccess = async id => {
    try {
      const r = await StaffAPI.accessLink(id, false);
      showAccessModal(r, id);
      await loadStaff(false);
    } catch (e) { toast(e.message,'error'); }
  };

  window.newStaffUser = () => {
    const defaultProfile = 'management';
    const m = modal(`<div class="modal-head"><div><h3>Adicionar usuário interno</h3><p class="small muted">Defina quem é a pessoa, o perfil e exatamente o que ela poderá fazer.</p></div><button class="close-btn">Fechar</button></div>
      <div class="grid grid-2"><div class="field"><label>Nome completo</label><input id="suName"></div><div class="field"><label>E-mail</label><input id="suEmail" type="email" placeholder="Usado para enviar primeiro acesso"></div><div class="field"><label>Usuário institucional</label><input id="suUsername" placeholder="Opcional: gerado pelo sistema"></div><div class="field"><label>Perfil de acesso</label><select id="suProfile">${profileOptions(defaultProfile)}</select></div></div>
      <div class="profile-description" id="suProfileDescription">${esc(PROFILES[defaultProfile].description)}</div>
      <div class="permissions-title"><div><h4>Permissões</h4><span>Você pode usar o perfil como base e ajustar os itens abaixo.</span></div><button class="plain-btn" type="button" id="markCustom">Usar personalizado</button></div>
      <div id="suPermissions">${permissionChecklist(PROFILES[defaultProfile].permissions)}</div>
      <div class="modal-actions"><button class="secondary-btn cancel">Cancelar</button><button class="primary-btn create">Criar usuário e gerar acesso</button></div>`, true);
    const profile = m.querySelector('#suProfile');
    profile.onchange = () => {
      const key = profile.value;
      m.querySelector('#suProfileDescription').textContent = PROFILES[key].description;
      applyProfile(m, key);
    };
    m.querySelector('#markCustom').onclick = () => { profile.value='custom';m.querySelector('#suProfileDescription').textContent=PROFILES.custom.description; };
    m.querySelectorAll('[data-permission]').forEach(x => x.onchange = () => { if (profile.value!=='custom') { profile.value='custom';m.querySelector('#suProfileDescription').textContent=PROFILES.custom.description; } });
    m.querySelector('.cancel').onclick = () => m.remove();
    m.querySelector('.create').onclick = async () => {
      const name = m.querySelector('#suName').value.trim();
      if (!name) return toast('Informe o nome do usuário.','error');
      try {
        const created = await StaffAPI.create({
          name,
          email:m.querySelector('#suEmail').value.trim(),
          username:m.querySelector('#suUsername').value.trim(),
          profileKey:profile.value,
          roleLabel:PROFILES[profile.value].label,
          permissions:selectedPermissions(m),
          active:true,
        });
        m.remove();
        await loadStaff(true);
        const access = await StaffAPI.accessLink(created.id, false);
        showAccessModal(access, created.id);
        toast('Usuário criado. Agora envie o primeiro acesso.');
      } catch (e) { toast(e.message,'error'); }
    };
  };

  window.editStaffAccess = id => {
    const s = state.staff.find(x => Number(x.id) === Number(id));
    if (!s) return;
    const m = modal(`<div class="modal-head"><div><h3>Editar usuário e permissões</h3><p class="small muted">${esc(s.name)} · ${esc(s.username)}</p></div><button class="close-btn">Fechar</button></div>
      <div class="grid grid-2"><div class="field"><label>Nome</label><input id="stName" value="${esc(s.name)}"></div><div class="field"><label>E-mail</label><input id="stEmail" type="email" value="${esc(s.email)}"></div><div class="field"><label>Usuário institucional</label><input value="${esc(s.username)}" disabled></div><div class="field"><label>Perfil</label><select id="stProfile">${profileOptions(s.profileKey)}</select></div></div>
      <div class="profile-description" id="stProfileDescription">${esc(PROFILES[s.profileKey]?.description || PROFILES.custom.description)}</div>
      <div class="permissions-title"><div><h4>Permissões efetivas</h4><span>Alterações entram em vigor nas próximas requisições e no próximo login.</span></div></div>
      <div id="stPermissions">${permissionChecklist(s.permissions)}</div>
      <label class="security-note staff-active-switch">Acesso habilitado <input id="stActive" class="switch" type="checkbox" ${s.active?'checked':''}></label>
      <div class="modal-actions"><button class="secondary-btn cancel">Cancelar</button><button class="primary-btn save">Salvar alterações</button></div>`, true);
    const profile = m.querySelector('#stProfile');
    profile.onchange = () => { const key=profile.value;m.querySelector('#stProfileDescription').textContent=PROFILES[key].description;applyProfile(m,key); };
    m.querySelectorAll('[data-permission]').forEach(x => x.onchange = () => { if(profile.value!=='custom'){profile.value='custom';m.querySelector('#stProfileDescription').textContent=PROFILES.custom.description;} });
    m.querySelector('.cancel').onclick = () => m.remove();
    m.querySelector('.save').onclick = async () => {
      try {
        await StaffAPI.update(id, {
          name:m.querySelector('#stName').value,
          email:m.querySelector('#stEmail').value,
          profileKey:profile.value,
          roleLabel:PROFILES[profile.value].label,
          permissions:selectedPermissions(m),
          active:m.querySelector('#stActive').checked,
        });
        m.remove();
        await loadStaff(true);
        toast('Usuário e permissões atualizados.');
      } catch (e) { toast(e.message,'error'); }
    };
  };

  polishAdminLogin();
})();
