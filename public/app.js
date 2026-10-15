const $ = (selector) => document.querySelector(selector);
const form = $('#search-form');
const fields = ['role', 'location', 'seniority', 'keywords'];
const state = { all: [], filter: 'All', saved: new Set(JSON.parse(localStorage.getItem('role-radar-saved') || '[]')), tab: 'discover', hasSearched: false };
const savedPrefs = JSON.parse(localStorage.getItem('role-radar-prefs') || '{}');
for (const field of fields) if (field !== 'seniority' && savedPrefs[field] !== undefined) $(`#${field}`).value = savedPrefs[field];
$('#seniority').value = 'Internship';
let apiVerified = false;
fetch('/api/health').then(async response => ({ response, data: await response.json() })).then(({ response, data }) => {
  apiVerified = response.ok && data.apiVerified === true && data.keyMatchesExpected === true;
  $('#api-status').textContent = apiVerified ? 'Live API key verified' : (data.error || 'TinyFish API unavailable');
  $('#api-status-dot').style.background = apiVerified ? '#9adc66' : '#e47c69';
  $('#api-status-dot').style.boxShadow = apiVerified ? '0 0 8px #90df69' : '0 0 8px #e47c69';
}).catch(() => {
  $('#api-status').textContent = 'TinyFish API check failed';
  $('#api-status-dot').style.background = '#e47c69';
});
fetch('/api/session').then(response => response.json()).then(data => {
  if (!data.authenticated) location.replace('/login');
  else $('#profile-user').textContent = data.user?.id || 'Demo user';
}).catch(() => location.replace('/login'));

function prefs() { return Object.fromEntries(fields.map(field => [field, $(`#${field}`).value.trim()])); }
function escapeHtml(value = '') { return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }
function initials(company) { return (company || 'R').split(/\s+/).slice(0, 2).map(word => word[0] || '').join('').toUpperCase(); }
function saveState() {
  localStorage.setItem('role-radar-prefs', JSON.stringify(prefs()));
  localStorage.setItem('role-radar-saved', JSON.stringify([...state.saved]));
  $('#saved-count').textContent = state.saved.size;
}
function countTypes(list) {
  $('#count-all').textContent = list.length;
}
function render() {
  const isSaved = state.tab === 'saved';
  const searchText = prefs();
  let list = isSaved ? state.all.filter(item => state.saved.has(item.id)) : [...state.all];
  list = list.filter(item => item.type === 'Internship');
  if (state.filter !== 'All') list = list.filter(item => item.type === state.filter);
  if ($('#high-match').checked) list = list.filter(item => item.score >= 70);
  if ($('#sort-select').value === 'newest') list.reverse(); else list.sort((a, b) => b.score - a.score);
  countTypes(isSaved ? state.all.filter(item => state.saved.has(item.id)) : state.all);
  $('#nav-count').textContent = state.all.length;
  $('#saved-count').textContent = state.saved.size;
  $('#results-list').innerHTML = list.map(item => `<article class="job-card"><div class="job-top"><div class="company-avatar">${escapeHtml(initials(item.company))}</div><div class="job-main"><h3>${escapeHtml(item.title)}</h3><div class="company-line">${escapeHtml(item.company)} <span>·</span> ${escapeHtml(item.location || searchText.location || 'See listing')}</div></div><div class="job-actions"><span class="match-pill">${item.score}% fit</span><button class="save-button ${state.saved.has(item.id) ? 'saved' : ''}" data-save="${escapeHtml(item.id)}" aria-label="${state.saved.has(item.id) ? 'Remove saved role' : 'Save role'}">${state.saved.has(item.id) ? '♥' : '♡'}</button></div></div><div class="job-meta"><span class="tag source">${escapeHtml(item.source || 'Career site')}</span><span class="tag kind">${escapeHtml(item.type || 'Full-time')}</span><span class="tag">${item.fetched ? 'Page read' : 'Live result'}</span></div>${item.snippet ? `<p class="job-description">${escapeHtml(item.snippet)}</p>` : ''}<div class="job-bottom"><div class="matched-tags">${(item.matchedKeywords || []).map(word => `<span>#${escapeHtml(word)}</span>`).join('')}</div><a class="apply-link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">View opening ↗</a></div></article>`).join('');
  $('#status-panel').classList.toggle('hidden', list.length > 0 || !state.hasSearched);
  $('#results-list').classList.toggle('hidden', list.length === 0);
  if (list.length === 0 && state.hasSearched) {
    $('#status-panel').classList.remove('hidden');
    $('#status-panel').innerHTML = `<div class="empty-graphic"><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div><div class="empty-star">${isSaved ? '♡' : '⌕'}</div></div><h3>${isSaved ? 'Your internship shortlist starts here.' : 'No internship matches surfaced yet.'}</h3><p>${isSaved ? 'Save interesting internship roles as you browse and they’ll show up here.' : 'Try a broader role or location, or remove a keyword to widen the internship search.'}</p>${isSaved ? '' : '<button class="text-button" id="retry-search">Adjust preferences <span>→</span></button>'}`;
  } else if (!state.hasSearched) {
    $('#status-panel').innerHTML = `<div class="empty-graphic"><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div><div class="empty-star">✳</div><div class="mini-card one">↗ &nbsp; Internship fit</div><div class="mini-card two">◎ &nbsp; Live listings</div></div><h3>Your next internship is out there.</h3><p>Tell us your preferred role, location, and keywords. We’ll search live company career pages and job portals for current internships.</p><button class="text-button" id="sample-search">Find internships <span>→</span></button>`;
  }
  $('#agent-card').classList.toggle('hidden', !state.all.length || isSaved);
  $('#pagination-note').classList.toggle('hidden', !state.all.length || isSaved);
  $('#pagination-note').textContent = state.all.length ? `${state.all.length} UNIQUE LIVE PAGES · RANKED FOR YOUR PREFERENCES` : '';
  $('#results-title').textContent = isSaved ? 'Your saved internships.' : state.all.length ? `${state.all.length} internship ${state.all.length === 1 ? 'match' : 'matches'}.` : 'Your next internship starts here.';
  $('#results-subtitle').textContent = isSaved ? 'The internship opportunities you want to come back to.' : state.all.length ? 'Sorted by fit. Check the source page for the latest details.' : 'Set your preferences and we’ll find current internship openings.';
  $('#crumb-current').textContent = isSaved ? 'Saved roles' : 'Discover';
  document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.tab === state.tab));
}

