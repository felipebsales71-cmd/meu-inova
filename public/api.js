const API = (() => {
  const getToken = () => sessionStorage.getItem('mi_token') || '';

  async function request(path, opts = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(opts.headers || {})
    };
    if (getToken()) headers.Authorization = `Bearer ${getToken()}`;
    const res = await fetch(path, { ...opts, headers });
    let data = null;
    try { data = await res.json(); } catch { data = {}; }
    if (!res.ok) throw new Error(data.detail || data.message || `Falha na API (${res.status}).`);
    return data;
  }

  return {
    status: () => request('/api/system/status'),
    login: (role, identifier, password) => request(`/api/auth/${role}/login`, {
      method: 'POST', body: JSON.stringify({ identifier, password })
    }),
    forgot: (role, identifier) => request('/api/auth/forgot-password', {
      method: 'POST', body: JSON.stringify({ role, identifier })
    }),
    getStudent: (id) => request(`/api/students/${id}`),
    listStudents: () => request('/api/admin/students'),
    listPayments: () => request('/api/admin/payments'),
    studentPayments: () => request('/api/student/payments'),
    requests: () => request('/api/student/requests'),
    createRequest: (type, text) => request('/api/student/requests', {
      method: 'POST', body: JSON.stringify({ type, text })
    }),
    updateStudent: (id, patch) => request(
      document.body.dataset.portal === 'admin' ? `/api/admin/students/${id}` : '/api/student/profile',
      { method: 'PATCH', body: JSON.stringify(patch) }
    ),
    createStudent: (payload) => request('/api/admin/students', {
      method: 'POST', body: JSON.stringify(payload)
    }),
    setAccess: (id, access) => request(`/api/admin/students/${id}/access`, {
      method: 'POST', body: JSON.stringify({ access })
    }),
    sendPasswordReset: (id) => request(`/api/admin/students/${id}/password-reset`, { method: 'POST' }),
    changeOwnPassword: (current, next) => request('/api/student/change-password', {
      method: 'POST', body: JSON.stringify({ current_password: current, new_password: next })
    }),
    registerPayment: (id, amount) => request(`/api/admin/payments/${encodeURIComponent(id)}/register`, {
      method: 'POST', body: JSON.stringify({ amount: Number(amount) })
    }),
    addCharge: (studentId, desc, due, amount) => request('/api/admin/payments', {
      method: 'POST', body: JSON.stringify({
        student_id: Number(studentId), description: desc, due_date: due, amount_due: Number(amount)
      })
    }),
    settings: () => request('/api/admin/notification-settings'),
    saveSettings: (patch) => request('/api/admin/notification-settings', {
      method: 'PUT', body: JSON.stringify(patch)
    }),
    logs: () => request('/api/admin/notification-logs'),
    checkOverdue: () => request('/api/admin/notifications/check-overdue', { method: 'POST' }),
    audit: () => request('/api/admin/audit')
  };
})();
