// 별도 화면으로 추가해 기존 상벌점 기능과 데이터를 분리합니다.
const sideTimetable = document.createElement('button');
sideTimetable.className = 'nav-item'; sideTimetable.dataset.view = 'timetable'; sideTimetable.innerHTML = '<span>▧</span> 수업 태도';
document.querySelector('.sidebar nav').append(sideTimetable);
const mobileTimetable = document.createElement('button'); mobileTimetable.dataset.view = 'timetable'; mobileTimetable.textContent = '수업 태도';
document.querySelector('.mobile-nav').insertBefore(mobileTimetable, $('#mobile-logout'));
const timetableView = document.createElement('section'); timetableView.id = 'view-timetable'; timetableView.hidden = true;
timetableView.innerHTML = `<div class="page-title"><div><span class="eyebrow">ONE CLASS AT A TIME ✳</span><h1>수업 태도 체크</h1><p id="lesson-intro">오늘 수업을 돌아보고 나의 태도를 체크해요.</p></div></div>
  <div class="panel lesson-panel"><div class="lesson-controls"><label>날짜<input type="date" id="lesson-date"></label><label class="teacher-only">학급<input type="text" id="lesson-class" maxlength="100" placeholder="예: 1학년 1반"></label><label class="teacher-only">학생<select id="lesson-student"></select></label></div><p class="lesson-help" id="lesson-help"></p><div id="lesson-error" class="form-error" role="alert"></div><div id="lesson-list"></div></div>
  <div class="panel schedule-editor teacher-only"><div class="panel-head"><h2>주간 시간표 설정</h2></div><p>학급, 요일, 교시가 같으면 과목이 변경됩니다. 매주 반복 적용돼요.</p><form id="schedule-form"><label>요일<select id="schedule-day"><option value="1">월요일</option><option value="2">화요일</option><option value="3">수요일</option><option value="4">목요일</option><option value="5">금요일</option><option value="6">토요일</option><option value="7">일요일</option></select></label><label>교시<input id="schedule-period" type="number" min="1" max="10" value="1" required></label><label>과목<input id="schedule-subject" type="text" maxlength="100" placeholder="과목 이름" required></label><button class="primary compact" type="submit">시간표 저장</button></form><div id="schedule-error" class="form-error" role="alert"></div></div>`;