function showLoading() {
  state.hasSearched = true;
  $('#status-panel').classList.add('hidden'); $('#results-list').classList.add('hidden'); $('#agent-card').classList.add('hidden'); $('#pagination-note').classList.add('hidden'); $('#loading-panel').classList.remove('hidden');
  $('#loading-title').textContent = 'Scanning the live web';
  $('#loading-copy').textContent = 'TinyFish Search is finding current openings across multiple sources.';
  $('#step-search').classList.add('active'); $('#step-fetch').classList.remove('active'); $('#step-agent').classList.remove('active'); $('#step-match').classList.remove('active');
  $('#search-button').disabled = true; $('#search-button span').textContent = 'Searching live sources…';
}
function hideLoading() { $('#loading-panel').classList.add('hidden'); $('#search-button').disabled = false; $('#search-button span').textContent = 'Find my matches'; }

async function runSearch(event) {
  event?.preventDefault();
  state.tab = 'discover'; state.filter = 'All'; saveState(); showLoading();
  window.setTimeout(() => { $('#step-fetch').classList.add('active'); $('#loading-copy').textContent = 'TinyFish Fetch is reading live pages and collecting useful context.'; }, 900);
  window.setTimeout(() => { $('#step-agent').classList.add('active'); $('#loading-copy').textContent = 'TinyFish Agent is opening one discovered careers page and scraping dynamic listings.'; }, 2200);
  try {
    const response = await fetch('/api/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(prefs()) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Search failed.');
    $('#step-match').classList.add('active');
    $('#loading-copy').textContent = 'Scoring, filtering, and deduplicating the openings.';
    state.all = data.listings || [];
    apiVerified = data.stats?.liveApiData === true;
    $('#api-status').textContent = apiVerified ? 'Live API key verified' : 'Live API not verified';
    $('#api-status-dot').style.background = apiVerified ? '#9adc66' : '#e47c69';
    $('#stat-sources').textContent = data.stats?.sourceCount ?? 0;
    $('#stat-fresh').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    $('#freshness').textContent = `TINYFISH LIVE · ${data.stats?.pagesRead ?? 0} FETCHED · ${data.stats?.agentRuns ?? 0} BROWSER SCANS`;
    $('#agent-summary').textContent = data.stats?.agentRuns
      ? `Browser Agent scanned one live page and returned ${data.stats.agentOpenings || 0} openings. This Agent run may use paid credits.`
      : 'The automatic Browser Agent scan did not run because Search found no pages. Agent runs may use paid credits.';
    render();
    if (data.warnings?.length) showToast(`Some sources could not be read: ${data.warnings[0]}`);
    else if (!state.all.length) showToast('No listings found yet. Try broadening your search.');
  } catch (error) {
    state.all = [];
    $('#status-panel').classList.remove('hidden');
    $('#status-panel').innerHTML = `<div class="empty-graphic"><div class="empty-star">!</div></div><h3>We couldn’t finish that search.</h3><p>${escapeHtml(error.message)}</p><button class="text-button" id="retry-search">Try again <span>→</span></button>`;
    $('#results-list').classList.add('hidden');
  } finally { hideLoading(); }
}

