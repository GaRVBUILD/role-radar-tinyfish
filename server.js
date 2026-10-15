import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const root = fileURLToPath(new URL('.', import.meta.url));
const envFileValues = {};
if (existsSync(join(root, '.env'))) {
  const envText = await readFile(join(root, '.env'), 'utf8');
  for (const line of envText.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match) {
      envFileValues[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
      if (process.env[match[1]] === undefined) process.env[match[1]] = envFileValues[match[1]];
    }
  }
}

const PORT = Number(process.env.PORT || 3000);
// An app-local .env key intentionally takes precedence so the key being verified is the one used by requests.
const API_KEY = String(envFileValues.TINYFISH_API_KEY || process.env.TINYFISH_API_KEY || '').trim();
const EXPECTED_API_KEY_SHA256 = String(envFileValues.TINYFISH_API_KEY_SHA256 || process.env.TINYFISH_API_KEY_SHA256 || '').trim().toLowerCase();
const DEMO_USER_ID = 'intern-demo';
const DEMO_PASSWORD = 'Internship2026!';
const COOKIE_NAME = 'role_radar_session';
const SESSION_MAX_AGE = 8 * 60 * 60;
const SESSION_SECRET = randomBytes(32);
const DEMO_PASSWORD_SALT = randomBytes(16);
const DEMO_PASSWORD_HASH = scryptSync(DEMO_PASSWORD, DEMO_PASSWORD_SALT, 64);
const loginAttempts = new Map();
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };

function send(res, status, body, type = 'application/json; charset=utf-8', headers = {}) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', ...headers });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

function sign(payload) {
  return createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
}

function sessionCookie(req) {
  const cookieHeader = req.headers.cookie || '';
  return cookieHeader.split(';').map(part => part.trim()).find(part => part.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1) || '';
}

function sessionUser(req) {
  const token = sessionCookie(req);
  const [payload, signature] = token.split('.');
  if (!payload || !signature || signature.length !== sign(payload).length) return null;
  const actual = Buffer.from(signature);
  const expected = Buffer.from(sign(payload));
  if (!timingSafeEqual(actual, expected)) return null;
  try {
    const [userId, expires] = Buffer.from(payload, 'base64url').toString().split('|');
    if (userId !== DEMO_USER_ID || Number(expires) < Date.now()) return null;
    return { id: userId };
  } catch { return null; }
}

function setSession(res) {
  const payload = Buffer.from(`${DEMO_USER_ID}|${Date.now() + SESSION_MAX_AGE * 1000}`).toString('base64url');
  const token = `${payload}.${sign(payload)}`;
  return `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE}`;
}

function safeEqualText(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && timingSafeEqual(a, b);
}

async function readBody(req) {
  let data = '';
  for await (const chunk of req) {
    data += chunk;
    if (data.length > 50_000) throw new Error('Request is too large.');
  }
  return JSON.parse(data || '{}');
}

function clean(value, max = 140) {
  return String(value || '').replace(/[<>\r\n]/g, ' ').trim().slice(0, max);
}

function words(value) {
  return String(value || '').toLowerCase().split(/[^a-z0-9+#.]+/).filter(word => word.length > 1);
}

function sourceName(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '').replace(/^jobs\./, '');
    if (host.includes('linkedin')) return 'LinkedIn';
    if (host.includes('indeed')) return 'Indeed';
    if (host.includes('wellfound')) return 'Wellfound';
    if (host.includes('greenhouse')) return 'Greenhouse';
    if (host.includes('lever')) return 'Lever';
    if (host.includes('workday')) return 'Workday';
    return host.split('.')[0].replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  } catch { return 'Career site'; }
}

function countryFor(location) {
  const value = String(location || '').trim();
  if (/^[a-z]{2}$/i.test(value)) return value.toUpperCase();
  const cityCountries = [
    [/bengaluru|bangalore|mumbai|delhi|hyderabad|pune|chennai|kolkata|noida|gurugram|gurgaon/i, 'IN'],
    [/new york|san francisco|seattle|austin|boston|chicago|los angeles|united states|\busa\b/i, 'US'],
    [/london|manchester|edinburgh|united kingdom|\buk\b/i, 'GB'],
    [/toronto|vancouver|montreal|canada/i, 'CA'],
    [/sydney|melbourne|australia/i, 'AU'],
    [/berlin|munich|germany/i, 'DE'],
    [/paris|france/i, 'FR'],
    [/tokyo|japan/i, 'JP']
  ];
  return cityCountries.find(([pattern]) => pattern.test(value))?.[1] || 'IN';
}