document.querySelector('.content').append(timetableView);
sideTimetable.addEventListener('click', () => setView('timetable'));
mobileTimetable.addEventListener('click', () => setView('timetable'));
const attitudeLabels = { good: '잘했어요', okay: '보통이에요', improve: '더 노력해요' };
let timetableVersion = 0;
function koreaToday() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
function weekdayOf(date) { return new Date(`${date}T12:00:00+09:00`).getUTCDay() || 7; }
function optionsForClass(className, keep) {
  const list = students.filter(s => s.role === 'student' && s.class_name === className);
  $('#lesson-student').innerHTML = '<option value="">학생 선택</option>' + list.map(s => `<option value="${escapeHTML(s.id)}">${escapeHTML(s.name)}</option>`).join('');
  if (list.some(s => s.id === keep)) $('#lesson-student').value = keep;
}
async function loadTimetable() {
  const version = ++timetableVersion;
  if (!client || !profile || currentView !== 'timetable') return;
  const today = koreaToday(), dateInput = $('#lesson-date');
  if (!dateInput.value || !/^\d{4}-\d{2}-\d{2}$/.test(dateInput.value)) dateInput.value = today;
  dateInput.max = today;
  if (dateInput.value > today) dateInput.value = today;
  const teacher = profile.role === 'teacher';
  const classInput = $('#lesson-class');
  if (teacher && !classInput.value) classInput.value = students.find(s => s.role === 'student' && s.class_name)?.class_name || '';
  const className = teacher ? classInput.value.trim() : profile.class_name;
  if (teacher) optionsForClass(className, $('#lesson-student').value);
  const studentId = teacher ? $('#lesson-student').value : profile.id;
  const date = dateInput.value, isToday = date === today;
  $('#lesson-intro').textContent = teacher ? '학생들의 수업 태도와 학급 시간표를 확인해요.' : '오늘 수업을 돌아보고 나의 태도를 체크해요.';
  $('#lesson-help').textContent = !isToday ? '지난 날짜는 저장된 기록만 볼 수 있어요. 기록은 당일에만 작성·수정할 수 있습니다.' : teacher ? '학생을 선택하면 해당 학생의 체크 결과를 볼 수 있어요.' : '수업마다 해당하는 태도를 선택해 주세요. 다시 선택하면 수정됩니다.';
  $('#lesson-error').textContent = ''; $('#lesson-list').innerHTML = '<div class="empty">시간표를 불러오고 있어요...</div>';
  if (!className) { $('#lesson-list').innerHTML = '<div class="empty"><strong>학급을 먼저 설정해 주세요.</strong><p>학생은 선생님께 학급 설정을 요청해 주세요.</p></div>'; return; }
  if (teacher && !studentId && !isToday) { $('#lesson-list').innerHTML = '<div class="empty"><strong>학생을 선택해 주세요.</strong></div>'; return; }
  const lessonsQuery = isToday ? client.from('weekly_lessons').select('id,period,subject').eq('class_name', className).eq('weekday', weekdayOf(date)).order('period') : Promise.resolve({ data: [], error: null });
  const checksQuery = studentId ? client.from('lesson_checks').select('period,subject,attitude').eq('student_id', studentId).eq('lesson_date', date).order('period') : Promise.resolve({ data: [], error: null });
  const [lessons, checks] = await Promise.all([lessonsQuery, checksQuery]);
  if (version !== timetableVersion || currentView !== 'timetable') return;
  if (lessons.error || checks.error) { $('#lesson-list').innerHTML = ''; $('#lesson-error').textContent = '시간표를 불러오지 못했어요. 관리자에게 데이터베이스 설정을 확인해 달라고 요청해 주세요.'; return; }
  const rows = isToday ? lessons.data : checks.data;
  if (!rows.length) { $('#lesson-list').innerHTML = `<div class="empty"><span>✳</span><strong>${isToday ? '등록된 수업이 없어요' : '저장된 기록이 없어요'}</strong><p>${isToday ? '선생님이 주간 시간표를 등록할 수 있어요.' : '이 날짜에 저장된 태도 체크가 없습니다.'}</p></div>`; return; }
  $('#lesson-list').innerHTML = rows.map(lesson => {
    const check = isToday ? checks.data.find(c => c.period === lesson.period) : lesson;
    const subject = check?.subject || lesson.subject;
    const choices = Object.entries(attitudeLabels).map(([key, label]) => teacher || !isToday ? '' : `<button type="button" data-lesson-id="${lesson.id}" data-attitude="${key}" class="attitude-button ${check?.attitude === key ? 'selected' : ''}" aria-pressed="${check?.attitude === key}">${label}</button>`).join('');
    const result = teacher || !isToday ? `<span class="attitude-result">${escapeHTML(check ? attitudeLabels[check.attitude] : '미체크')}</span>` : choices;
    return `<div class="lesson-row"><div class="period-badge">${lesson.period}<small>교시</small></div><div class="lesson-subject"><strong>${escapeHTML(subject)}</strong>${check && check.subject !== lesson.subject && isToday ? `<small>현재 시간표: ${escapeHTML(lesson.subject)}</small>` : ''}</div><div class="attitude-choices">${result}</div></div>`;
  }).join('');
}
window.loadTimetable = loadTimetable;
$('#lesson-date').addEventListener('change', loadTimetable);
$('#lesson-class').addEventListener('change', loadTimetable);
$('#lesson-student').addEventListener('change', loadTimetable);
$('#lesson-list').addEventListener('click', async event => {
  const button = event.target.closest('[data-attitude]'); if (!button || profile?.role !== 'student') return;
  const selectedDate = $('#lesson-date').value;
  button.disabled = true;
  const { error } = await client.rpc('save_lesson_check', { target_lesson: Number(button.dataset.lessonId), target_date: selectedDate, selected_attitude: button.dataset.attitude });
  button.disabled = false;
  if (error) { $('#lesson-error').textContent = '저장하지 못했어요. 오늘 날짜와 학급을 확인해 주세요.'; return; }
  toast('수업 태도를 기록했어요!'); await loadTimetable();
});
$('#schedule-form').addEventListener('submit', async event => {
  event.preventDefault(); const className = $('#lesson-class').value.trim();
  if (!className) { $('#schedule-error').textContent = '위에서 학급을 입력해 주세요.'; return; }
  const button = event.submitter; button.disabled = true; $('#schedule-error').textContent = '';
  const { error } = await client.rpc('save_weekly_lesson', { target_class: className, lesson_weekday: Number($('#schedule-day').value), lesson_period: Number($('#schedule-period').value), lesson_subject: $('#schedule-subject').value.trim() });
  button.disabled = false;
  if (error) { $('#schedule-error').textContent = '저장하지 못했어요. 학급, 요일, 교시와 과목을 확인해 주세요.'; return; }
  $('#schedule-subject').value = ''; toast('주간 시간표를 저장했어요!'); await loadTimetable();
});