let toastTimer;
function showToast(message) {
  let toast = $('#toast');
  if (!toast) { toast = document.createElement('div'); toast.id = 'toast'; toast.className = 'toast'; document.body.appendChild(toast); }
  toast.textContent = message; toast.classList.add('shown'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('shown'), 4500);
}

form.addEventListener('submit', runSearch);
for (const field of fields) $(`#${field}`).addEventListener('change', saveState);
$('#results-list').addEventListener('click', event => {
  const button = event.target.closest('[data-save]'); if (!button) return;
  const id = button.dataset.save; state.saved.has(id) ? state.saved.delete(id) : state.saved.add(id); saveState(); render();
});
document.addEventListener('click', event => {
  if (event.target.id === 'sample-search') runSearch(event);
  if (event.target.id === 'retry-search') { state.hasSearched = false; render(); $('#role').focus(); }
});
document.querySelectorAll('.filter-chip').forEach(button => button.addEventListener('click', () => {
  state.filter = button.dataset.filter; document.querySelectorAll('.filter-chip').forEach(chip => chip.classList.toggle('selected', chip === button)); render();
}));
document.querySelectorAll('.nav-item').forEach(button => button.addEventListener('click', () => { state.tab = button.dataset.tab; state.filter = 'All'; render(); }));
$('#filter-toggle').addEventListener('click', () => $('#filter-bar').classList.toggle('hidden'));
$('#high-match').addEventListener('change', render); $('#sort-select').addEventListener('change', render);
$('#reset-prefs').addEventListener('click', () => { for (const field of fields) localStorage.removeItem('role-radar-prefs'); location.reload(); });
$('#logout-button').addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' });
  location.replace('/login');
});
$('#help-button').addEventListener('click', () => $('#about-dialog').showModal()); $('#close-dialog').addEventListener('click', () => $('#about-dialog').close());
$('#about-dialog').addEventListener('click', event => { if (event.target === $('#about-dialog')) $('#about-dialog').close(); });
$('#agent-button').addEventListener('click', async event => {
  const button = event.currentTarget;
  if (!state.all.length) return;
  button.disabled = true; button.textContent = 'Agent is scanning…';
  $('#agent-card .agent-copy span').textContent = 'TinyFish Agent is opening another live listing page. This may take up to a minute and may use paid credits.';
  try {
    const prefsNow = prefs();
    const target = state.all.find(item => /greenhouse|lever|workday/i.test(item.url)) || state.all[0];
    const response = await fetch('/api/agent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...prefsNow, url: target.url }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Agent scan failed.');
    const merged = new Map(state.all.map(item => [item.id, item]));
    for (const item of data.listings || []) merged.set(item.id, item);
    state.all = [...merged.values()].sort((a, b) => b.score - a.score); render();
    $('#freshness').textContent = 'AGENT VERIFIED · JUST NOW';
    if (!(data.listings || []).length) showToast('The Agent reached the page but found no structured openings there.');
  } catch (error) { showToast(error.message); }
  finally { button.disabled = false; button.innerHTML = 'Scan another <span>↗</span>'; $('#agent-card .agent-copy span').textContent = 'TinyFish Agent automatically scanned one page for this search. You can optionally scan another page; that run may use paid credits.'; }
});
render();
