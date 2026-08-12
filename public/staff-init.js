/* Carrega equipe quando o HTML abre com uma sessão administrativa já existente. */
(() => {
  if (typeof portal === 'undefined' || portal !== 'admin' || !state?.user) return;
  const token = sessionStorage.getItem('mi_token');
  if (!token) return;
  fetch('/api/staff', { headers: { Authorization: `Bearer ${token}` } })
    .then(async r => { const d = await r.json().catch(() => []); if (!r.ok) throw new Error(d.detail || 'Falha ao carregar equipe.'); return d; })
    .then(rows => { state.staff = rows; renderApp(); })
    .catch(e => console.error('staff-session-load', e));
})();
