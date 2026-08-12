/* Meu Inova - professores e importação de grade curricular. */
(() => {
  if (portal !== 'admin') return;
  const previousBoot = boot;
  const previousPageContent = pageContent;
  state.faculty = state.faculty || [];

  const req = async (path, opts = {}) => {
    const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
    const token = sessionStorage.getItem('mi_token');
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(path, { ...opts, headers });
    let data = {};
    try { data = await res.json(); } catch {}
    if (!res.ok) throw new Error(data.detail || `Falha (${res.status}).`);
    return data;
  };
  const post = (p, d) => req(p, { method: 'POST', body: JSON.stringify(d) });
  const Faculty = {
    list: () => req('/api/faculty/professors'),
    create: d => post('/api/faculty/professors', d),
    update: (id,d) => req(`/api/faculty/professors/${id}`, { method:'PATCH', body:JSON.stringify(d) }),
    assign: (id,disciplineId) => post(`/api/faculty/professors/${id}/assign`, { disciplineId }),
    disciplines: id => req(`/api/faculty/professors/${id}/disciplines`),
    createDiscipline: d => post('/api/academic/admin/disciplines', d),
  };

  const op = adminNav.find(x => x[0] === 'Operação');
  if (op && !op[1].some(x => x[0] === 'professores')) op[1].splice(1,0,['professores','PR','Professores']);
  meta.professores = ['Professores', 'Cadastre docentes, vincule disciplinas e importe a grade curricular em lote.'];

  async function loadFaculty(render=false){
    try{state.faculty=await Faculty.list();if(render)renderApp()}catch(e){console.error('faculty-load',e);if(render)toast(`Professores: ${e.message}`,'error')}
  }
  boot = async function(){await previousBoot();if(state.user)await loadFaculty(true)};

  function facultyPage(){
    const rows=state.faculty||[];
    const disciplines=state.academic?.disciplines||[];
    const totalAssignments=rows.reduce((n,p)=>n+Number(p.disciplineCount||0),0);
    return `<div class="grid grid-3">
      <div class="card stat-card"><div class="stat-icon">PR</div><div><div class="label">Professores cadastrados</div><div class="value">${rows.length}</div><div class="sub">Equipe docente</div></div></div>
      <div class="card stat-card green"><div class="stat-icon">AT</div><div><div class="label">Professores ativos</div><div class="value">${rows.filter(x=>x.active).length}</div><div class="sub">Disponíveis para vínculo</div></div></div>
      <div class="card stat-card orange"><div class="stat-icon">VD</div><div><div class="label">Vínculos com disciplinas</div><div class="value">${totalAssignments}</div><div class="sub">Professor × disciplina</div></div></div>
    </div>
    <div class="grid grid-3" style="margin-top:16px">
      <div class="card span-2"><div class="card-head"><div><h3>Corpo docente</h3><p class="small muted">Dados institucionais dos professores e suas disciplinas.</p></div><button class="primary-btn" onclick="newProfessor()">Novo professor</button></div>
        ${rows.length?`<div class="faculty-grid">${rows.map(p=>`<div class="faculty-card"><div class="faculty-card-head"><div class="avatar">${initials(p.name)}</div><div><h3>${esc(p.name)}</h3><p>${esc(p.specialty||'Área não informada')}</p></div>${badge(p.active?'Ativo':'Suspenso')}</div><div class="faculty-meta"><span>${esc(p.email||'E-mail não informado')}</span><span>${p.disciplineCount} disciplina(s)</span></div><div class="staff-actions"><button class="secondary-btn" onclick="assignProfessor(${p.id})">Vincular disciplina</button><button class="secondary-btn" onclick="editProfessor(${p.id})">Editar</button></div></div>`).join('')}</div>`:'<div class="academic-empty">Nenhum professor cadastrado ainda.</div>'}
      </div>
      <div class="card"><h3>Importação da grade</h3><p class="small muted">Quando você receber a lista de matérias, professor e carga horária, pode importar tudo de uma vez.</p><div class="faculty-import-format"><b>Formato por linha</b><span>Disciplina; Professor; Carga horária; Período; Código opcional</span></div><button class="primary-btn full" onclick="openGradeImport()" ${state.academic?.courses?.length?'':'disabled'}>Importar grade curricular</button>${!state.academic?.courses?.length?'<p class="small muted" style="margin-top:10px">Cadastre primeiro pelo menos um curso em Gestão Acadêmica.</p>':''}<div class="divider"></div><div class="metric"><span>Disciplinas atuais</span><b>${disciplines.length}</b></div><div class="metric"><span>Professores atuais</span><b>${rows.length}</b></div></div>
    </div>`;
  }

  pageContent=function(){if(state.page==='professores')return facultyPage();return previousPageContent()};

  window.newProfessor=()=>{const m=modal(`<div class="modal-head"><h3>Novo professor</h3><button class="close-btn">Fechar</button></div><div class="field"><label>Nome completo</label><input id="fpName"></div><div class="grid grid-2"><div class="field"><label>E-mail</label><input id="fpEmail" type="email"></div><div class="field"><label>Telefone</label><input id="fpPhone"></div><div class="field"><label>Área / especialidade</label><input id="fpSpecialty"></div><div class="field"><label>Registro / identificação</label><input id="fpReg"></div></div><div class="modal-actions"><button class="secondary-btn cancel">Cancelar</button><button class="primary-btn save">Cadastrar professor</button></div>`);m.querySelector('.cancel').onclick=()=>m.remove();m.querySelector('.save').onclick=async()=>{try{await Faculty.create({name:m.querySelector('#fpName').value,email:m.querySelector('#fpEmail').value,phone:m.querySelector('#fpPhone').value,specialty:m.querySelector('#fpSpecialty').value,registration:m.querySelector('#fpReg').value});m.remove();await loadFaculty(true);toast('Professor cadastrado.')}catch(e){toast(e.message,'error')}}};

  window.editProfessor=id=>{const p=state.faculty.find(x=>Number(x.id)===Number(id));if(!p)return;const m=modal(`<div class="modal-head"><h3>Editar professor</h3><button class="close-btn">Fechar</button></div><div class="field"><label>Nome completo</label><input id="epName" value="${esc(p.name)}"></div><div class="grid grid-2"><div class="field"><label>E-mail</label><input id="epEmail" type="email" value="${esc(p.email)}"></div><div class="field"><label>Telefone</label><input id="epPhone" value="${esc(p.phone)}"></div><div class="field"><label>Área / especialidade</label><input id="epSpecialty" value="${esc(p.specialty)}"></div><div class="field"><label>Registro</label><input id="epReg" value="${esc(p.registration)}"></div></div><label class="security-note" style="display:flex;justify-content:space-between;align-items:center">Professor ativo <input id="epActive" class="switch" type="checkbox" ${p.active?'checked':''}></label><div class="modal-actions"><button class="secondary-btn cancel">Cancelar</button><button class="primary-btn save">Salvar</button></div>`);m.querySelector('.cancel').onclick=()=>m.remove();m.querySelector('.save').onclick=async()=>{try{await Faculty.update(id,{name:m.querySelector('#epName').value,email:m.querySelector('#epEmail').value,phone:m.querySelector('#epPhone').value,specialty:m.querySelector('#epSpecialty').value,registration:m.querySelector('#epReg').value,active:m.querySelector('#epActive').checked});m.remove();await loadFaculty(true);toast('Professor atualizado.')}catch(e){toast(e.message,'error')}}};

  window.assignProfessor=id=>{const p=state.faculty.find(x=>Number(x.id)===Number(id)),list=state.academic?.disciplines||[];if(!p||!list.length)return toast('Cadastre uma disciplina primeiro.','error');const m=modal(`<div class="modal-head"><h3>Vincular ${esc(p.name)}</h3><button class="close-btn">Fechar</button></div><div class="field"><label>Disciplina</label><select id="asDisc">${list.map(d=>`<option value="${d.id}">${esc(d.name)} · ${esc(d.code)}</option>`).join('')}</select></div><div class="security-note">O nome do professor também será atualizado na disciplina para aparecer imediatamente no Portal do Aluno.</div><div class="modal-actions"><button class="secondary-btn cancel">Cancelar</button><button class="primary-btn save">Vincular</button></div>`);m.querySelector('.cancel').onclick=()=>m.remove();m.querySelector('.save').onclick=async()=>{try{await Faculty.assign(id,Number(m.querySelector('#asDisc').value));m.remove();await loadFaculty(false);toast('Professor vinculado à disciplina.');location.reload()}catch(e){toast(e.message,'error')}}};

  function makeCode(name,index,used){let base=String(name||'DISC').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9 ]/g,' ').trim().split(/\s+/).filter(Boolean).map(w=>w.slice(0,3)).join('').slice(0,8)||'DISC';let code=base,n=2;while(used.has(code)){code=`${base.slice(0,6)}${String(n++).padStart(2,'0')}`}used.add(code);return code}
  window.openGradeImport=()=>{const courses=state.academic?.courses||[];if(!courses.length)return toast('Cadastre um curso primeiro.','error');const m=modal(`<div class="modal-head"><div><h3>Importar grade curricular</h3><p class="small muted">Cole uma matéria por linha. O sistema cria disciplinas e professores automaticamente.</p></div><button class="close-btn">Fechar</button></div><div class="field"><label>Curso</label><select id="igCourse">${courses.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div><div class="field"><label>Grade</label><textarea id="igText" rows="11" placeholder="Anatomia e Fisiologia; João da Silva; 80; 1º Módulo; ANAT01\nÉtica Profissional; Maria Souza; 40; 1º Módulo"></textarea></div><div class="security-note">Separador aceito: ponto e vírgula ou tabulação. O código é opcional; quando ausente, o Meu Inova cria um código acadêmico automaticamente.</div><div class="modal-actions"><button class="secondary-btn cancel">Cancelar</button><button class="primary-btn import">Importar grade</button></div>`,true);m.querySelector('.cancel').onclick=()=>m.remove();m.querySelector('.import').onclick=async()=>{const lines=m.querySelector('#igText').value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);if(!lines.length)return toast('Cole pelo menos uma linha da grade.','error');const courseId=Number(m.querySelector('#igCourse').value),used=new Set((state.academic?.disciplines||[]).map(d=>String(d.code).toUpperCase()));let created=0;try{for(let i=0;i<lines.length;i++){const parts=(lines[i].includes('\t')?lines[i].split('\t'):lines[i].split(';')).map(x=>x.trim());const [name,professor,workload,period,rawCode]=parts;if(!name)continue;const code=rawCode?rawCode.toUpperCase():makeCode(name,i,used);else{}const prof=professor?await Faculty.create({name:professor}):null;const disc=await Faculty.createDiscipline({courseId,name,code,workloadHours:Number(String(workload||'0').replace(/[^0-9.,]/g,'').replace(',','.'))||0,period:period||'',professor:professor||'',description:''});if(prof?.id&&disc?.id)await Faculty.assign(prof.id,disc.id);created++}m.remove();toast(`${created} disciplina(s) importada(s).`);setTimeout(()=>location.reload(),700)}catch(e){toast(`Importação interrompida após ${created} item(ns): ${e.message}`,'error')}}};

  if(state.user)loadFaculty(false).then(()=>renderApp());
})();
