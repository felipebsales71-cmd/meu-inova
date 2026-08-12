/* Meu Inova - equipe, direção e primeiro acesso. */
(() => {
  if (portal !== 'admin') return;

  const previousBoot = boot;
  const previousPageContent = pageContent;
  const previousRenderLogin = renderLogin;
  const previousRenderApp = renderApp;

  state.staff = state.staff || [];

  const request = async (path, opts = {}) => {
    const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
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
    update: (id, patch) => request(`/api/staff/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    accessLink: id => request(`/api/staff/${id}/access-link`, { method: 'POST', body: '{}' }),
  };

  const sys = adminNav.find(x => x[0] === 'Sistema');
  if (sys && !sys[1].some(x => x[0] === 'equipe')) sys[1].unshift(['equipe', 'EQ', 'Equipe e Permissões']);
  meta.equipe = ['Equipe e Permissões', 'Acessos individuais da direção e da gestão, com senha definida pelo próprio usuário.'];

  function polishAdminLogin() {
    const input = document.getElementById('loginUser');
    if (!input) return;
    const label = input.closest('.field')?.querySelector('label');
    if (label) label.textContent = 'E-mail ou usuário institucional';
    input.placeholder = 'Ex.: nilvan.santos';
    const intro = document.querySelector('.login-card .intro');
    if (intro) intro.textContent = 'Use seu e-mail administrativo ou usuário institucional.';
    const demo = document.querySelector('.login-demo');
    if (demo) demo.innerHTML = '<b>Acesso individual e auditável</b><br><span class="muted">Direção, gestão e administração usam credenciais próprias. Nenhuma senha é compartilhada entre usuários.</span>';
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
  };

  async function loadStaff(render = false) {
    try {
      state.staff = await StaffAPI.list();
      if (render) renderApp();
    } catch (e) {
      console.error('staff-load', e);
      if (render) toast(`Equipe: ${e.message}`, 'error');
    }
  }

  boot = async function () {
    await previousBoot();
    if (state.user) await loadStaff(true);
  };

  function staffPage() {
    const rows = state.staff || [];
    const active = rows.filter(x => x.active && x.hasPassword).length;
    const pending = rows.filter(x => !x.hasPassword).length;
    return `<div class="grid grid-3 staff-kpis">
      <div class="card stat-card"><div class="stat-icon">EQ</div><div><div class="label">Acessos cadastrados</div><div class="value">${rows.length}</div><div class="sub">Direção e gestão</div></div></div>
      <div class="card stat-card green"><div class="stat-icon">AT</div><div><div class="label">Acessos ativos</div><div class="value">${active}</div><div class="sub">Senha já definida</div></div></div>
      <div class="card stat-card orange"><div class="stat-icon">1º</div><div><div class="label">Primeiro acesso pendente</div><div class="value">${pending}</div><div class="sub">Gerar link individual</div></div></div>
    </div>
    <div class="card staff-access-card" style="margin-top:16px">
      <div class="card-head"><div><h3>Acessos da direção</h3><p class="small muted">Cada pessoa recebe um usuário próprio e define a própria senha. O link de primeiro acesso expira em 24 horas.</p></div><span class="badge blue">Controle individual</span></div>
      <div class="staff-grid">${rows.map(s => `<div class="staff-person-card">
        <div class="staff-person-head"><div class="avatar staff-avatar">${initials(s.name)}</div><div><h3>${esc(s.name)}</h3><p>${esc(s.roleLabel)}</p></div>${badge(s.status)}</div>
        <div class="staff-details"><div><span>Usuário</span><b>${esc(s.username)}</b></div><div><span>E-mail</span><b>${esc(s.email || 'Ainda não informado')}</b></div></div>
        <div class="staff-actions"><button class="primary-btn" onclick="generateStaffAccess(${s.id})">${s.hasPassword ? 'Gerar novo link' : 'Gerar primeiro acesso'}</button><button class="secondary-btn" onclick="editStaffAccess(${s.id})">Editar acesso</button></div>
      </div>`).join('')}</div>
    </div>
    <div class="grid grid-2" style="margin-top:16px">
      <div class="card"><h3>Modelo de segurança</h3><div class="metric"><span>Senha compartilhada</span><b>Não</b></div><div class="metric"><span>Senha visível ao administrador</span><b>Não</b></div><div class="metric"><span>Primeiro acesso</span><b>Link temporário</b></div><div class="metric"><span>Sessão</span><b>Assinada no servidor</b></div></div>
      <div class="card admin-callout"><h3>Pronto para apresentação</h3><p class="small muted">Nilvan Santos e Sophia Giovanna já estão cadastrados como perfis institucionais. Basta gerar o link individual e enviar para cada um definir sua senha.</p><div class="success-box">O acesso deles utiliza o mesmo Portal Administrativo, com identificação individual no topo do sistema.</div></div>
    </div>`;
  }

  pageContent = function () {
    if (state.page === 'equipe') return staffPage();
    return previousPageContent();
  };

  window.generateStaffAccess = async id => {
    try {
      const r = await StaffAPI.accessLink(id);
      const expires = new Date(r.expiresAt).toLocaleString('pt-BR');
      const m = modal(`<div class="modal-head"><div><h3>Link de acesso de ${esc(r.name)}</h3><p class="small muted">Válido até ${esc(expires)}.</p></div><button class="close-btn">Fechar</button></div>
        <div class="security-note">Envie este link somente para ${esc(r.name)}. A pessoa abrirá a página, criará a própria senha e depois entrará com o usuário <b>${esc(r.username)}</b>.</div>
        <div class="field"><label>Link individual de primeiro acesso</label><textarea id="staffLink" rows="4" readonly>${esc(r.link)}</textarea></div>
        <div class="modal-actions"><button class="secondary-btn close-link">Fechar</button><button class="primary-btn copy-link">Copiar link</button></div>`);
      m.querySelector('.close-link').onclick = () => m.remove();
      m.querySelector('.copy-link').onclick = async () => {
        const value = m.querySelector('#staffLink').value;
        try { await navigator.clipboard.writeText(value); toast('Link copiado.'); }
        catch { m.querySelector('#staffLink').select(); document.execCommand('copy'); toast('Link copiado.'); }
      };
      await loadStaff(false);
    } catch (e) { toast(e.message, 'error'); }
  };

  window.editStaffAccess = id => {
    const s = state.staff.find(x => Number(x.id) === Number(id));
    if (!s) return;
    const m = modal(`<div class="modal-head"><h3>Editar acesso</h3><button class="close-btn">Fechar</button></div>
      <div class="field"><label>Nome</label><input id="stName" value="${esc(s.name)}"></div>
      <div class="field"><label>Usuário institucional</label><input value="${esc(s.username)}" disabled></div>
      <div class="field"><label>E-mail</label><input id="stEmail" type="email" value="${esc(s.email)}" placeholder="Opcional por enquanto"></div>
      <div class="field"><label>Perfil</label><select id="stRole"><option ${s.roleLabel === 'Proprietário' ? 'selected' : ''}>Proprietário</option><option ${s.roleLabel === 'Gestão' ? 'selected' : ''}>Gestão</option><option ${s.roleLabel === 'Coordenação' ? 'selected' : ''}>Coordenação</option><option ${s.roleLabel === 'Secretaria' ? 'selected' : ''}>Secretaria</option></select></div>
      <label class="security-note" style="display:flex;justify-content:space-between;align-items:center">Acesso habilitado <input id="stActive" class="switch" type="checkbox" ${s.active ? 'checked' : ''}></label>
      <div class="modal-actions"><button class="secondary-btn cancel">Cancelar</button><button class="primary-btn save">Salvar</button></div>`);
    m.querySelector('.cancel').onclick = () => m.remove();
    m.querySelector('.save').onclick = async () => {
      try {
        await StaffAPI.update(id, { name: m.querySelector('#stName').value, email: m.querySelector('#stEmail').value, roleLabel: m.querySelector('#stRole').value, active: m.querySelector('#stActive').checked });
        m.remove();
        await loadStaff(true);
        toast('Acesso atualizado.');
      } catch (e) { toast(e.message, 'error'); }
    };
  };

  polishAdminLogin();
})();
