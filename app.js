const $ = s => document.querySelector(s);
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const config = window.SUPABASE_CONFIG || {};
let client, profile, students = [], entries = [], currentView = 'dashboard';
let loadVersion = 0;
function show(el, visible) { el.hidden = !visible; }
function toast(message) { const el = $('#toast'); el.textContent = message; el.classList.add('visible'); clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('visible'), 3000); }
function setError(message) { $('#error').textContent = message; show($('#error'), !!message); }
function niceDate(value) { const d = new Date(value); return Number.isNaN(d.valueOf()) ? '' : new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' }).format(d); }
function nameFor(id) { return students.find(s => s.id === id)?.name || (profile?.id === id ? profile.name : '학생'); }
function entryHTML(entry) { const positive = entry.points > 0; return `<div class="record"><div class="record-symbol ${positive ? 'positive' : 'negative'}">${positive ? '✦' : '!'}</div><div class="record-main"><strong>${escapeHTML(entry.reason)}</strong><span>${escapeHTML(nameFor(entry.student_id))} · ${niceDate(entry.created_at)}</span></div><div class="record-points ${positive ? 'plus' : 'minus'}">${positive ? '+' : ''}${entry.points}<small>점</small></div></div>`; }
function renderRecords(target, list) { target.innerHTML = list.length ? list.map(entryHTML).join('') : '<div class="empty"><span>✳</span><strong>아직 기록이 없어요</strong><p>새로운 기록이 생기면 이곳에서 확인할 수 있어요.</p></div>'; }
function render() {
  const plus = entries.reduce((n, e) => n + Math.max(0, e.points), 0);
  const minus = entries.reduce((n, e) => n + Math.max(0, -e.points), 0);
  $('#stat-plus').innerHTML = `${plus}<small>점</small>`; $('#stat-minus').innerHTML = `${minus}<small>점</small>`; $('#stat-total').innerHTML = `${plus - minus}<small>점</small>`;
  renderRecords($('#recent-list'), entries.slice(0, 5));
  const filter = $('#history-filter').value;
  const filtered = entries.filter(e => filter === 'all' || (filter === 'plus' ? e.points > 0 : e.points < 0));
  $('#history-count').textContent = filtered.length; renderRecords($('#history-list'), filtered);
  const visibleStudents = students.filter(s => s.role === 'student' && s.name.toLowerCase().includes($('#student-search').value.trim().toLowerCase()));
  $('#student-count').textContent = visibleStudents.length;
  $('#student-list').innerHTML = visibleStudents.length ? visibleStudents.map(s => { const total = entries.filter(e => e.student_id === s.id).reduce((sum, e) => sum + e.points, 0); return `<div class="student-row"><div class="student-avatar">${escapeHTML(s.name.slice(0, 1))}</div><div class="student-info"><strong>${escapeHTML(s.name)}</strong><span>${escapeHTML(s.class_name || '학급 미지정')}</span></div><strong class="student-score">${total}점</strong></div>`; }).join('') : '<div class="empty"><span>✳</span><strong>표시할 학생이 없어요</strong></div>';
  $('#student').innerHTML = '<option value="">학생을 선택해 주세요</option>' + students.filter(s => s.role === 'student').map(s => `<option value="${escapeHTML(s.id)}">${escapeHTML(s.name)}${s.class_name ? ` (${escapeHTML(s.class_name)})` : ''}</option>`).join('');
}
function setView(view) { if (view === 'students' && profile?.role !== 'teacher') return; currentView = view; ['dashboard', 'history', 'students'].forEach(v => show($(`#view-${v}`), v === view)); document.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === view)); $('#breadcrumb').textContent = { dashboard: '대시보드', history: '상벌점 기록', students: '학생 관리' }[view]; }
async function fetchAll(table, columns, order, ascending = true) {
  const rows = []; const pageSize = 500;
  for (let start = 0; ; start += pageSize) {
    const result = await client.from(table).select(columns).order(order, { ascending }).order('id', { ascending }).range(start, start + pageSize - 1);
    if (result.error) return result;
    rows.push(...result.data);
    if (result.data.length < pageSize) return { data: rows, error: null };
  }
}
async function loadData() {
  const version = ++loadVersion; show($('#loading'), true); setError('');
  const { data: { user }, error: userError } = await client.auth.getUser();
  if (version !== loadVersion) return;
  if (userError || !user) { showLogin(); return; }
  const { data: p, error: profileError } = await client.from('profiles').select('id,name,role,class_name').eq('id', user.id).single();
  if (version !== loadVersion) return;
  show($('#login'), false); show($('#app'), true);
  if (profileError || !p) { show($('#loading'), false); setError('계정 정보를 불러오지 못했어요. 관리자에게 문의해 주세요.'); return; }
  profile = p; $('#user-name').textContent = p.name; $('#user-role').textContent = p.role === 'teacher' ? '선생님' : '학생'; $('#greeting').textContent = `${p.name}님, 오늘도 반가워요!`;
  $('#dashboard-subtitle').textContent = p.role === 'teacher' ? '우리 반의 소중한 순간을 기록해요.' : '나의 작은 성장을 확인해 보세요.';
  document.querySelectorAll('.teacher-only').forEach(el => show(el, p.role === 'teacher'));
  const [profilesResult, entriesResult] = await Promise.all([fetchAll('profiles', 'id,name,role,class_name', 'name'), fetchAll('point_entries', 'id,student_id,points,reason,created_at', 'created_at', false)]);
  if (version !== loadVersion) return;
  show($('#loading'), false);
  if (profilesResult.error || entriesResult.error) { setError('기록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'); return; }
  students = profilesResult.data; entries = entriesResult.data; render(); setView(currentView === 'students' && p.role !== 'teacher' ? 'dashboard' : currentView);
}
function showLogin() { ++loadVersion; profile = null; entries = []; students = []; currentView = 'dashboard'; show($('#app'), false); show($('#login'), true); }
function openForm() { if (profile?.role !== 'teacher') return; $('#form-error').textContent = ''; $('#score-form').reset(); show($('#modal'), true); $('#student').focus(); }
function closeForm() { show($('#modal'), false); }
if (!config.url || !config.key || !window.supabase) { show($('#setup'), true); }
else {
  client = window.supabase.createClient(config.url, config.key);
  $('#login-form').addEventListener('submit', async event => { event.preventDefault(); const button = event.submitter; button.disabled = true; $('#login-error').textContent = ''; const { error } = await client.auth.signInWithPassword({ email: $('#email').value.trim(), password: $('#password').value }); button.disabled = false; if (error) $('#login-error').textContent = '이메일 또는 비밀번호를 확인해 주세요.'; else { $('#password').value = ''; await loadData(); } });
  async function logout() { await client.auth.signOut(); closeForm(); showLogin(); }
  $('#logout').addEventListener('click', logout); $('#mobile-logout').addEventListener('click', logout);
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
  document.querySelectorAll('[data-open-form]').forEach(button => button.addEventListener('click', openForm)); document.querySelectorAll('[data-close-form]').forEach(button => button.addEventListener('click', closeForm));
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !$('#modal').hidden) closeForm(); });
  $('#history-filter').addEventListener('change', render); $('#student-search').addEventListener('input', render);
  $('#score-form').addEventListener('submit', async event => { event.preventDefault(); const button = event.submitter; button.disabled = true; $('#form-error').textContent = ''; const points = Number($('#points').value) * ($('#kind').value === 'plus' ? 1 : -1); const { error } = await client.rpc('award_points', { target_student: $('#student').value, point_value: points, entry_reason: $('#reason').value.trim() }); button.disabled = false; if (error) { $('#form-error').textContent = '저장하지 못했어요. 학생과 점수, 사유를 확인해 주세요.'; return; } closeForm(); toast('기록을 저장했어요!'); await loadData(); });
  client.auth.getSession().then(({ data }) => data.session ? loadData() : showLogin());
  client.auth.onAuthStateChange((event) => { if (event === 'SIGNED_OUT') showLogin(); });
}