function normalizeUrl(value) {
  try {
    const url = new URL(value);
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) if (/^(utm_|ref|source|trk)/i.test(key)) url.searchParams.delete(key);
    return url.toString().replace(/\/$/, '').toLowerCase();
  } catch { return String(value || '').toLowerCase(); }
}

function isOpening(result) {
  const title = String(result.title || '').toLowerCase();
  const text = `${title} ${String(result.snippet || '').toLowerCase()}`;
  let url;
  try { url = new URL(result.url); } catch { return false; }
  const path = url.pathname.toLowerCase();
  if (/all openings|all jobs|job search|jobs in .+|\d[\d,]*\+? .+ jobs/.test(title)) return false;
  if (/linkedin\.com$/.test(url.hostname) && /\/jobs\/view\//.test(path)) return true;
  if (/jobs\.lever\.co$/.test(url.hostname) && path.split('/').filter(Boolean).length >= 2) return true;
  if (/greenhouse\.io$/.test(url.hostname) && /\/jobs\/\d+/.test(path)) return true;
  if (/myworkdayjobs\.com$/.test(url.hostname) && /\/job\//.test(path)) return true;
  if (/indeed\./.test(url.hostname) && /viewjob/.test(path)) return true;
  if (/wellfound\.com$/.test(url.hostname) && /\/jobs\/[^/]+/.test(path)) return true;
  if (/\/job-detail\/|\/jobs\/view\/|\/careers\/job\//.test(path)) return true;
  if (/(^|\/)(search|jobs|careers)(\/|$)/.test(path) || /-jobs\.html$/.test(path)) return false;
  return Boolean(/\b(intern|internship|engineer|developer|designer|analyst|manager|scientist|specialist|associate|consultant|researcher)\b/.test(title) && !/open positions|career opportunities/.test(text));
}

function inferCompany(result) {
  const title = String(result.title || '');
  const at = title.match(/\bat\s+(.+?)(?:\s*[|–—].*)?$/i);
  if (at?.[1]) return clean(at[1].replace(/\s+(jobs?|careers?)$/i, ''), 90);
  try {
    const parsed = new URL(result.url);
    let slug = '';
    if (/linkedin\.com$/.test(parsed.hostname)) slug = parsed.pathname.match(/-at-(.+)-\d+\/?$/i)?.[1] || '';
    if (/jobs\.lever\.co$/.test(parsed.hostname)) slug = parsed.pathname.split('/')[1] || '';
    if (/greenhouse\.io$/.test(parsed.hostname)) slug = parsed.pathname.split('/')[1] || '';
    if (slug) return slug.replace(/[-_]/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
  } catch {}
  const firstPart = title.split(/\s+[-–|]\s+/)[0];
  if (firstPart && firstPart.length < 50 && /\b(intern|engineer|developer|designer|analyst|manager|scientist|specialist)\b/i.test(title.slice(firstPart.length))) return clean(firstPart, 90);
  return clean(result.site_name || sourceName(result.url), 90);
}

function classify(title, snippet) {
  const titleText = String(title || '').toLowerCase();
  const snippetText = String(snippet || '').toLowerCase();
  return /\bintern(?:ship)?\b|\bco[- ]?op\b/.test(titleText) || /(?:job|employment|opportunity)\s*type\s*:\s*internship|internship program/i.test(snippetText)
    ? 'Internship' : 'Full-time';
}

function scoreListing(item, prefs) {
  const text = `${item.title} ${item.snippet} ${item.company} ${item.location}`.toLowerCase();
  const desiredRole = words(prefs.role);
  const roleHits = desiredRole.filter(word => text.includes(word)).length;
  const keywordList = clean(prefs.keywords, 400).split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  const keywordHits = keywordList.filter(word => text.includes(word)).length;
  const locationHit = !prefs.location || text.includes(prefs.location.toLowerCase()) || /remote|anywhere|worldwide/.test(text);
  const seniority = String(prefs.seniority || '').toLowerCase();
  const seniorityHit = !seniority || (seniority === 'internship'
    ? item.type === 'Internship'
    : seniority === 'entry level' ? /entry|junior|associate|graduate|new grad|early career|intern/.test(text)
      : seniority === 'mid level' ? /mid.level|ii\b|2\+ years|3\+ years/.test(text)
        : seniority === 'senior' ? /senior|staff|principal|lead/.test(text) : true);
  const score = 48 + Math.min(22, roleHits * 7) + Math.min(18, keywordHits * 6) + (locationHit ? 8 : 0) + (seniorityHit ? 4 : 0);
  return { score: Math.min(99, score), matchedKeywords: [...new Set([...desiredRole, ...keywordList].filter(word => text.includes(word)))].slice(0, 5) };
}

function buildQueries(prefs) {
  const role = clean(prefs.role, 100) || 'software engineering';
  const location = clean(prefs.location, 80);
  const seniority = clean(prefs.seniority, 40);
  const keywords = clean(prefs.keywords, 180);
  const terms = [role, 'internship intern student program', keywords].filter(Boolean).join(' ');
  const where = location ? ` ${location}` : '';
  return [
    `${terms}${where} internship jobs site:linkedin.com/jobs/view OR site:in.indeed.com/viewjob OR site:lever.co`,
    `${role} internship intern ${location} ${keywords} student careers openings site:jobs.lever.co OR site:boards.greenhouse.io/jobs`,
    `${terms}${where} internship apply company careers site:myworkdayjobs.com OR site:wellfound.com/jobs OR site:jobs.ashbyhq.com`
  ];
}

async function tinyfish(url, options = {}) {
  if (!API_KEY) throw Object.assign(new Error('TinyFish API key is missing. Add TINYFISH_API_KEY to your environment or a local .env file.'), { status: 503 });
  if (!apiKeyMatchesExpected()) throw Object.assign(new Error('TinyFish API key verification failed. Add the matching TINYFISH_API_KEY_SHA256 fingerprint to the server .env file.'), { status: 503 });
  const response = await fetch(url, {
    ...options,
    headers: { 'X-API-Key': API_KEY, ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers }
  });
  const text = await response.text();
  if (!response.ok) {
    let detail = text;
    try { detail = JSON.parse(text).message || JSON.parse(text).error || text; } catch {}
    throw Object.assign(new Error(`TinyFish returned ${response.status}: ${String(detail).slice(0, 240)}`), { status: response.status });
  }
  try { return JSON.parse(text); } catch { return text; }
}

function apiKeyMatchesExpected() {
  if (!API_KEY) return false;
  if (!/^[a-f0-9]{64}$/.test(EXPECTED_API_KEY_SHA256)) return false;
  const actual = Buffer.from(createHash('sha256').update(API_KEY).digest('hex'));
  const expected = Buffer.from(EXPECTED_API_KEY_SHA256);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function verifyTinyFishApi() {
  const status = { configured: Boolean(API_KEY), keyMatchesExpected: apiKeyMatchesExpected(), apiVerified: false, provider: 'TinyFish Search API' };
  if (!status.keyMatchesExpected) {
    status.error = API_KEY ? 'The API key is missing its expected fingerprint or does not match it.' : 'The TinyFish API key is not configured.';
    return status;
  }
  try {
    await tinyfish('https://api.search.tinyfish.ai?query=TinyFish%20API%20connection%20check&location=IN&language=en');
    status.apiVerified = true;
  } catch (error) {
    status.error = error.message;
  }
  return status;
}

async function discover(prefs) {
  const queries = buildQueries(prefs);
  const searches = await Promise.allSettled(queries.map(query => tinyfish(`https://api.search.tinyfish.ai?query=${encodeURIComponent(query)}&location=${countryFor(prefs.location)}&language=en`)));
  const searchErrors = searches.filter(result => result.status === 'rejected').map(result => result.reason.message);
  const successfulSearches = searches.filter(result => result.status === 'fulfilled').length;
  if (successfulSearches === 0) {
    const failure = searches.find(result => result.status === 'rejected')?.reason;
    throw Object.assign(new Error(`TinyFish Search failed for all queries. ${searchErrors[0] || 'Check the API key and network connection.'}`), { status: failure?.status || 502 });
  }
  const candidates = searches.flatMap(result => result.status === 'fulfilled' ? (result.value.results || []) : []);
  const deduped = new Map();
  for (const result of candidates) {
    if (!result.url || !/^https?:\/\//i.test(result.url)) continue;
    if (!isOpening(result) || classify(result.title, result.snippet) !== 'Internship') continue;
    const key = normalizeUrl(result.url);
    const existing = deduped.get(key);
    if (!existing || String(result.snippet || '').length > String(existing.snippet || '').length) deduped.set(key, result);
  }
  const sources = [...deduped.values()].slice(0, 10);
  let fetched = [];
  let fetchWarning = '';
  if (sources.length) {
    try {
      const data = await tinyfish('https://api.fetch.tinyfish.ai', {
        method: 'POST', body: JSON.stringify({ urls: sources.map(item => item.url), format: 'markdown' })
      });
      fetched = data.results || [];
      fetchWarning = (data.errors || []).map(item => item.error || item.message).filter(Boolean).join('; ');
    } catch (error) { fetchWarning = error.message; }
  }
  const fetchedByUrl = new Map(fetched.map(item => [normalizeUrl(item.url || item.final_url), item]));
  const prefsClean = { role: clean(prefs.role, 100), location: clean(prefs.location, 80), seniority: clean(prefs.seniority, 40), keywords: clean(prefs.keywords, 400) };
  const listings = sources.map(item => {
    const page = fetchedByUrl.get(normalizeUrl(item.url));
    const title = clean(item.title, 180) || 'Opening found on careers page';
    const snippet = clean([item.snippet, page?.text?.slice(0, 700)].filter(Boolean).join(' '), 850);
    const company = inferCompany(item);
    const type = classify(title, snippet);
    if (type !== 'Internship') return null;
    const listing = { id: normalizeUrl(item.url), title, company, location: /\b(remote|hybrid)\b/i.test(snippet) ? (snippet.match(/\b(remote|hybrid)\b/i)?.[0] || 'See posting') : 'See posting', type, source: sourceName(item.url), url: item.url, snippet, fetched: Boolean(page), posted: 'Live source', score: 0, matchedKeywords: [] };
    const match = scoreListing(listing, prefsClean);
    return { ...listing, score: match.score, matchedKeywords: match.matchedKeywords };
  }).filter(Boolean);
  listings.sort((a, b) => b.score - a.score);
  return {
    listings, stats: { provider: 'TinyFish Search + Fetch', liveApiData: true, searchRequestsSucceeded: successfulSearches, searchedQueries: queries.length, sourcesFound: candidates.length, uniquePages: sources.length, pagesRead: fetched.length, sourceCount: new Set(listings.map(x => x.source)).size },
    queries, warnings: [...searchErrors, ...(fetchWarning ? [`Fetch: ${fetchWarning}`] : [])]
  };
}

async function agentScan(body) {
  if (!API_KEY || !apiKeyMatchesExpected()) throw Object.assign(new Error('The configured TinyFish API key is missing or failed fingerprint verification.'), { status: 503 });
  const url = clean(body.url, 500);
  if (!/^https:\/\//.test(url)) throw Object.assign(new Error('Choose a valid https listing or careers page first.'), { status: 400 });
  const goal = `Inspect this career page for currently visible job or internship openings. Do not apply, submit any form, log in, or change anything. Extract only listings genuinely shown on the page. Return JSON with an "openings" array; each item has title, company, location, type (Full-time or Internship), summary, and apply_url. Include the page URL as apply_url if no direct application link is visible. User preferences: role=${clean(body.role, 100)}, location=${clean(body.location, 80)}, seniority=${clean(body.seniority, 40)}, keywords=${clean(body.keywords, 300)}. Return up to 8 relevant listings. If no openings are visible, return an empty array.`;
  const response = await fetch('https://agent.tinyfish.ai/v1/automation/run-sse', {
    method: 'POST', headers: { 'X-API-Key': API_KEY || '', 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
    body: JSON.stringify({ url, goal, browser_profile: 'lite' }), signal: AbortSignal.timeout(150_000)
  });
  if (!response.ok) throw Object.assign(new Error(`TinyFish Agent returned ${response.status}: ${(await response.text()).slice(0, 200)}`), { status: response.status });
  const raw = await response.text();
  const events = raw.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => {
    try { return JSON.parse(line.slice(5).trim()); } catch { return null; }
  }).filter(Boolean);
  const completed = [...events].reverse().find(event => /complete|result|success/i.test(String(event.type || event.event || event.status || '')) || event.result || event.output);
  if (!completed) throw Object.assign(new Error('Agent run ended without a structured result. Try another career page.'), { status: 502 });
  let output = completed.result ?? completed.output ?? completed.data ?? completed;
  if (typeof output === 'string') {
    try { output = JSON.parse(output); } catch {
      const json = output.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
      if (json) try { output = JSON.parse(json[0]); } catch {}
    }
  }
  let openings = Array.isArray(output) ? output : output?.openings || output?.jobs || output?.listings || output?.data?.openings || [];
  openings = openings.filter(item => item && (item.title || item.role)).slice(0, 8).map((item, index) => ({
    id: normalizeUrl(item.apply_url || item.url || url) + `#${index}`,
    title: clean(item.title || item.role, 180), company: clean(item.company || sourceName(url), 90),
    location: clean(item.location || body.location || 'See listing', 100), type: /intern/i.test(item.type || '') ? 'Internship' : 'Full-time',
    source: sourceName(url), url: /^https?:\/\//i.test(item.apply_url || item.url || '') ? (item.apply_url || item.url) : url,
    snippet: clean(item.summary || item.description || '', 600), fetched: true, posted: 'Agent verified',
    score: scoreListing({ title: item.title || item.role, company: item.company, location: item.location, snippet: item.summary || item.description, type: item.type }, body).score,
    matchedKeywords: []
  }));
  return { listings: openings, eventCount: events.length };
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' }); return res.end(); }
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === 'GET' && url.pathname === '/api/health') {
      const status = await verifyTinyFishApi();
      return send(res, status.apiVerified ? 200 : 503, { ok: status.apiVerified, ...status });
    }
    if (req.method === 'GET' && url.pathname === '/api/session') {
      const user = sessionUser(req);
      return send(res, 200, { authenticated: Boolean(user), user });
    }
    if (req.method === 'POST' && url.pathname === '/api/login') {
      const remote = req.socket.remoteAddress || 'local';
      const attempts = loginAttempts.get(remote) || { count: 0, resetAt: Date.now() + 10 * 60 * 1000 };
      if (attempts.resetAt < Date.now()) { attempts.count = 0; attempts.resetAt = Date.now() + 10 * 60 * 1000; }
      if (attempts.count >= 10) return send(res, 429, { error: 'Too many attempts. Wait a few minutes and try again.' });
      const body = await readBody(req);
      const submittedId = String(body.userId || '').slice(0, 120);
      const submittedPassword = String(body.password || '').slice(0, 300);
      const submittedHash = scryptSync(submittedPassword, DEMO_PASSWORD_SALT, 64);
      const valid = safeEqualText(submittedId, DEMO_USER_ID) && timingSafeEqual(submittedHash, DEMO_PASSWORD_HASH);
      if (!valid) {
        attempts.count += 1;
        loginAttempts.set(remote, attempts);
        return send(res, 401, { error: 'That demo user ID or password does not match.' });
      }
      loginAttempts.delete(remote);
      return send(res, 200, { ok: true, user: { id: DEMO_USER_ID } }, 'application/json; charset=utf-8', { 'Set-Cookie': setSession(res) });
    }
    if (req.method === 'POST' && url.pathname === '/api/logout') {
      return send(res, 200, { ok: true }, 'application/json; charset=utf-8', { 'Set-Cookie': `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0` });
    }
    const user = sessionUser(req);
    if (req.method === 'POST' && url.pathname === '/api/search') {
      if (!user) return send(res, 401, { error: 'Please sign in to search.' });
      const body = await readBody(req);
      const prefs = { role: clean(body.role, 100), location: clean(body.location, 80), seniority: clean(body.seniority, 40), keywords: clean(body.keywords, 400) };
      const result = await discover(prefs);
      return send(res, 200, result);
    }
    if (req.method === 'POST' && url.pathname === '/api/agent') {
      if (!user) return send(res, 401, { error: 'Please sign in to use the deep scan.' });
      const body = await readBody(req);
      return send(res, 200, await agentScan(body));
    }
    if (req.method === 'GET') {
      let pathname = decodeURIComponent(url.pathname);
      if (pathname === '/') pathname = '/index.html';
      if (pathname === '/login') pathname = '/login.html';
      if ((pathname === '/' || pathname === '/index.html') && !user) return send(res, 302, '', 'text/plain; charset=utf-8', { Location: '/login' });
      if (pathname === '/login.html' && user) return send(res, 302, '', 'text/plain; charset=utf-8', { Location: '/' });
      const unauthenticatedAssets = new Set(['/login.html', '/login.css', '/login.js', '/styles.css']);
      if (!user && !unauthenticatedAssets.has(pathname)) return send(res, 302, '', 'text/plain; charset=utf-8', { Location: '/login' });
      const file = normalize(join(root, 'public', pathname.replace(/^[/\\]+/, '')));
      if (!file.startsWith(join(root, 'public'))) return send(res, 403, { error: 'Forbidden' });
      const content = await readFile(file);
      return send(res, 200, content.toString(), mime[extname(file)] || 'application/octet-stream');
    }
    return send(res, 404, { error: 'Not found' });
  } catch (error) {
    return send(res, error.status || 500, { error: error.message || 'Something went wrong.' });
  }
});

server.listen(PORT, () => console.log(`Role Radar is ready at http://localhost:${PORT}`));
