// 闲时达 · Leisure Done  —  v3 UI
// 四页 SPA：对话规划 / 路线地图 / 灵感发现 / 历史行程
// -------------------------------------------------------

// ── file:// 协议检测：真实网络 API 必须在 HTTP/HTTPS 下运行 ──
(function(){
  if(window.location.protocol !== 'file:') return;
  // 在欢迎气泡下方插入引导横幅
  document.addEventListener('DOMContentLoaded', function(){
    const chat = document.getElementById('chat');
    if(!chat) return;
    const banner = document.createElement('div');
    banner.style.cssText = `
      margin:8px 0; padding:14px 16px; background:#fff8e6; border:1.5px solid #ffc533;
      border-radius:12px; font-size:13px; line-height:1.7; color:#7a5800;
    `;
    banner.innerHTML = `
      <b>⚠️ 本地预览提示：当前是 file:// 打开</b><br>
      <span style="color:#555">发布到 HTTPS 站点后不会显示这条提示；只有直接双击 HTML 时，浏览器会限制 AI、定位和地图接口。</span><br>
      <b>本地调试方式：</b>在项目根目录运行<br>
      <code style="background:#f2f2f2;padding:2px 8px;border-radius:4px;font-size:12px">python serve.py</code><br>
      然后访问 <code style="background:#f2f2f2;padding:2px 8px;border-radius:4px">http://localhost:8080</code>
    `;
    // 插在第一条 bot 消息后
    const firstMsg = chat.querySelector('.msg.bot');
    if(firstMsg && firstMsg.nextSibling) chat.insertBefore(banner, firstMsg.nextSibling);
    else chat.appendChild(banner);
  });
})();

// ===== 全局状态 =====
const S = {
  sessionId: null,
  scene: 'family',
  plans: [],
  currentPlan: null,
  currentIntent: null,
  extras: [],
  mapInstance: null,
  mapLayers: [],
  planSummary: '',
  planningMemory: null,
  routeCache: new Map(),
  history: [],
  auth: {
    token: localStorage.getItem('leisureDoneAuthToken') || '',
    user: null,
    guest: false,
  },
};

const ROUTE_CACHE_TTL_MS = 30 * 60 * 1000;
const AUTH_TOKEN_KEY = 'leisureDoneAuthToken';
localStorage.removeItem('leisureDoneGuestAccess');
window.addEventListener('beforeunload', () => S.routeCache.clear());

// ===== DOM 引用 =====
const $ = id => document.getElementById(id);
const chat        = $('chat');
const inputEl     = $('input');
const sendBtn     = $('send');
const relayMask   = $('relayMask');
const relayCard   = $('relayCard');
const guideTriggers = document.querySelectorAll('.guide-trigger');
const guideMask   = $('guideMask');
const guideClose  = $('guideClose');
const guideContent = $('guideContent');
const logoutConfirmMask = $('logoutConfirmMask');
const logoutCancelBtn = $('logoutCancelBtn');
const logoutConfirmBtn = $('logoutConfirmBtn');
const authMask    = $('authMask');
const authForm    = $('authForm');
const authUsername = $('authUsername');
const authPassword = $('authPassword');
const authSubmit  = $('authSubmit');
const authError   = $('authError');
const guestBtn    = $('guestBtn');
const logoutBtn   = $('logoutBtn');
const accountStatus = $('accountStatus');
const accountName = accountStatus?.querySelector('span:not(.leo-dot)');
const accountAvatarBtn = $('accountAvatarBtn');
const chatUserAvatar = $('chatUserAvatar');
const askChat     = $('askChat');
const askInput    = $('askInput');
const askSend     = $('askSend');
const mapTitle    = $('mapTitle');
const mapMeta     = $('mapMeta');
const mapSteps    = $('mapSteps');
const discoverList = $('discoverList');
const historyList  = $('historyList');
const acEmpty     = $('acEmpty');
const acContent   = $('acContent');
const welcomeBubble = $('welcomeBubble');

// ===== 工具 =====
function esc(s){ return (s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function scrollDown(){ chat.scrollTop = chat.scrollHeight; }
function node(html){ const d=document.createElement('div'); d.innerHTML=html.trim(); return d.firstChild; }

function uniqueList(items){
  return [...new Set((items || []).filter(Boolean))];
}

function isPlanningFollowUp(text){
  const value = String(text || '').trim();
  if(!S.planningMemory || !value) return false;
  const followUpPattern = /换(一个|一版|一套|个|地方)?|重新(来|规划|安排)|再(来|推荐|换)|不(喜欢|满意|合适)|别的|另一个|还有吗|还有别的吗|太远|太贵|便宜点|近一点|室内|户外|清淡点|低卡|不要/;
  const explicitNewStart = /重新开始|新需求|换个城市|改成(北京|上海|广州|深圳|杭州|成都|南京|天津|重庆|西安)|我一个人|单人|带孩子|亲子|和孩子|和老婆|和老公|和朋友|总共\s*\d+\s*个?人/;
  return followUpPattern.test(value) && (!explicitNewStart.test(value) || /换|不要|太远|太贵|近一点|便宜点/.test(value));
}

function planningMemorySummary(){
  const mem = S.planningMemory;
  if(!mem) return '';
  const intent = mem.intent || {};
  const members = (intent.members || []).map(m => {
    if(m.role === 'child') return `孩子${m.age || 5}岁`;
    if(m.role === 'spouse') return `配偶${m.note ? `(${m.note})` : ''}`;
    return m.role;
  }).join('、') || '无特殊成员';
  const constraints = (intent.constraints || []).map(c => c.reason || c.key).filter(Boolean).slice(0, 5).join('；') || '无特殊约束';
  const venues = uniqueList((mem.plans || []).flatMap(p => (p.steps || []).map(s => s.venue?.name))).slice(0, 8).join('、') || '暂无';
  return [
    `上一轮原始需求：${mem.userText || ''}`,
    `固定场景：${intent.scene || mem.scene || 'unknown'}`,
    `固定人数：${intent.party_size || mem.partySize || ''}人`,
    `固定城市/位置：${mem.city || ''} ${intent.location || mem.location || ''}`,
    `固定成员：${members}`,
    `固定约束：${constraints}`,
    `上一轮已推荐地点：${venues}`,
  ].filter(Boolean).join('\n');
}

function buildMemoryAwarePlanningText(text){
  if(!isPlanningFollowUp(text)) return text;
  return [
    '这是一次基于上一轮规划的修改请求。本轮用户明确修改的字段以本轮为准；其他字段必须保持上一轮的城市、位置、出行人数、同行成员、场景和约束不变。',
    '不要把朋友局改成单人/双人/亲子，不要自行更换城市，不要丢失“别太远”等约束。',
    '尽量避开上一轮已推荐地点，给出新的方案。',
    '',
    '【上一轮记忆】',
    planningMemorySummary(),
    '',
    `【本轮用户补充】${text}`,
  ].join('\n');
}

function mergeConstraintsForFollowUp(previous = [], current = []){
  const blocked = /单人|独自|亲子|孩子|双人|二人|party_size|duration_hours|用户指定duration|用户指定.*1/;
  const merged = [];
  previous.forEach(item => {
    if(!item) return;
    const key = item.key || item.reason;
    if(merged.some(existing => (existing.key || existing.reason) === key)) return;
    merged.push(item);
  });
  current.forEach(item => {
    if(!item) return;
    const reason = String(item.reason || item.key || '');
    if(blocked.test(reason)) return;
    const key = item.key || reason;
    if(merged.some(existing => (existing.key || existing.reason) === key)) return;
    merged.push(item);
  });
  return merged;
}

function normalizeFollowUpPlanData(data, wasFollowUp){
  if(!wasFollowUp || !S.planningMemory?.intent || !data?.intent) return data;
  const previous = S.planningMemory.intent;
  const fixedIntent = {
    ...data.intent,
    scene: previous.scene,
    members: previous.members || [],
    party_size: previous.party_size,
    duration_hours: previous.duration_hours,
    start_time: previous.start_time || data.intent.start_time,
    location: previous.location || data.intent.location,
    raw_text: data.intent.raw_text,
    constraints: mergeConstraintsForFollowUp(previous.constraints || [], data.intent.constraints || []),
  };
  const fixedReasoning = (data.reasoning_steps || []).map(step => {
    if(step.title === '识别场景'){
      return {
        ...step,
        detail: `${sceneLabel(fixedIntent)}，目标时长约 ${fixedIntent.duration_hours || 4} 小时`,
      };
    }
    if(step.title === '约束推断'){
      const details = (fixedIntent.constraints || []).map(c => c.reason).filter(Boolean).slice(0, 2).join('；');
      return { ...step, detail: details || '沿用上一轮约束' };
    }
    return step;
  });
  return { ...data, intent: fixedIntent, reasoning_steps: fixedReasoning };
}

function updatePlanningMemory(userText, data){
  if(!data?.intent || !Array.isArray(data?.plans)) return;
  S.planningMemory = {
    userText,
    intent: data.intent,
    plans: data.plans,
    scene: data.intent.scene,
    partySize: data.intent.party_size,
    city: S_location.city || DEFAULT_LOCATION.city,
    location: data.intent.location || getLocationPlanningName(),
    updatedAt: Date.now(),
  };
}

function currentDayPart(){
  return new Date().getHours() < 12 ? '上午' : '下午';
}

function planningTimeLabel(){
  const hour = new Date().getHours();
  if(hour < 11) return '上午';
  if(hour < 18) return '下午';
  return '明天上午';
}

function renderWelcomeBubble(){
  if(!welcomeBubble) return;
  detectHoliday();
  if(S_holiday){
    welcomeBubble.innerHTML = `${S_holiday.emoji} <strong>${S_holiday.name}快乐！</strong><br>${S_holiday.hint}<br><span style="color:var(--text-3);font-size:12px">告诉我你想怎么过，Leo 来帮你安排 🌿</span>`;
  } else {
    welcomeBubble.innerHTML = `你好！我是 <strong>Leo</strong>，你的出行规划助手。<br>说说你想怎么过这个${currentDayPart()}，我来帮你安排好一切 🌿`;
  }
}

function syncViewportLayout(){
  const isMobile = window.innerWidth < 768;
  document.body.classList.toggle('is-mobile-layout', isMobile);
  document.body.classList.toggle('is-desktop-layout', !isMobile);
}

const USER_GUIDE_MD = `# 闲时达 使用教程

关闭后可以点击左上角找到我 (｡•̀ᴗ-)✧

## 1. 登录或游客访问

打开页面后，你可以注册/登录账号，也可以先选择游客访问。

- 注册用户：历史行程会保存到数据库，之后登录还能继续查看。
- 游客访问：数据只保存在当前页面，刷新或离开后会清空。

## 2. 生成出行方案

在“智能规划”里告诉 Leo 你的想法，例如：

- 今天下午想和朋友找个地方坐坐
- 上午想带孩子去附近玩，不想走太远
- 一个人想轻松逛逛，顺便吃点东西

Leo 会根据你的时间、位置、天气和偏好生成出行方案。

## 3. 查看路线地图

生成方案后，点击“路线地图”可以查看每一站的位置和路线信息。

路线会展示步行、骑行和可用的公共交通时间。

## 4. 灵感发现

“灵感发现”会根据你的位置推荐附近地点。

如果你允许定位，会优先展示当前位置周边；如果没有定位权限，会使用天安门作为默认位置。

## 5. Leo 助手

点击“Leo 助手”可以继续追问路线、活动安排、餐厅选择或替代方案。

## 6. 历史行程

注册用户生成过的行程会出现在“历史行程”里，方便之后回顾或重新安排。

游客模式下历史不会写入数据库，刷新后会清空。`;

function renderGuideMarkdown(markdown){
  const lines = markdown.trim().split(/\r?\n/);
  const html = [];
  let inList = false;
  let titleRendered = false;
  const closeList = () => {
    if(inList){
      html.push('</ul>');
      inList = false;
    }
  };
  lines.forEach(line => {
    const text = line.trim();
    if(!text){
      closeList();
      return;
    }
    if(text.startsWith('## ')){
      closeList();
      html.push(`<h2>${esc(text.slice(3))}</h2>`);
    } else if(text.startsWith('# ')){
      closeList();
      html.push(`<h1 id="guideTitle">${esc(text.slice(2))}</h1>`);
      titleRendered = true;
    } else if(text.startsWith('- ')){
      if(!inList){
        html.push('<ul>');
        inList = true;
      }
      html.push(`<li>${esc(text.slice(2))}</li>`);
    } else {
      closeList();
      const pClass = titleRendered ? ' class="guide-hint"' : '';
      html.push(`<p${pClass}>${esc(text)}</p>`);
      titleRendered = false;
    }
  });
  closeList();
  return html.join('');
}

function openGuide(){
  if(guideContent) guideContent.innerHTML = renderGuideMarkdown(USER_GUIDE_MD);
  if(guideMask) guideMask.hidden = false;
}

function closeGuide(){
  if(guideMask) guideMask.hidden = true;
}

const CFG = () => window.APP_CONFIG || {};

function getApiBase(){
  const explicit = (CFG().API_BASE_URL || '').replace(/\/+$/, '');
  if(explicit) return explicit;
  if(window.location.protocol === 'file:') return '';
  return window.location.origin;
}

function apiUrl(path){
  const base = getApiBase();
  if(!base) return '';
  return `${base}${path}`;
}

function authHeaders(extra = {}){
  const headers = { ...extra };
  if(S.auth.token) headers.Authorization = `Bearer ${S.auth.token}`;
  return headers;
}

async function authRequest(path, options = {}){
  const target = apiUrl(path);
  if(!target) throw new Error('当前不是 HTTP/HTTPS 环境，无法连接账号服务');
  const headers = authHeaders({
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  });
  const res = await fetch(target, { ...options, headers });
  let data = null;
  try { data = await res.json(); } catch(e) {}
  if(!res.ok){
    throw new Error(localizeAuthError(data?.detail || data?.message || '账号服务暂时不可用'));
  }
  return data || {};
}

function localizeAuthError(message){
  const text = String(message || '');
  const map = {
    'Invalid username or password': '用户名或密码错误',
    'Username already exists': '该用户名已被使用',
    'Password must be at least 6 characters': '密码长度必须至少为 6 个字符',
    'Username must be at least 3 characters': '用户名长度必须至少为 3 个字符',
    'Username cannot exceed 32 characters': '用户名长度不能超过 16 个字符',
    'Password cannot exceed 128 characters': '密码长度不能超过 16 个字符',
    'Authentication required': '请先登录',
  };
  return map[text] || text;
}

const DEFAULT_LOCATION = {
  lat: 39.9087,
  lng: 116.3975,
  city: '北京',
  district: '天安门',
  businessArea: '天安门',
  address: '北京市东城区天安门',
};

// ── 后端 API（默认同源；分离部署时用 APP_CONFIG.API_BASE_URL 指向 API）──
async function tryBackend(url, options = {}){
  const target = apiUrl(url);
  if(!target) return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(target, {
      ...options,
      headers: authHeaders(options.headers || {}),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if(r.ok) return r.json();
  } catch(e) { /* 后端不可用，忽略 */ }
  return null;
}

// ── 高德 REST POI 搜索（5 秒超时，失败静默返回空数组）──
async function amapPoiSearch(keywords, types = '', city = '北京'){
  const params = new URLSearchParams({
    keywords, city, offset: '6'
  });
  if(types) params.set('types', types);
  const url = apiUrl(`/api/amap/place-search?${params}`);
  if(!url) return [];
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if(!r.ok) return [];
    const data = await r.json();
    if(data.pois?.length){
      return data.pois.map(p => ({
        name: p.name,
        address: p.address || '',
        type: p.type || '',
        lat: p.lat || 0,
        lng: p.lng || 0,
        rating: p.rating || 4.5,
        cost: p.cost || 0,
      }));
    }
    return [];
  } catch(e){ return []; }  // 超时或 CORS 失败，静默返回空，DeepSeek 用自身知识兜底
}

async function amapPoiAround(point, types = '', keywords = '', radius = 3000, offset = 12){
  if(!point?.lat || !point?.lng) return [];
  const params = new URLSearchParams({
    location: `${point.lng},${point.lat}`,
    radius: String(radius),
    offset: String(offset),
  });
  if(types) params.set('types', types);
  if(keywords) params.set('keywords', keywords);
  const url = apiUrl(`/api/amap/around?${params}`);
  if(!url) return [];
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if(!r.ok) return [];
    const data = await r.json();
    if(data.pois?.length){
      return data.pois.map(p => ({
        name: p.name,
        address: p.address || '',
        type: p.type || '',
        lat: p.lat || 0,
        lng: p.lng || 0,
        rating: p.rating || 4.5,
        cost: p.cost || 0,
      })).filter(p => p.lat && p.lng);
    }
    return [];
  } catch(e){ return []; }
}

// ── DeepSeek 直接调用 ──
async function callDeepSeek(systemPrompt, userContent, jsonMode = false){
  // file:// 协议下 fetch 会被浏览器 CORS 拦截，提前拦截给友好提示
  if(window.location.protocol === 'file:'){
    throw new Error('FILE_PROTOCOL');
  }

  const body = {
    max_tokens: 2048,
    systemPrompt,
    userContent,
    jsonMode,
  };
  let r;
  try {
    const url = apiUrl('/api/llm');
    if(!url) throw new Error('FILE_PROTOCOL');
    r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch(e) {
    throw new Error('NETWORK_ERROR');
  }
  if(r.status === 501) throw new Error('MISSING_KEY');
  if(!r.ok) throw new Error(`API_ERROR_${r.status}`);
  const d = await r.json();
  return d.content;
}

// ── 核心：用 DeepSeek + 高德 POI 生成真实规划方案 ──
async function aiPlanFromText(userText){
  // 优先使用真实定位，兜底使用内置默认位置
  const city = S_location.city || DEFAULT_LOCATION.city;
  const loc  = getLocationPlanningName();

  // Step 1: DeepSeek 提取意图关键词（快，无 POI）
  const intentJson = await callDeepSeek(
    `你是本地生活规划助手，从用户描述中提取关键信息，返回 JSON，格式：
{"scene":"family|friends|couple|solo","party_size":数字,"duration_hours":数字,
"has_child":布尔,"child_age":数字或null,"spouse_diet":"low_cal|normal|null",
"activity_keywords":["关键词1","关键词2"],"food_keywords":["关键词1"],
"start_time":"HH:MM","constraints":["简要约束1","简要约束2"]}`,
    userText,
    true
  );
  let intent;
  try { intent = JSON.parse(intentJson); } catch(e) { intent = {}; }

  // Step 2: 并行搜索高德 POI（活动 + 餐厅）
  const actKeyword = (intent.activity_keywords||[]).join(' ') || '亲子乐园 公园 展览';
  const foodKeyword = (intent.food_keywords||[]).join(' ') || '餐厅';
  const searchLoc = `${loc}${city}`;

  const [actPois, foodPois] = await Promise.all([
    amapPoiSearch(actKeyword + ' ' + loc, '060000|110000|140000', city),
    amapPoiSearch(foodKeyword + ' ' + loc, '050000', city),
  ]);

  // Step 3: DeepSeek 结合 POI 数据生成完整方案
  const poiContext = `
附近活动/景点（高德真实数据）：
${actPois.slice(0,5).map((p,i)=>`${i+1}. ${p.name}，${p.address}，评分${p.rating}，人均¥${p.cost||'未知'}`).join('\n') || '暂无数据'}

附近餐厅（高德真实数据）：
${foodPois.slice(0,5).map((p,i)=>`${i+1}. ${p.name}，${p.address}，评分${p.rating}，人均¥${p.cost||'未知'}`).join('\n') || '暂无数据'}`;

  const planJson = await callDeepSeek(
    `你是「Leisure Done」本地生活规划 AI Leo。根据用户需求和高德 POI 数据，生成 2 套个性化出行方案。

只返回纯 JSON（不要任何 markdown 代码块），格式如下：
{"intent_summary":"一句话总结","constraints":[{"key":"约束名","reason":"推断原因"}],"plans":[{"id":"plan_1","title":"方案名","highlights":["亮点1","亮点2","亮点3"],"total_minutes":180,"total_cost":200,"steps":[{"order":1,"slot":"活动","time_range":"14:00-15:30","venue_name":"场所名","venue_address":"详细地址","venue_lat":40.003,"venue_lng":116.472,"why":"具体理由"}]}]}

规则：①优先从 POI 数据选真实场所 ②POI 为空时用你对用户当前位置（${city} ${loc}）的知识推断真实场所和准确坐标 ③why 必须结合用户约束 ④生成 2 套风格不同方案 ⑤total_cost 是整个行程人均费用（元）。`,
    `用户需求：${userText}\n\n意图解析：${JSON.stringify(intent)}\n\n${poiContext}`,
    true
  );

  let aiResult;
  try { aiResult = JSON.parse(planJson); } catch(e) {
    // DeepSeek 偶尔多包一层 markdown，尝试提取
    const m = planJson.match(/\{[\s\S]*\}/);
    if(m) aiResult = JSON.parse(m[0]); else throw new Error('AI 返回格式错误');
  }

  // Step 4: 把 AI 结果转换成前端 Plan 标准格式
  const plans = (aiResult.plans || []).map(p => ({
    id: p.id || 'ai_plan',
    title: p.title || 'AI 规划方案',
    theme: 'ai',
    highlights: p.highlights || [],
    total_minutes: p.total_minutes || 180,
    total_cost: p.total_cost || 200,
    steps: (p.steps || []).map((s, i) => {
      // 尝试从 POI 数据匹配坐标（AI 给的 lat/lng 优先，POI 查到的兜底）
      const allPois = [...actPois, ...foodPois];
      const matched = allPois.find(poi => s.venue_name && poi.name.includes(s.venue_name.slice(0,4)));
      return {
        order: s.order || i+1,
        slot: s.slot || '活动',
        time_range: s.time_range || '',
        why: s.why || '',
        venue: {
          id: `ai_venue_${i}`,
          name: s.venue_name || '待定',
          address: s.venue_address || matched?.address || '',
          lat: s.venue_lat || matched?.lat || DEFAULT_LOCATION.lat,
          lng: s.venue_lng || matched?.lng || DEFAULT_LOCATION.lng,
          rating: matched?.rating || 4.5,
          price_per_person: matched?.cost || Math.round((p.total_cost||200)/(p.steps?.length||2)),
          category: s.slot === '正餐' ? '餐厅' : '活动',
          tags: [],
          kid_friendly: intent.has_child || false,
        }
      };
    }),
  }));

  // Step 5: 转换 intent 结构
  const members = [];
  if(intent.scene === 'family'){
    if(intent.spouse_diet) members.push({ role:'spouse', note: intent.spouse_diet === 'low_cal' ? '最近在减肥' : '' });
    if(intent.has_child)   members.push({ role:'child', age: intent.child_age || 5 });
  }

  const constraints = (aiResult.constraints || []).map(c => ({
    key: c.key || 'custom', value: 'true', source: 'inferred', reason: c.reason || ''
  }));

  // 推理步骤（供右侧面板展示）
  const sceneLabel = {'family':'家庭出行','friends':'朋友聚会','couple':'二人','solo':'独自'}[intent.scene] || '出行';
  const poiHit = actPois.length + foodPois.length;
  const reasoning_steps = [
    { title: '识别场景', detail: `${sceneLabel}，${intent.party_size || 2}人，目标时长约 ${intent.duration_hours || 4} 小时` },
    { title: '高德 POI 搜索', detail: poiHit > 0 ? `找到 ${actPois.length} 个活动场所、${foodPois.length} 个餐厅` : '网络受限，由 Leo 凭知识推断场所' },
    { title: '约束推断', detail: constraints.length ? constraints.map(c=>c.reason).slice(0,2).join('；') : '无特殊约束，自由规划' },
    { title: '方案生成', detail: `生成 ${plans.length} 套方案，推荐「${plans[0]?.title || ''}」` },
  ];

  return {
    session_id: 'ai_' + Date.now(),
    intent: {
      scene: intent.scene || 'family',
      members,
      party_size: intent.party_size || 2,
      duration_hours: intent.duration_hours || 4,
      start_time: intent.start_time || '14:00',
      location: loc,
      raw_text: userText,
      constraints,
    },
    plans,
    recommended_plan_id: plans[0]?.id || '',
    reasoning_steps,
  };
}

// ── apiJson：优先真实 AI，后端/mock 作兜底 ──
async function apiJson(url, options = {}){
  // /api/plan 永远走真实 DeepSeek + 高德，不走 mock
  if(url.includes('/api/plan')){
    let text = '';
    try { text = JSON.parse(options.body || '{}').text || ''; } catch(e) {}
    return aiPlanFromText(text);
  }

  // /api/chat 走 DeepSeek 直接回答
  if(url.includes('/api/chat')){
    let body = {};
    try { body = JSON.parse(options.body || '{}'); } catch(e) {}
    const reply = await callDeepSeek(
      '你是「Leisure Done」本地生活助手 Leo，回答关于路线、活动、餐厅的问题，简洁有用，100 字内，不说"打开地图"。如果提到产品名，只使用 Leisure Done，不要说“闲时达”。',
      body.message + (body.context ? `\n当前方案：${body.context}` : '')
    ).catch(() => '稍后再试，Leo 正在思考中…');
    return { reply };
  }

  // 其余接口尝试后端，后端无响应走 mock
  const backendResult = await tryBackend(url, options);
  if(backendResult) return backendResult;
  return mockApi(url, options);
}

let amapReadyPromise = null;

function getAmapConfig(){ return window.APP_CONFIG || {}; }
function toAmapPosition(point){ return [point.lng, point.lat]; }

function ensureAmapReady(){
  if(window.AMap) return Promise.resolve(window.AMap);
  if(amapReadyPromise) return amapReadyPromise;
  const config = getAmapConfig();
  const amapJsKey = config.AMAP_JS_API_KEY || config.AMAP_KEY;
  if(!amapJsKey) return Promise.reject(new Error('Missing AMAP_JS_API_KEY'));
  if(config.AMAP_SECURITY_JS_CODE){
    window._AMapSecurityConfig = { securityJsCode: config.AMAP_SECURITY_JS_CODE };
  }
  amapReadyPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(amapJsKey)}&plugin=AMap.Walking`;
    script.async = true;
    script.onload = () => window.AMap ? resolve(window.AMap) : reject(new Error('AMap failed to load'));
    script.onerror = () => reject(new Error('AMap script failed'));
    document.head.appendChild(script);
  });
  return amapReadyPromise;
}

function clearAmap(){
  if(!S.mapInstance) return;
  S.mapInstance.clearMap();
  S.mapLayers = [];
}

function createAmapMarker(point, content, title){
  const marker = new AMap.Marker({
    position: toAmapPosition(point),
    title,
    content,
    anchor: 'bottom-center',
  });
  marker.setMap(S.mapInstance);
  S.mapLayers.push(marker);
  return marker;
}

const DEFAULT_DISCOVER_SPOTS = [
  {id:'d1',name:'天安门广场漫步',category:'地标',heat:96,tip:'适合从城市中心轻松开始，步行节奏友好',price:0,duration_min:60,lat:39.9087,lng:116.3975,img_emoji:'🏛️'},
  {id:'d2',name:'前门大街 Citywalk',category:'历史文化',heat:95,tip:'老字号和街景集中，适合边走边吃',price:50,duration_min:90,lat:39.8996,lng:116.3979,img_emoji:'🏮'},
  {id:'d3',name:'国家博物馆',category:'文化展览',heat:94,tip:'室内展览丰富，适合雨天或慢节奏下午',price:0,duration_min:150,lat:39.9051,lng:116.4010,img_emoji:'🎨'},
  {id:'d4',name:'中山公园',category:'公园景点',heat:90,tip:'离天安门很近，适合散步放松',price:3,duration_min:80,lat:39.9110,lng:116.3918,img_emoji:'🌿'},
  {id:'d5',name:'故宫角楼打卡',category:'地标',heat:92,tip:'傍晚光线好，适合拍照和短暂停留',price:0,duration_min:60,lat:39.9163,lng:116.3908,img_emoji:'📷'},
  {id:'d6',name:'北京坊下午茶',category:'美食',heat:91,tip:'咖啡甜品选择多，逛累了可以坐一会儿',price:80,duration_min:90,lat:39.8988,lng:116.3907,img_emoji:'☕'},
  {id:'d7',name:'景山公园登高',category:'公园景点',heat:89,tip:'天气好时可以俯瞰中轴线',price:2,duration_min:80,lat:39.9251,lng:116.3965,img_emoji:'⛰️'},
  {id:'d8',name:'王府井步行街',category:'购物',heat:93,tip:'购物和餐饮都集中，适合临时加一站',price:0,duration_min:120,lat:39.9149,lng:116.4113,img_emoji:'🛍️'},
  {id:'d9',name:'大栅栏小吃街',category:'美食',heat:90,tip:'北京风味小吃多，适合轻松收尾',price:60,duration_min:90,lat:39.8956,lng:116.3942,img_emoji:'🍜'},
  {id:'d10',name:'劳动人民文化宫',category:'文化展览',heat:87,tip:'红墙绿树，很适合安静散步',price:2,duration_min:70,lat:39.9116,lng:116.4009,img_emoji:'🏯'},
];
const MOCK_SPOTS = DEFAULT_DISCOVER_SPOTS;

function mockPlanResponse(text = ''){
  const isFriends = /朋友|同事|聚会|团建|哥们|姐妹|4|四/.test(text);
  const isFamily = /老婆|老公|孩子|宝宝|家庭|亲子|妻子|丈夫/.test(text);
  const scene = isFamily ? 'family' : isFriends ? 'friends' : 'solo';
  const partySize = isFamily ? 3 : isFriends ? 4 : 1;
  const activity = {
    id:'mock_activity', name:'中山公园轻松散步', category:'亲子活动',
    distance_km:1.2, travel_minutes:12, rating:4.7, price_per_person:88,
    tags:['亲子友好','不远','可预约'], kid_friendly:true, has_reservation:true,
    queue_minutes:10, description:'适合 5 岁孩子放电', address:'北京市东城区中华路4号',
    lat:39.9110, lng:116.3918,
  };
  const restaurant = {
    id:'mock_restaurant', name:'北京坊轻食餐厅', category:'餐厅',
    distance_km:0.7, travel_minutes:8, rating:4.6, price_per_person:76,
    tags:['低卡','儿童椅','近'], kid_friendly:true, has_reservation:true,
    queue_minutes:5, description:'低卡套餐和儿童餐都比较稳', address:'北京市西城区廊房头条21号院',
    lat:39.8988, lng:116.3907, cuisine:'轻食', low_cal_options:true,
    has_kid_seat:true, has_private_room:false,
  };
  const plan = {
    id: scene === 'family' ? 'mock_family_kid' : scene === 'friends' ? 'mock_friends' : 'mock_solo',
    title: scene === 'family' ? '亲子优先方案' : scene === 'friends' ? '朋友聚会方案' : '轻松探索方案',
    theme: scene === 'family' ? 'kid_first' : scene === 'friends' ? 'value_first' : 'solo_light',
    total_cost:340, total_minutes:210,
    highlights: scene === 'family'
      ? ['离家近','孩子能放电','晚餐有低卡选项']
      : scene === 'friends'
        ? ['适合聊天聚会','人均可控','路线集中']
        : ['节奏轻松','适合一个人逛','路线集中'],
    steps:[
      {order:1,slot:'活动',time_range:'14:30-16:00',venue:activity,why:'距离近，孩子有活动空间，排队时间可控'},
      {order:2,slot:'正餐',time_range:'16:20-17:20',venue:restaurant,why:'有低卡餐和儿童椅，兼顾减脂和带娃'}
    ]
  };
  return {
    session_id:'file_demo',
    intent:{
      scene,
      members: scene === 'family' ? [{role:'spouse',note:'最近在减肥'},{role:'child',age:5}] : [],
      party_size: partySize,
      duration_hours:3.5,
      start_time:'14:30',
      location:getLocationPlanningName(),
      raw_text:'',
      constraints:[
        {key:'max_travel_minutes',value:'15',source:'inferred',reason:'你提到别太远，优先选 15 分钟内'},
        {key:'kid_friendly',value:'true',source:'inferred',reason:'同行有 5 岁孩子，需要亲子友好'},
        {key:'low_cal_diet',value:'true',source:'inferred',reason:'老婆最近在减肥，晚餐优先轻食低卡'}
      ]
    },
    plans:[plan],
    recommended_plan_id:plan.id,
  };
}

function mockApi(url, options){
  if(url.includes('/api/plan')) {
    let text = '';
    try { text = JSON.parse(options.body || '{}').text || ''; } catch(e) {}
    return mockPlanResponse(text);
  }
  if(url.includes('/api/discover')) return {spots:MOCK_SPOTS, home:getStartPoint()};

  // 接力卡：根据实际 plan + audience 动态生成，不再硬编码
  if(url.includes('/api/relay')) {
    let body = {};
    try { body = JSON.parse(options?.body || '{}'); } catch(e) {}
    const { plan, audience } = body;
    const steps = plan?.steps || [];
    const isFriends = audience === 'friends';
    const focus = steps.map(s => {
      const v = s.venue || {};
      if(isFriends){
        return `📍 ${s.slot}：${v.name}，人均 ¥${v.price_per_person || '?'}`;
      } else {
        const notes = [
          v.low_cal_options ? '🥗 低卡可选' : '',
          v.has_kid_seat    ? '🪑 有儿童椅' : '',
          v.kid_friendly    ? '🧒 亲子友好' : '',
        ].filter(Boolean);
        return `${s.slot}：${v.name}` + (notes.length ? ' · ' + notes.join('，') : '');
      }
    }).filter(Boolean);
    return {
      audience,
      headline: isFriends ? '周末局安排上了，看看这个行程👇' : '他给你精心挑选了这个方案，专门考虑了这些👇',
      plan_id: plan?.id || '',
      focus_points: focus.length ? focus : ['方案已为你量身定制'],
      quick_actions: isFriends
        ? ['可以，就这么定 ✓', '换个地方', '我有建议']
        : ['就这个！', '换个餐厅', '我有更好的想法'],
    };
  }

  // 执行结果：根据实际 plan + extras 动态生成，share_text 包含真实场所名
  if(url.includes('/api/execute')) {
    let body = {};
    try { body = JSON.parse(options?.body || '{}'); } catch(e) {}
    const plan   = body.plan   || {};
    const extras = body.extras || [];
    const steps  = plan.steps  || [];
    const partySize = plan.party_size || 2;

    const items = steps.map(s => {
      const v = s.venue || {};
      const isMeal = s.slot === '正餐';
      return {
        action: isMeal ? '餐厅预约' : '活动预约',
        target: v.name || '',
        status: 'success',
        detail: isMeal
          ? `已为 ${partySize} 人预订${v.name}（${s.time_range}）`
          : `${v.name} — 无需提前预约，可直接前往`,
        fallback_note: null,
      };
    });
    extras.forEach(x => {
      const mealVenue = steps.find(s => s.slot === '正餐')?.venue?.name || '餐厅';
      items.push({ action: x, target: mealVenue, status: 'success',
        detail: `已下单「${x}」，约 60 分钟内送达${mealVenue}`, fallback_note: null });
    });

    const timeline = steps.map(s => `${s.time_range}  ${s.slot}：${s.venue?.name || ''}`);
    const first = steps[0]?.venue?.name || '出发地';
    const meal  = steps.find(s => s.slot === '正餐')?.venue?.name || '餐厅';
    const hours = Math.round((plan.total_minutes || 180) / 60);
    const summary = `搞定了！出发，先去${first}，之后到${meal}用餐（已预订），全程约 ${hours} 小时。`;
    const shareText = [summary, '—— 行程明细 ——', ...timeline].join('\n');

    return {
      all_success: true,
      items,
      itinerary: { summary, timeline, share_text: shareText },
    };
  }

  if(url.includes('/api/chat')) return {reply:'建议步行或骑行，两个点距离不远的话，路上大约 8 到 12 分钟。'};
  return {};
}

// 带 Leo 头像的 bot 消息
function msgBot(html){
  const n = node(`<div class="msg bot">
    <div class="leo-av-msg">L</div>
    <div class="bubble">${html}</div>
  </div>`);
  chat.appendChild(n); scrollDown(); return n;
}
function msgUser(text){
  chat.appendChild(node(`<div class="msg user"><div class="bubble">${esc(text)}</div></div>`));
  scrollDown();
}

let thinkNode = null;
function showThink(text){
  thinkNode = node(`<div class="msg bot">
    <div class="leo-av-msg">L</div>
    <div class="bubble">
      <div style="font-size:12px;color:var(--text-3);margin-bottom:8px">${text}</div>
      <div class="thinking"><span></span><span></span><span></span></div>
    </div>
  </div>`);
  chat.appendChild(thinkNode); scrollDown();
}
function hideThink(){ if(thinkNode){ thinkNode.remove(); thinkNode=null; } }

function userAvatarHTML(extraClass = ''){
  if(S.auth.user){
    const initial = esc((S.auth.user.username || 'U').trim().slice(0, 1).toUpperCase());
    const color = esc(S.auth.user.avatar_color || '#22c98a');
    return `<div class="user-avatar initial ${extraClass}" style="background-color:${color}">${initial}</div>`;
  }
  return `<div class="user-avatar ${extraClass}">U</div>`;
}

function syncUserAvatarElement(container){
  if(!container) return;
  container.innerHTML = userAvatarHTML();
}

function leoAvatarHTML(extraClass = ''){
  return `<div class="leo-av-sm ${extraClass}">L</div>`;
}

function normalizeLeoReply(text){
  return String(text || '').replaceAll('闲时达', 'Leisure Done');
}

// ===== 账号入口：登录 / 注册 / 游客访问 =====
let authMode = 'login';

function setAuthMode(mode){
  authMode = mode === 'register' ? 'register' : 'login';
  document.querySelectorAll('[data-auth-mode]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.authMode === authMode);
  });
  if(authSubmit) authSubmit.textContent = authMode === 'register' ? '注册' : '登录';
  if(authPassword) authPassword.autocomplete = authMode === 'register' ? 'new-password' : 'current-password';
  showAuthError('');
}

function showAuthError(text){
  if(!authError) return;
  authError.textContent = text || '';
  authError.hidden = !text;
}

function updateAccountUI(){
  if(accountName){
    accountName.textContent = S.auth.user?.username || '游客访问';
  }
  syncUserAvatarElement(accountAvatarBtn);
  syncUserAvatarElement(chatUserAvatar);
  if(logoutBtn){
    logoutBtn.hidden = !S.auth.user;
  }
  accountStatus?.classList.toggle('is-guest', !S.auth.user);
}

function showAuthGate(){
  setAuthMode('login');
  if(authMask) authMask.hidden = false;
  updateAccountUI();
  setTimeout(()=>authUsername?.focus(), 60);
}

function hideAuthGate(){
  if(authMask) authMask.hidden = true;
  updateAccountUI();
}

function saveAuthSession(data){
  const shouldOpenGuide = authMode === 'register';
  S.auth.token = data.token || '';
  S.auth.user = data.user || null;
  S.auth.guest = false;
  if(S.auth.token) localStorage.setItem(AUTH_TOKEN_KEY, S.auth.token);
  else localStorage.removeItem(AUTH_TOKEN_KEY);
  S.history = [];
  hideAuthGate();
  loadHistory().then(()=> {
    if($('page-history')?.classList.contains('active')) renderHistoryPage();
  });
  if(shouldOpenGuide) setTimeout(openGuide, 120);
}

function continueAsGuest(){
  S.auth.token = '';
  S.auth.user = null;
  S.auth.guest = true;
  localStorage.removeItem(AUTH_TOKEN_KEY);
  S.history = [];
  hideAuthGate();
  if($('page-history')?.classList.contains('active')) renderHistoryPage();
  setTimeout(openGuide, 120);
}

async function submitAuth(event){
  event?.preventDefault();
  const username = authUsername?.value.trim() || '';
  const password = authPassword?.value || '';
  if(!username || !password){
    showAuthError('请输入账号和密码');
    return;
  }
  if(authSubmit) authSubmit.disabled = true;
  showAuthError('');
  try {
    const data = await authRequest(`/api/auth/${authMode}`, {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    saveAuthSession(data);
    if(authPassword) authPassword.value = '';
  } catch(e){
    showAuthError(e.message || '账号服务暂时不可用');
  } finally {
    if(authSubmit) authSubmit.disabled = false;
  }
}

async function restoreAuth(){
  if(S.auth.token){
    try {
      const data = await authRequest('/api/auth/me', { method: 'GET' });
      if(data.ok && data.user){
        S.auth.user = data.user;
        S.auth.guest = false;
        hideAuthGate();
        loadHistory().then(()=> {
          if($('page-history')?.classList.contains('active')) renderHistoryPage();
        });
        return;
      }
    } catch(e) {}
    S.auth.token = '';
    S.auth.user = null;
    localStorage.removeItem(AUTH_TOKEN_KEY);
  }
  S.auth.guest = false;
  S.history = [];
  showAuthGate();
}

async function logout(){
  closeLogoutConfirm();
  if(S.auth.token){
    try { await authRequest('/api/auth/logout', { method: 'POST' }); } catch(e) {}
  }
  S.auth.token = '';
  S.auth.user = null;
  S.auth.guest = false;
  S.history = [];
  localStorage.removeItem(AUTH_TOKEN_KEY);
  showAuthGate();
  if($('page-history')?.classList.contains('active')) renderHistoryPage();
}

function openLogoutConfirm(){
  if(!S.auth.user){
    showAuthGate();
    return;
  }
  if(logoutConfirmMask) logoutConfirmMask.hidden = false;
}

function closeLogoutConfirm(){
  if(logoutConfirmMask) logoutConfirmMask.hidden = true;
}

function handleAccountAvatarClick(event){
  event?.stopPropagation();
  if(S.auth.user) openLogoutConfirm();
  else showAuthGate();
}

document.querySelectorAll('[data-auth-mode]').forEach(btn => {
  btn.onclick = () => setAuthMode(btn.dataset.authMode);
});
guideTriggers.forEach(btn => btn.addEventListener('click', openGuide));
guideClose?.addEventListener('click', closeGuide);
guideMask?.addEventListener('click', event => {
  if(event.target === guideMask) closeGuide();
});
document.addEventListener('keydown', event => {
  if(event.key === 'Escape' && guideMask && !guideMask.hidden) closeGuide();
  if(event.key === 'Escape' && logoutConfirmMask && !logoutConfirmMask.hidden) closeLogoutConfirm();
});
authForm?.addEventListener('submit', submitAuth);
guestBtn?.addEventListener('click', continueAsGuest);
logoutBtn?.addEventListener('click', openLogoutConfirm);
logoutBtn?.addEventListener('click', event => event.stopPropagation());
accountAvatarBtn?.addEventListener('click', handleAccountAvatarClick);
chatUserAvatar?.addEventListener('click', handleAccountAvatarClick);
logoutCancelBtn?.addEventListener('click', closeLogoutConfirm);
logoutConfirmBtn?.addEventListener('click', logout);
logoutConfirmMask?.addEventListener('click', event => {
  if(event.target === logoutConfirmMask) closeLogoutConfirm();
});
accountStatus?.addEventListener('click', event => {
  if(event.target.closest('button')) return;
  if(S.auth.user) openLogoutConfirm();
  else showAuthGate();
});

// ===== 导航（侧边栏 + 底部 Tab 统一处理）=====
function switchPage(name){
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab, .sb-item').forEach(t => t.classList.remove('active'));
  $(`page-${name}`).classList.add('active');
  document.querySelectorAll(`[data-page="${name}"]`).forEach(el => el.classList.add('active'));

  if(name === 'map')      initMapPage();
  if(name === 'assistant') setTimeout(()=>askInput?.focus(), 60);
  if(name === 'discover') initDiscoverPage();
  if(name === 'history')  renderHistoryPage();
}

document.querySelectorAll('.tab, .sb-item').forEach(btn => {
  btn.onclick = () => switchPage(btn.dataset.page);
});

// ===== 对话流 =====
async function doPlan(text){
  msgUser(text);
  $('examples')?.remove();
  showThink('Leo 正在理解你的需求，推断隐藏偏好…');
  const wasFollowUp = isPlanningFollowUp(text);
  const planningText = buildMemoryAwarePlanningText(text);

  let data;
  try {
    data = await apiJson('/api/plan', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({text: planningText}),
    });
  } catch(e){
    hideThink();
    const msg = e?.message || '';
    if(msg === 'FILE_PROTOCOL'){
      msgBot(`当前是直接双击 HTML 的本地预览模式，浏览器会限制 AI、定位和地图接口。发布到 HTTPS 站点后不会出现这个问题。<br><br>
本地调试可以在项目根目录运行：<br>
<code style="background:#f2f3f5;padding:2px 8px;border-radius:4px;font-size:12px">python serve.py</code><br>
然后访问 <code style="background:#f2f3f5;padding:2px 8px;border-radius:4px">http://localhost:8080</code>`);
    } else if(msg === 'NETWORK_ERROR'){
      msgBot('网络请求失败，请检查网络连接、浏览器跨域限制，或确认当前页面是通过 HTTP/HTTPS 访问。');
    } else if(msg === 'MISSING_KEY'){
      msgBot('未检测到 DeepSeek API Key，请检查服务端或 Cloudflare Pages 的 LLM_API_KEY 环境变量。');
    } else {
      msgBot(`Leo 遇到了问题：${esc(msg) || '未知错误'}，请稍后重试。`);
    }
    return;
  }
  hideThink();
  data = normalizeFollowUpPlanData(data, wasFollowUp);

  S.sessionId     = data.session_id;
  S.scene         = data.intent.scene;
  S.plans         = data.plans;
  S.currentIntent = data.intent;
  updatePlanningMemory(text, data);

  // 渲染右侧分析面板（含推理步骤）
  renderAnalysisPanel(data.intent, data.reasoning_steps);
  // 方案对比图（多方案时显示）
  if(data.plans.length > 1) renderPlanComparison(data.plans);
  // 聊天流里给个简短确认
  msgBot(`好的！Leo 已识别关键信息（右侧面板可查看推理过程）。<br>以下是为「${sceneLabel(data.intent)}」量身定制的方案：`);
  data.plans.forEach(p => renderPlan(p, p.id === data.recommended_plan_id));
  const recommendedPlan = data.plans.find(p => p.id === data.recommended_plan_id) || data.plans[0];
  await saveHistory(recommendedPlan, `根据「${text}」生成`);
}

function sceneLabel(intent){
  if(intent.scene==='family'){
    return intent.members?.some(m=>m.role==='child') ? `全家 ${intent.party_size} 人` : '二人出行';
  }
  if(intent.scene==='solo') return '一个人轻松出行';
  return `朋友局 ${intent.party_size} 人`;
}

// ===== 右侧分析面板（桌面专用）=====
const consMap = {
  max_travel_minutes:'出行距离', kid_friendly:'亲子友好',
  need_kid_seat:'儿童餐椅', low_cal_diet:'饮食偏好',
  need_private_room:'聚会包厢', group_activity:'活动类型',
};
const consIcon = {
  max_travel_minutes:'📍', kid_friendly:'🧒', need_kid_seat:'🪑',
  low_cal_diet:'🥗', need_private_room:'🚪', group_activity:'🎯',
};

function renderAnalysisPanel(intent, reasoningSteps){
  const inferred = (intent.constraints||[]).filter(c=>c.source==='inferred');
  acEmpty.hidden = true;
  acEmpty.style.display = 'none';
  acEmpty.remove();
  acContent.hidden = false;
  acContent.style.display = 'flex';

  // 出行信息
  const members = intent.members||[];
  const hasChild = members.some(m=>m.role==='child');
  const child    = members.find(m=>m.role==='child');
  const spouse   = members.find(m=>m.role==='spouse');
  const infoRows = [
    `<div class="con-row"><span class="con-key">👥 出行人数</span><span class="con-val">${intent.party_size} 人</span></div>`,
    hasChild ? `<div class="con-row"><span class="con-key">🧒 儿童年龄</span><span class="con-val">${child?.age||5} 岁</span></div>` : '',
    spouse?.note ? `<div class="con-row"><span class="con-key">💪 健康需求</span><span class="con-val">${esc(spouse.note)}</span></div>` : '',
    `<div class="con-row"><span class="con-key">⏱ 目标时长</span><span class="con-val">约 ${intent.duration_hours} 小时</span></div>`,
  ].filter(Boolean).join('');

  // 约束推断行
  const constraintRows = inferred.map(c=>`
    <div class="con-row">
      <div class="con-check">
        <svg viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5 3.5-4" stroke="#22c98a" stroke-width="1.5" stroke-linecap="round"/></svg>
      </div>
      <span class="con-key">${esc(consIcon[c.key]||'')} ${esc(consMap[c.key]||c.key)}</span>
      <span class="con-val">${esc(c.reason)}</span>
    </div>`).join('');

  // Leo 推理步骤卡（仅 AI 规划时有）
  let reasoningHTML = '';
  if(reasoningSteps?.length){
    const steps = reasoningSteps.map((s,i)=>`
      <div class="rc-step">
        <div class="rc-num">${i+1}</div>
        <div class="rc-text"><b>${esc(s.title)}</b>　${esc(s.detail)}</div>
      </div>`).join('');
    reasoningHTML = `
      <div class="reasoning-card">
        <div class="rc-title">
          <span style="font-size:14px">⚡</span> Leo 推理过程
        </div>
        ${steps}
      </div>`;
  }

  acContent.innerHTML = `
    <div class="intent-card">
      <div class="ic-header"><div class="ic-dot"></div><div class="ic-title">出行信息</div></div>
      ${infoRows}
    </div>
    ${constraintRows ? `<div class="intent-card">
      <div class="ic-header"><div class="ic-dot"></div><div class="ic-title">Leo 推断的关键需求</div></div>
      ${constraintRows}
    </div>` : ''}
    ${reasoningHTML}`;
}

// ── 方案对比 SVG 条形图 ──
function renderPlanComparison(plans){
  if(plans.length < 2) return;
  const [p1, p2] = plans;
  const maxCost  = Math.max(p1.total_cost, p2.total_cost, 1);
  const maxMins  = Math.max(p1.total_minutes, p2.total_minutes, 1);

  function barPair(label, v1, v2, max, unit){
    const w1 = Math.round(v1/max*100), w2 = Math.round(v2/max*100);
    return `<div class="pc-row">
      <span class="pc-label">${label}</span>
      <div class="pc-bars">
        <div class="pc-bar-wrap">
          <div class="pc-bar p1" style="width:${w1}%"></div>
          <span class="pc-val">${v1}${unit}</span>
        </div>
        <div class="pc-bar-wrap">
          <div class="pc-bar p2" style="width:${w2}%"></div>
          <span class="pc-val">${v2}${unit}</span>
        </div>
      </div>
    </div>`;
  }

  const html = `<div class="msg bot" style="max-width:100%;width:100%;gap:6px">
    <div class="leo-av-msg">L</div>
    <div class="plan-compare">
      <div class="pc-title">方案对比</div>
      ${barPair('💰 人均花费', p1.total_cost, p2.total_cost, maxCost, '元')}
      ${barPair('⏱ 总时长', Math.round(p1.total_minutes/60*10)/10, Math.round(p2.total_minutes/60*10)/10, maxMins/60, 'h')}
      <div class="pc-legend">
        <span><span class="pc-dot" style="background:var(--green)"></span>${esc(p1.title)}</span>
        <span><span class="pc-dot" style="background:var(--orange)"></span>${esc(p2.title)}</span>
      </div>
    </div>
  </div>`;
  chat.appendChild(node(html));
  scrollDown();
}

// ===== 约束卡（聊天流移动端显示）=====
function renderIntent(intent){
  // 桌面端不在聊天流里重复显示，移动端显示简化卡片
  if(window.innerWidth > 768) return;
  const inferred = (intent.constraints||[]).filter(c=>c.source==='inferred');
  if(!inferred.length) return;
  const lines = inferred.map(c=>`
    <div class="con-row" style="border-bottom:1px solid var(--border);padding:7px 0;">
      <div class="con-check">
        <svg viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5 3.5-4" stroke="#22c98a" stroke-width="1.5" stroke-linecap="round"/></svg>
      </div>
      <span class="con-key">${esc(consMap[c.key]||c.key)}</span>
      <span class="con-val">${esc(c.reason)}</span>
    </div>`).join('');
  const n = node(`<div class="msg bot" style="max-width:100%;width:100%">
    <div class="leo-av-msg" style="margin-top:2px">L</div>
    <div class="intent-card" style="flex:1">
      <div class="ic-header"><div class="ic-dot"></div><div class="ic-title">Leo 推断的关键需求</div></div>
      ${lines}
    </div></div>`);
  chat.appendChild(n); scrollDown();
}

// ===== 方案卡 =====
function renderPlan(plan, recommended){
  // 用可变对象包装 plan，让"换一个地方"可以原地修改步骤
  const planRef = { ...plan, steps: plan.steps.map(s=>({...s, venue:{...s.venue}})) };

  const stepsHtml = planRef.steps.map((s,i)=>`
    <div class="step" id="step-${plan.id}-${i}">
      <div class="step-time">${esc(s.time_range.split('-')[0]||'')}</div>
      <div class="dot">${slotIcon(s.slot)}</div>
      <div class="sbody">
        <div class="sslot">${esc(s.slot)}</div>
        <div class="sname">${esc(s.venue.name)}</div>
        <div class="swhy">${esc(s.why)}</div>
        ${s.venue.address ? `<div class="saddr" onclick="openMapForVenue('${s.venue.id}')">📍 ${esc(s.venue.address)}</div>` : ''}
        <button class="step-swap-btn" data-step="${i}">换个地方 ↻</button>
        <div class="step-alt-panel" id="alt-${plan.id}-${i}" style="display:none"></div>
      </div>
    </div>`).join('');

  const tags = planRef.highlights.map(h=>`<span class="t">${esc(h)}</span>`).join('');
  const aud      = S.scene==='friends'?'friends':'spouse';
  const audLabel = S.scene==='friends'?'朋友':'老婆';
  const showRelay = S.scene !== 'solo';
  const relayHtml = showRelay ? `
      <div class="relay-trigger">
        <button class="rt">📲 递给${audLabel}一起看</button>
      </div>` : '';

  const n = node(`<div class="msg bot" style="max-width:100%;width:100%;gap:6px">
    <div class="leo-av-msg">L</div>
    <div class="plan-card ${recommended?'recommended':''}">
      <div class="plan-head">
        <span class="pt">${esc(planRef.title)}</span>
        ${recommended?'<span class="badge">推荐</span>':''}
      </div>
      <div class="plan-meta">约 ${Math.round(planRef.total_minutes/60)} 小时 · 预估总花费 ¥${planRef.total_cost}</div>
      <div class="plan-steps">${stepsHtml}</div>
      <div class="plan-tags">${tags}</div>
      ${relayHtml}
      <div class="plan-actions">
        <button class="btn btn-blue js-map">🗺️ 看路线</button>
        <button class="btn btn-primary js-choose">确认这个方案 →</button>
      </div>
    </div></div>`);

  if(showRelay) n.querySelector('.rt').onclick = () => openRelay(planRef, aud);
  n.querySelector('.js-map').onclick  = () => loadPlanToMap(planRef);
  n.querySelector('.js-choose').onclick = () => choosePlan(planRef);

  // 换一个地方
  n.querySelectorAll('.step-swap-btn').forEach(btn => {
    btn.onclick = () => triggerStepReplace(planRef, +btn.dataset.step, btn);
  });

  chat.appendChild(n); scrollDown();
}
function slotIcon(slot){ return ({'活动':'🎯','正餐':'🍽','附加活动':'✨'})[slot]||'📍'; }

// ── "换一个地方"：Leo 生成同类备选 ──
async function triggerStepReplace(planRef, stepIdx, btn){
  const step = planRef.steps[stepIdx];
  const altPanel = document.getElementById(`alt-${planRef.id}-${stepIdx}`);
  if(!altPanel) return;

  if(altPanel.style.display !== 'none'){
    altPanel.style.display = 'none';
    btn.textContent = '换个地方 ↻';
    return;
  }

  btn.textContent = 'Leo 正在找替换…';
  altPanel.style.display = 'block';
  altPanel.innerHTML = '<div class="step-alt-title">⏳ 正在搜索同类场所…</div>';

  try {
    const nearLoc = `${S_location.district||S_location.city||'当前位置'}附近`;
    const prompt = `用户想替换行程中的"${step.slot}：${step.venue.name}"，帮我推荐 2-3 个${nearLoc}的同类${step.slot === '正餐' ? '餐厅' : '活动/场所'}。
只返回 JSON 数组（不要 markdown），格式：
[{"name":"场所名","address":"地址","why":"推荐理由（结合原方案约束：${planRef.highlights?.join('、')||''}）","lat":40.001,"lng":116.470}]`;

    const reply = await callDeepSeek(
      '你是本地生活规划 AI Leo，只返回纯 JSON 数组，不要 markdown 代码块。',
      prompt
    );
    let alts = [];
    try {
      const m = reply.match(/\[[\s\S]*\]/);
      alts = JSON.parse(m ? m[0] : reply);
    } catch(e) { alts = []; }

    if(!alts.length){ altPanel.innerHTML='<div class="step-alt-title" style="color:var(--text-3)">暂无推荐，请换个描述再试</div>'; btn.textContent='换个地方 ↻'; return; }

    altPanel.innerHTML = `<div class="step-alt-title">Leo 推荐的替换选项：</div>` +
      alts.map((a,i)=>`
        <div class="step-alt-opt">
          <div style="flex:1">
            <div class="alt-name">${esc(a.name)}</div>
            <div class="alt-why">${esc(a.why)}</div>
          </div>
          <button class="alt-btn" data-i="${i}">换这个</button>
        </div>`).join('');

    altPanel.querySelectorAll('.alt-btn').forEach(b => {
      b.onclick = () => {
        const alt = alts[+b.dataset.i];
        // 原地更新 step
        planRef.steps[stepIdx].venue.name    = alt.name;
        planRef.steps[stepIdx].venue.address = alt.address || '';
        planRef.steps[stepIdx].venue.lat     = alt.lat || planRef.steps[stepIdx].venue.lat;
        planRef.steps[stepIdx].venue.lng     = alt.lng || planRef.steps[stepIdx].venue.lng;
        planRef.steps[stepIdx].why           = alt.why || '';
        // 更新 DOM
        const sbody = document.getElementById(`step-${planRef.id}-${stepIdx}`)?.querySelector('.sbody');
        if(sbody){
          sbody.querySelector('.sname').textContent = alt.name;
          sbody.querySelector('.swhy').textContent  = alt.why || '';
        }
        altPanel.style.display = 'none';
        btn.textContent = '换个地方 ↻';
        msgBot(`已替换为「${esc(alt.name)}」✓`);
        scrollDown();
      };
    });
  } catch(e){
    altPanel.innerHTML = `<div class="step-alt-title" style="color:var(--red)">搜索失败：${esc(e.message)}</div>`;
  }
  btn.textContent = '换个地方 ↻';
}

// ===== 地图页入口 =====
function loadPlanToMap(plan){
  S.currentPlan = plan;
  S.planSummary = plan.steps.map(s=>`${s.slot}：${s.venue.name}`).join('，');
  switchPage('map');
}

function openMapForVenue(venueId){
  const allVenues = S.plans.flatMap(p=>p.steps.map(s=>s.venue));
  const v = allVenues.find(v=>v.id===venueId);
  if(!v) return;
  S.currentPlan = { steps:[{slot:'场所',time_range:'',venue:v,why:'',order:1}], title:v.name, total_minutes:0, total_cost:0 };
  switchPage('map');
}
window.openMapForVenue = openMapForVenue;

// ===== 地图页：高德优先，失败时自动切 Leaflet =====
async function initMapPage(){
  const amapOk = await ensureAmapReady().then(()=>true).catch(()=>false);
  if(amapOk){
    await initMapWithAmap();
  } else {
    initMapWithLeaflet();
  }
}

function getMapCenter(){
  return {
    lat: S_location.lat || DEFAULT_LOCATION.lat,
    lng: S_location.lng || DEFAULT_LOCATION.lng,
  };
}

function getStartPoint(){
  const center = getMapCenter();
  return {
    ...center,
    name: getLocationPlanningName() || '出发点',
  };
}

function getLocationDisplayName(){
  if(S_location.status === 'locating') return '定位中……';
  if(S_location.status === 'failed') return '定位失败，请提供位置权限';
  return getLocationPlanningName();
}

function getLocationPlanningName(){
  return S_location.businessArea || S_location.district || S_location.city || DEFAULT_LOCATION.district;
}

// ── 高德地图实现 ──
async function initMapWithAmap(){
  if(!S.mapInstance || S.mapInstance._type !== 'amap'){
    // 清除可能存在的 Leaflet 实例
    if(S.mapInstance && S.mapInstance._type === 'leaflet'){
      S.mapInstance.remove();
      S.mapInstance = null;
      $('map').innerHTML = '';
    }
    const center = getMapCenter();
    S.mapInstance = new AMap.Map('map', { zoom:14, center:[center.lng, center.lat], viewMode:'2D' });
    S.mapInstance._type = 'amap';
  }
  clearAmap();
  const center = getMapCenter();
  S.mapInstance.setCenter([center.lng, center.lat]);

  const plan = S.currentPlan;
  if(!plan || !plan.steps.length){
    mapTitle.textContent='路线地图';
    mapMeta.textContent='选好方案后，在规划页点「看路线」';
    mapSteps.innerHTML=`<div class="map-empty"><div class="map-empty-icon">🗺️</div><div>选好方案后<br>点击「看路线」即可显示全程</div></div>`;
    return;
  }

  mapTitle.textContent = plan.title || '路线地图';
  const home = getStartPoint();
  createAmapMarker(home,'<div class="amap-pin home">🏠</div>','出发点');

  const routePoints = [home];
  const stepCards = [];
  plan.steps.forEach((step,i)=>{
    const v = step.venue;
    if(!v.lat||!v.lng) return;
    createAmapMarker(v,`<div class="amap-pin">${i+1}</div>`,v.name);
    routePoints.push(v);
    stepCards.push(makeStepCard(step,v,i,'高德路线规划中…'));
  });

  mapMeta.textContent=`${plan.steps.length} 个站点 · 步行路线规划中`;
  mapSteps.innerHTML = stepCards.join('') + askLeoBtn();

  const stats = await renderAmapWalkingRoute(routePoints);
  mapMeta.textContent = stats.distance > 0
    ? `${plan.steps.length} 个站点 · ${formatRouteSummary(stats)}`
    : `${plan.steps.length} 个站点`;
  S.mapInstance.setFitView();
}

// ── Leaflet 备用地图实现 ──
function initMapWithLeaflet(){
  if(!window.L){ mapTitle.textContent='地图不可用'; return; }

  if(S.mapInstance && S.mapInstance._type === 'amap'){
    S.mapInstance.destroy?.();
    S.mapInstance = null;
    $('map').innerHTML = '';
  }

  if(!S.mapInstance || S.mapInstance._type !== 'leaflet'){
    const center = getMapCenter();
    const centerLat = center.lat;
    const centerLng = center.lng;
    const lmap = L.map('map').setView([centerLat, centerLng], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
      attribution:'© OpenStreetMap', maxZoom:19
    }).addTo(lmap);
    lmap._type = 'leaflet';
    S.mapInstance = lmap;
    S.mapLayers  = [];
  } else {
    S.mapLayers.forEach(l=>{ try{ S.mapInstance.removeLayer(l); }catch(e){} });
    S.mapLayers = [];
  }

  const lmap = S.mapInstance;
  const center = getMapCenter();
  lmap.setView([center.lat, center.lng], lmap.getZoom() || 14);
  const plan  = S.currentPlan;

  if(!plan || !plan.steps.length){
    mapTitle.textContent = '路线地图';
    mapMeta.textContent  = '选好方案后，在规划页点「看路线」';
    mapSteps.innerHTML   = `<div class="map-empty"><div class="map-empty-icon">🗺️</div><div>选好方案后<br>点击「看路线」即可显示全程</div></div>`;
    setTimeout(()=>lmap.invalidateSize(),80);
    return;
  }

  mapTitle.textContent = plan.title || '路线地图';

  // 出发点（使用真实坐标）
  const start = getStartPoint();
  const hLat = start.lat;
  const hLng = start.lng;
  const homeMarker = L.marker([hLat, hLng],{
    icon: L.divIcon({html:'<div class="amap-pin home" style="background:#22c98a;color:#fff;border-radius:50%;width:30px;height:30px;display:grid;place-items:center;font-size:14px;box-shadow:0 2px 8px rgba(34,201,138,.4)">🏠</div>',iconSize:[30,30],className:'',iconAnchor:[15,30]})
  }).bindPopup(`<div class="map-popup"><strong>出发点</strong><br>📍 ${S_location.address || S_location.district || '当前位置'}</div>`).addTo(lmap);
  S.mapLayers.push(homeMarker);

  const points = [[hLat, hLng]];
  const stepCards = [];

  plan.steps.forEach((step,i)=>{
    const v = step.venue;
    if(!v.lat||!v.lng) return;
    const marker = L.marker([v.lat,v.lng],{
      icon: L.divIcon({
        html:`<div style="background:${i===0?'#22c98a':'#ff8c42'};color:#fff;border-radius:50%;width:30px;height:30px;display:grid;place-items:center;font-weight:700;font-size:12px;box-shadow:0 2px 8px rgba(0,0,0,.25)">${i+1}</div>`,
        iconSize:[30,30],className:'',iconAnchor:[15,30]
      })
    }).bindPopup(`<div class="map-popup"><strong>${esc(v.name)}</strong><br>${esc(step.slot)} · ${esc(step.time_range)}<br>📍 ${esc(v.address||'')}</div>`)
      .addTo(lmap);
    S.mapLayers.push(marker);
    points.push([v.lat,v.lng]);

    const prev = points[points.length-2];
    const dist = calcDist(prev[0],prev[1],v.lat,v.lng);
    const walkMin = Math.round(dist/80);
    stepCards.push(makeStepCard(step,v,i,formatRouteSummary({
      distance: dist,
      duration: walkMin * 60,
      bicycling_duration: Math.max(1, Math.ceil(dist / 250)) * 60,
    })));
  });

  if(points.length>1){
    const poly = L.polyline(points,{color:'#22c98a',weight:3,opacity:.85,dashArray:'8,5'}).addTo(lmap);
    S.mapLayers.push(poly);
    lmap.fitBounds(poly.getBounds(),{padding:[20,20]});
  }

  mapMeta.textContent = `${plan.steps.length} 个站点 · OpenStreetMap`;
  mapSteps.innerHTML  = stepCards.join('') + askLeoBtn();
  setTimeout(()=>lmap.invalidateSize(),80);
}

// ── 公共辅助 ──
function makeStepCard(step, v, i, distText){
  return `<div class="map-step-card" id="route-leg-${i}">
    <div class="ms-num">${i+1}</div>
    <div class="ms-body">
      <div class="ms-name">${esc(step.slot)} · ${esc(v.name)}</div>
      <div class="ms-addr">📍 ${esc(v.address||'')}</div>
      <div class="ms-dist">${distText}</div>
    </div>
  </div>`;
}
function askLeoBtn(){
  return `<div style="padding:6px 2px 2px">
    <button class="btn btn-primary" style="width:100%" onclick="openAskFromMap()">💬 问 Leo 路线建议</button>
  </div>`;
}
function calcDist(lat1,lng1,lat2,lng2){
  const R=6371000,dLat=(lat2-lat1)*Math.PI/180,dLng=(lng2-lng1)*Math.PI/180;
  const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return Math.round(R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a)));
}
function formatDistance(meters){
  return `${(Number(meters || 0) / 1000).toFixed(1)}km`;
}
function formatMinutes(seconds){
  return Math.max(1, Math.ceil(Number(seconds || 0) / 60));
}
function routeCacheKey(points){
  const city = S_location.city || DEFAULT_LOCATION.city;
  const coords = points.map(p => `${Number(p.lng).toFixed(6)},${Number(p.lat).toFixed(6)}`).join('|');
  return `${city}:${coords}`;
}
function getCachedRoute(points){
  const key = routeCacheKey(points);
  const cached = S.routeCache.get(key);
  if(!cached) return null;
  if(Date.now() - cached.createdAt > ROUTE_CACHE_TTL_MS){
    S.routeCache.delete(key);
    return null;
  }
  return cached.data;
}
function setCachedRoute(points, data){
  S.routeCache.set(routeCacheKey(points), {createdAt:Date.now(), data});
}
function formatRouteSummary(route){
  const parts = [
    `${formatDistance(Number(route.distance || 0))} 步行约${formatMinutes(route.duration)}分钟`,
  ];
  if(route.bicycling_duration) parts.push(`骑行约${formatMinutes(route.bicycling_duration)}分钟`);
  if(route.transit_duration) parts.push(`公共交通约${formatMinutes(route.transit_duration)}分钟`);
  return parts.join('，');
}
function formatTransitDetails(segments = []){
  const rides = segments.filter(s => s.type === 'bus' || s.type === 'metro');
  if(!rides.length) return '';
  return rides.map(s => {
    const stops = s.departure_stop && s.arrival_stop ? `：${esc(s.departure_stop)} → ${esc(s.arrival_stop)}` : '';
    const via = s.via_num ? `，${s.via_num}站` : '';
    return `${esc(s.name || '公共交通')}${stops}${via}`;
  }).join('；');
}
function formatRouteDetail(route){
  const detail = formatTransitDetails(route.transit_segments);
  return detail ? `${formatRouteSummary(route)}<br><span class="ms-transit">公交/地铁：${detail}</span>` : formatRouteSummary(route);
}
async function renderAmapWalkingRoute(points){
  const backendRoute = await fetchBackendWalkingRoute(points);
  if(backendRoute?.ok){
    renderBackendRoutePolyline(backendRoute);
    backendRoute.legs.forEach((leg, i)=>{
      const distNode = $(`route-leg-${i}`)?.querySelector('.ms-dist');
      if(distNode) distNode.innerHTML = formatRouteDetail(leg);
    });
    return {
      distance: Number(backendRoute.distance || 0),
      duration: Number(backendRoute.duration || 0),
      bicycling_duration: backendRoute.legs?.reduce((sum, leg) => sum + Number(leg.bicycling_duration || 0), 0) || 0,
      transit_duration: backendRoute.legs?.every(leg => leg.transit_duration)
        ? backendRoute.legs.reduce((sum, leg) => sum + Number(leg.transit_duration || 0), 0)
        : 0,
    };
  }

  let totalDistance = 0;
  let totalDuration = 0;
  let totalBicyclingDuration = 0;
  if(points.length < 2) return {distance:0, duration:0};

  for(let i=1; i<points.length; i++){
    const leg = await searchAmapWalking(points[i-1], points[i]);
    const distNode = $(`route-leg-${i-1}`)?.querySelector('.ms-dist');
    if(leg.ok){
      totalDistance += leg.distance;
      totalDuration += leg.duration;
      totalBicyclingDuration += Math.max(1, Math.ceil(leg.distance / 250)) * 60;
      if(distNode) distNode.textContent = formatRouteSummary({
        distance: leg.distance,
        duration: leg.duration,
        bicycling_duration: Math.max(1, Math.ceil(leg.distance / 250)) * 60,
      });
    } else if(distNode) {
      distNode.textContent = '高德路线规划失败，已保留站点';
    }
  }
  return {distance:totalDistance, duration:totalDuration, bicycling_duration:totalBicyclingDuration};
}

async function fetchBackendWalkingRoute(points){
  try {
    const cached = getCachedRoute(points);
    if(cached) return cached;
    const route = await apiJson('/api/amap/walking', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({points, city:S_location.city || DEFAULT_LOCATION.city}),
    });
    if(route?.ok) setCachedRoute(points, route);
    return route;
  } catch(e) {
    return null;
  }
}

function renderBackendRoutePolyline(route){
  route.legs?.forEach((leg)=>{
    const path = (leg.polyline || []).map(p => [p.lng, p.lat]);
    if(path.length < 2) return;
    const polyline = new AMap.Polyline({
      path,
      strokeColor: '#22c98a',
      strokeWeight: 6,
      strokeOpacity: 0.88,
      lineJoin: 'round',
      lineCap: 'round',
    });
    polyline.setMap(S.mapInstance);
    S.mapLayers.push(polyline);
  });
}

function searchAmapWalking(start, end){
  return new Promise(resolve => {
    const walking = new AMap.Walking({
      map: S.mapInstance,
      hideMarkers: true,
    });
    walking.search(toAmapPosition(start), toAmapPosition(end), (status, result) => {
      const route = result?.routes?.[0];
      if(status === 'complete' && route){
        resolve({
          ok: true,
          distance: Number(route.distance || 0),
          duration: Number(route.time || route.duration || 0),
        });
      } else {
        resolve({ok:false, distance:0, duration:0});
      }
    });
  });
}

window.openAskFromMap = ()=>openAsk();
async function initDiscoverPage(){
  if(discoverList.dataset.loaded) return;
  discoverList.dataset.loaded='1';
  discoverList.innerHTML='<div class="disc-loading">加载中…</div>';
  try {
    const data = await loadLocalDiscoverSpots();
    renderDiscover(data.spots);
    updateDiscoverHeader();
  } catch(e){
    discoverList.innerHTML='<div class="disc-loading" style="color:var(--red)">加载失败，请重试</div>';
  }
}

async function loadLocalDiscoverSpots(){
  const origin = getStartPoint();
  const area = getLocationPlanningName();
  const city = S_location.city || DEFAULT_LOCATION.city;
  const types = '050000|060000|080000|110000|140000|141200|150000';
  const around = await amapPoiAround(origin, types, '', 3500, 14);
  const textFallback = around.length ? [] : await amapPoiSearch(`${area} 公园 商场 美食 展览`, types, city);
  const pois = around.length ? around : textFallback;
  const spots = pois.slice(0, 10).map((poi, i) => poiToDiscoverSpot(poi, i));
  return {
    spots: spots.length ? spots : DEFAULT_DISCOVER_SPOTS,
    home: origin,
  };
}

function poiToDiscoverSpot(poi, i){
  const category = classifyPoiCategory(poi);
  return {
    id: `local_${i}_${poi.name}`,
    name: poi.name,
    category,
    heat: Math.max(82, 98 - i * 2),
    tip: discoverTipFor(category, poi.address),
    price: poi.cost || 0,
    duration_min: durationForCategory(category),
    lat: poi.lat,
    lng: poi.lng,
    img_emoji: emojiForCategory(category),
  };
}

function classifyPoiCategory(poi){
  const text = `${poi.name || ''} ${poi.type || ''}`;
  if(/餐饮|美食|小吃|火锅|咖啡|茶|甜品|酒吧/.test(text)) return '美食';
  if(/购物|商场|百货|超市|商业/.test(text)) return '购物';
  if(/风景|景点|公园|广场|绿地|动物园|植物园/.test(text)) return '公园景点';
  if(/博物馆|展览|美术馆|艺术|文化|科技馆/.test(text)) return '文化展览';
  if(/运动|健身|球馆|游泳|冰场|娱乐|KTV|影院|剧院/.test(text)) return '休闲娱乐';
  return '周边热门';
}

function emojiForCategory(category){
  return ({
    '美食':'🍜',
    '购物':'🛍️',
    '公园景点':'🌿',
    '文化展览':'🎨',
    '休闲娱乐':'🎬',
  })[category] || '📍';
}

function durationForCategory(category){
  return ({
    '美食':90,
    '购物':120,
    '公园景点':90,
    '文化展览':120,
    '休闲娱乐':120,
  })[category] || 60;
}

function discoverTipFor(category, address){
  const place = address ? `，位置在${address}` : '';
  return ({
    '美食': `适合顺路吃饭或下午茶${place}`,
    '购物': `适合逛街、买点东西再吃饭${place}`,
    '公园景点': `适合散步放松，节奏轻一点${place}`,
    '文化展览': `适合慢慢逛和拍照打卡${place}`,
    '休闲娱乐': `适合朋友或家庭临时加一站${place}`,
  })[category] || `当前位置附近热度较高${place}`;
}

function renderDiscover(spots){
  if(!spots?.length){
    discoverList.innerHTML='<div class="disc-loading">附近暂时没有推荐地点</div>';
    return;
  }
  discoverList.innerHTML = spots.map(s=>`
    <div class="disc-card" onclick="discoverSpotDetail(${JSON.stringify(s).replace(/"/g,'&quot;')})">
      <div class="disc-top">
        <div class="disc-emoji">${s.img_emoji}</div>
        <div class="disc-body">
          <div class="disc-name">${esc(s.name)}</div>
          <div class="disc-cat">${esc(s.category)}</div>
          <div class="disc-heat">${s.heat} 热度</div>
        </div>
      </div>
      <div class="disc-tip">💡 ${esc(s.tip)}</div>
      <div class="disc-footer">
        <div class="disc-price">${s.price===0?'🆓 免费':`人均 ¥${s.price}`}</div>
        <div class="disc-add"><button onclick="event.stopPropagation();addDiscoverToChat('${esc(s.name)}')">加入计划 +</button></div>
      </div>
    </div>`).join('');
}

window.discoverSpotDetail = (s)=>{
  S.currentPlan = {
    title:s.name, total_minutes:s.duration_min, total_cost:s.price,
    steps:[{slot:'发现',time_range:'',order:1,why:s.tip,
            venue:{id:'d'+s.id,name:s.name,lat:s.lat,lng:s.lng,
                   address:`${s.category} · ${s.name}`,rating:4.5,
                   price_per_person:s.price,category:s.category,tags:[]}}]
  };
  switchPage('map');
};

window.addDiscoverToChat = (name)=>{
  switchPage('chat');
  setTimeout(()=>{
    inputEl.value=`我想在${planningTimeLabel()}去${name}，帮我规划一下`;
    inputEl.focus();
  },100);
};

// ===== 历史页 =====
function tripSteps(plan){
  return (plan?.steps || []).map(s=>`${s.slot}：${s.venue?.name || ''}`);
}

function normalizeTrip(item){
  const createdAt = item.created_at || item.date || new Date().toISOString();
  return {
    id: item.id,
    title: item.title || item.plan?.title || '未命名行程',
    summary: item.summary || '',
    steps: item.steps || tripSteps(item.plan),
    plan: item.plan,
    created_at: createdAt,
    date: formatHistoryDate(createdAt),
  };
}

function formatHistoryDate(value){
  const date = new Date(value);
  if(Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
}

async function loadHistory(){
  if(!S.auth.user || !S.auth.token) return S.history;
  try {
    const data = await authRequest('/api/history', { method:'GET' });
    S.history = (data.items || []).map(normalizeTrip);
  } catch(e) {
    S.history = [];
  }
  return S.history;
}

async function saveHistory(plan, summary = ''){
  if(!plan) return null;
  const payload = {
    title: plan.title || '未命名行程',
    summary: summary || '',
    steps: tripSteps(plan),
    plan,
  };
  if(S.auth.user && S.auth.token){
    try {
      const data = await authRequest('/api/history', {
        method:'POST',
        body:JSON.stringify(payload),
      });
      const item = normalizeTrip(data.item);
      S.history = [item, ...S.history.filter(h=>h.id !== item.id)].slice(0,20);
      if($('page-history')?.classList.contains('active')) renderHistoryPage();
      return item;
    } catch(e) {
      return null;
    }
  }
  const item = normalizeTrip({
    ...payload,
    id:Date.now(),
    created_at:new Date().toISOString(),
  });
  S.history = [item, ...S.history].slice(0,20);
  if($('page-history')?.classList.contains('active')) renderHistoryPage();
  return item;
}

async function renderHistoryPage(){
  if(S.auth.user && !S.history.length){
    historyList.classList.remove('is-empty');
    historyList.innerHTML = '<div class="disc-loading">加载中…</div>';
    await loadHistory();
  }
  const hist = S.history;
  if(!hist.length){
    historyList.classList.add('is-empty');
    historyList.innerHTML=`<div class="hist-empty">这里还空空的～ (｡•́︿•̀｡)<br>快去生成你的第一个出行方案吧，之后就能在这里回顾啦！</div>`;
    return;
  }
  historyList.classList.remove('is-empty');
  historyList.innerHTML = hist.map(h=>`
    <div class="hist-card">
      <div class="hist-head">
        <span class="hist-title">${esc(h.title)}</span>
        <span class="hist-time">${esc(h.date)}</span>
      </div>
      <div class="hist-steps">${h.steps.map(s=>`• ${esc(s)}`).join('<br>')}</div>
      <div class="hist-actions">
        <button class="hist-btn ghost" onclick="histView(${h.id})">🗺️ 查看路线</button>
        <button class="hist-btn primary" onclick="histRerun(${h.id})">🔄 重新安排</button>
      </div>
    </div>`).join('');
}

window.histView = (id)=>{
  const h = S.history.find(x=>String(x.id)===String(id));
  if(h){ S.currentPlan=h.plan; switchPage('map'); }
};
// ===== 接力浮层 =====
async function openRelay(plan, audience){
  S.currentPlan = plan;
  try {
    const card = await apiJson('/api/relay',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({plan,audience,scene:S.scene}),
    });
    const focus = card.focus_points.map(f=>`<div class="rfocus">${esc(f)}</div>`).join('');
    const actions = card.quick_actions.map((a,i)=>
      `<button class="ra ${i===0?'primary':'sec'}" data-i="${i}">${esc(a)}</button>`).join('');
    relayCard.innerHTML=`
      <div class="rh">${esc(card.headline)}</div>
      ${focus}
      <div class="ractions">${actions}</div>
      <div class="relay-hint">把手机递给${audience==='friends'?'朋友':'TA'}，一键拍板 ✓</div>`;
    relayCard.querySelectorAll('.ra').forEach(btn=>{
      btn.onclick=()=>{
        relayMask.hidden=true;
        if(+btn.dataset.i===0){
          msgBot(`✅ ${audience==='friends'?'朋友':'老婆'}同意了！那就按「${esc(card.quick_actions[0])}」执行。`);
          choosePlan(plan);
        } else {
          msgBot(`收到！「${esc(card.quick_actions[+btn.dataset.i])}」—— 告诉 Leo 新的要求，重新规划一版。`);
          inputEl.focus();
        }
      };
    });
  } catch(e){
    relayCard.innerHTML='<div style="padding:24px;text-align:center;color:var(--text-3)">加载失败，请重试</div>';
  }
  relayMask.hidden=false;
}
relayMask.onclick = e=>{ if(e.target===relayMask) relayMask.hidden=true; };

// ===== 确认方案 → 额外选项 → 执行 =====
function choosePlan(plan){
  S.currentPlan=plan; S.extras=[];
  S.planSummary = plan.steps.map(s=>`${s.slot}：${s.venue.name}`).join('，');

  const n = node(`<div class="msg bot" style="max-width:100%;width:100%;gap:6px">
    <div class="leo-av-msg">L</div>
    <div class="plan-card">
      <div class="plan-head"><span class="pt">确认「${esc(plan.title)}」</span></div>
      <div class="extras">
        <div class="el">顺手安排点小惊喜？（送到餐厅）</div>
        <div class="opts">
          <span class="opt" data-x="蛋糕">🎂 蛋糕</span>
          <span class="opt" data-x="鲜花">💐 鲜花</span>
          <span class="opt" data-x="买菜">🛒 宵夜食材</span>
        </div>
      </div>
      <div class="plan-actions">
        <button class="btn btn-blue js-ask2">💬 问 Leo</button>
        <button class="btn btn-primary js-exec">🚀 一键执行所有</button>
      </div>
    </div></div>`);

  n.querySelectorAll('.opt').forEach(o=>{
    o.onclick=()=>{
      o.classList.toggle('on');
      const x=o.dataset.x;
      S.extras=o.classList.contains('on')?[...S.extras,x]:S.extras.filter(v=>v!==x);
    };
  });
  n.querySelector('.js-exec').onclick=()=>doExecute(plan);
  n.querySelector('.js-ask2').onclick=()=>openAsk();
  chat.appendChild(n); scrollDown();
}

async function doExecute(plan){
  showThink('Leo 正在并行下单：预约餐厅、购票、安排惊喜…');
  let res;
  try {
    res = await apiJson('/api/execute',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({session_id:S.sessionId,plan,extras:S.extras}),
    });
  } catch(e){ hideThink(); msgBot('执行出错，请重试。'); return; }
  hideThink();
  renderExecResult(res, plan);
}

function renderExecResult(res, plan){
  // 情感化结尾文案：根据 extras 和场景定制
  const extras = S.extras || [];
  let emotionalNote = '';
  if(extras.includes('蛋糕') && extras.includes('鲜花')){
    emotionalNote = '蛋糕和鲜花已悄悄预订，等着给 TA 一个双重惊喜 🎂💐';
  } else if(extras.includes('蛋糕')){
    const mealName = plan.steps?.find(s=>s.slot==='正餐')?.venue?.name || '餐厅';
    emotionalNote = `蛋糕已悄悄送往${mealName}，等着给 TA 一个惊喜 🎂`;
  } else if(extras.includes('鲜花')){
    emotionalNote = '鲜花已在路上，让这个下午多一点美好 💐';
  } else if(res.all_success){
    const scenes = {'family':'全家出行，好好享受这个下午 🌿','friends':'朋友局出发，今天一定很好玩 🎉'};
    emotionalNote = scenes[S.scene] || '出发吧，好时光等着你 ✨';
  }

  const card = node(`<div class="msg bot" style="max-width:100%;width:100%;gap:6px">
    <div class="leo-av-msg">L</div>
    <div class="exec-card">
      <div class="eh">${res.all_success?'🎉 全部搞定！':'已尽力安排，部分需确认'}</div>
      <div class="exec-items-wrap"></div>
      ${emotionalNote ? `<div class="exec-emotional">${esc(emotionalNote)}</div>` : ''}
      <div class="share-box">${esc(res.itinerary.share_text)}</div>
      <button class="share-btn js-share">📤 复制行程，转发给家人 / 朋友</button>
      <button class="ask-btn js-ask">💬 问 Leo：路线怎么走 / 有什么建议</button>
      <button class="btn btn-primary js-poster" style="width:100%;margin-top:8px">🖼️ 生成行程海报</button>
    </div></div>`);

  card.querySelector('.js-share').onclick=()=>{
    navigator.clipboard?.writeText(res.itinerary.share_text);
    msgBot('✅ 行程文案已复制，去粘贴给家人吧！');
  };
  card.querySelector('.js-ask').onclick=()=>openAsk();
  card.querySelector('.js-poster').onclick=()=>generatePoster(plan, res);
  chat.appendChild(card); scrollDown();

  // stagger 逐条动画：每隔 120ms 滑入一项
  const wrap = card.querySelector('.exec-items-wrap');
  res.items.forEach((it, idx) => {
    setTimeout(() => {
      const icon = it.status==='success'?'✅':it.status==='fallback'?'🔄':'⚠️';
      const note = it.fallback_note ? `<div class="enote">↳ ${esc(it.fallback_note)}</div>` : '';
      const el = node(`<div class="exec-item exec-stagger ${it.status==='failed'?'failed':''}">
        <span class="ei">${icon}</span>
        <div class="ed"><b>${esc(it.action)}</b>　${esc(it.detail)}${note}</div>
      </div>`);
      wrap.appendChild(el);
      scrollDown();
    }, idx * 100);
  });

  S.currentPlan = plan;
  const delay = res.items.length * 100 + 400;
  setTimeout(()=>{
    msgBot('路线已就绪 🗺️　切换到「路线地图」页可查看全程和步行距离。');
  }, delay);
}


// ===== 行程海报生成（Canvas） =====
function generatePoster(plan, res){
  const W = 750, H = 1080;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  // 背景渐变
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#f0fdf8');
  bg.addColorStop(1, '#e8f5ef');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // 顶部装饰条
  const header = ctx.createLinearGradient(0, 0, W, 0);
  header.addColorStop(0, '#22c98a');
  header.addColorStop(1, '#18b67a');
  ctx.fillStyle = header;
  roundRect(ctx, 0, 0, W, 10, 0);
  ctx.fill();

  // Logo 区
  ctx.fillStyle = '#22c98a';
  ctx.font = 'bold 26px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillText('闲时达 Leisure Done', 48, 72);

  ctx.fillStyle = '#9ba3af';
  ctx.font = '18px "PingFang SC", "Microsoft YaHei", sans-serif';
  const now = new Date();
  const dateStr = `${now.getFullYear()}.${String(now.getMonth()+1).padStart(2,'0')}.${String(now.getDate()).padStart(2,'0')}`;
  ctx.fillText(dateStr, 48, 100);

  // 方案标题卡
  ctx.fillStyle = '#fff';
  roundRect(ctx, 40, 128, W - 80, 90, 16);
  ctx.fill();
  addShadow(ctx);
  ctx.shadowBlur = 0;

  ctx.fillStyle = '#1a1d23';
  ctx.font = 'bold 28px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillText(plan.title || '我的出行方案', 64, 174);

  ctx.fillStyle = '#5f6775';
  ctx.font = '17px "PingFang SC", "Microsoft YaHei", sans-serif';
  const metaText = `约 ${Math.round((plan.total_minutes||180)/60)} 小时  ·  预估人均 ¥${plan.total_cost||'—'}`;
  ctx.fillText(metaText, 64, 202);

  // 步骤时间线
  const steps = plan.steps || [];
  const startY = 256;
  const lineH = 120;
  steps.forEach((step, i) => {
    const y = startY + i * lineH;
    const v = step.venue || {};

    // 连接线
    if(i < steps.length - 1){
      ctx.strokeStyle = '#d1fae5';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(76, y + 44);
      ctx.lineTo(76, y + lineH);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 步骤圆点
    ctx.fillStyle = i === 0 ? '#22c98a' : '#ff8c42';
    ctx.beginPath();
    ctx.arc(76, y + 28, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(i + 1), 76, y + 33);
    ctx.textAlign = 'left';

    // 时间
    ctx.fillStyle = '#22c98a';
    ctx.font = 'bold 15px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText(step.time_range || '', 108, y + 22);

    // 场所名
    ctx.fillStyle = '#1a1d23';
    ctx.font = 'bold 20px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText(truncate(v.name || '', 14), 108, y + 46);

    // 类型标签
    ctx.fillStyle = '#edfaf4';
    roundRect(ctx, 108, y + 56, 70, 26, 13);
    ctx.fill();
    ctx.fillStyle = '#18a872';
    ctx.font = '13px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText(step.slot || '', 120, y + 74);

    // 地址
    ctx.fillStyle = '#9ba3af';
    ctx.font = '14px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText(truncate(v.address || '', 20), 190, y + 74);
  });

  // 底部高亮标签
  const highlightY = startY + steps.length * lineH + 20;
  const highlights = (plan.highlights || []).slice(0, 3);
  let tagX = 48;
  highlights.forEach(h => {
    const tw = ctx.measureText(h).width + 28;
    ctx.fillStyle = '#d1fae5';
    roundRect(ctx, tagX, highlightY, tw, 32, 16);
    ctx.fill();
    ctx.fillStyle = '#18a872';
    ctx.font = '14px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText(h, tagX + 14, highlightY + 21);
    tagX += tw + 10;
  });

  // 底部品牌水印
  ctx.fillStyle = '#c6f7e2';
  ctx.font = '15px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('由 闲时达 · Leo 规划  |  Leisure Done', W / 2, H - 36);
  ctx.textAlign = 'left';

  // 生成图片并展示
  const dataUrl = canvas.toDataURL('image/png');
  const wrapper = node(`<div class="msg bot" style="gap:6px">
    <div class="leo-av-msg">L</div>
    <div style="flex:1">
      <div class="bubble" style="margin-bottom:8px">海报生成完成！长按或右键保存，发给朋友圈吧 🎉</div>
      <img src="${dataUrl}" style="width:100%;max-width:320px;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,.12);display:block;cursor:pointer"
           onclick="this.requestFullscreen?.()" title="点击全屏查看">
    </div>
  </div>`);
  chat.appendChild(wrapper); scrollDown();
}

function roundRect(ctx, x, y, w, h, r){
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
function addShadow(ctx){
  ctx.shadowColor = 'rgba(0,0,0,.06)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 4;
}
function truncate(str, max){ return str.length > max ? str.slice(0, max) + '…' : str; }

// ===== 追问 Leo =====
let askContext='';
function openAsk(){
  askContext = [S.planSummary, planningMemorySummary()].filter(Boolean).join('\n');
  switchPage('assistant');
  setTimeout(()=>askInput?.focus(), 60);
}

async function sendAsk(){
  const msg = askInput.value.trim();
  if(!msg) return;
  askInput.value='';
  askChat.appendChild(node(`<div class="ask-row ask-row-user">
    <div class="ask-bubble user">${esc(msg)}</div>
    ${userAvatarHTML('ask-avatar')}
  </div>`));
  const loading = node(`<div class="ask-row ask-row-bot">
    ${leoAvatarHTML('ask-avatar')}
    <div class="ask-bubble bot"><span style="opacity:.4">Leo 思考中…</span></div>
  </div>`);
  askChat.appendChild(loading);
  askChat.scrollTop=askChat.scrollHeight;
  try {
    const data = await apiJson('/api/chat',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({message:msg,context:askContext}),
    });
    loading.querySelector('.ask-bubble').textContent=normalizeLeoReply(data.reply);
  } catch(e){ loading.querySelector('.ask-bubble').textContent='暂时无法回答，请稍后重试。'; }
  askChat.scrollTop=askChat.scrollHeight;
}
askSend.onclick=sendAsk;
askInput.onkeydown=e=>{ if(e.key==='Enter') sendAsk(); };

// ===== 主输入 =====
function submit(){
  const t=inputEl.value.trim(); if(!t) return;
  inputEl.value=''; doPlan(t);
}
sendBtn.onclick=submit;
inputEl.onkeydown=e=>{ if(e.key==='Enter') submit(); };
document.querySelectorAll('.chip').forEach(c=>{ c.onclick=()=>doPlan(c.dataset.text); });

// ===== 节日感知 =====
const HOLIDAYS = [
  { month:1,  day:1,  name:'元旦',     emoji:'🎊', hint:'新年快乐！Leo 帮你开启新一年的第一次出行 🎉' },
  { month:2,  day:14, name:'情人节',   emoji:'💕', hint:'情人节快乐！今天特别推荐适合二人的浪漫场所' },
  { month:3,  day:8,  name:'妇女节',   emoji:'🌺', hint:'女神节快乐！今天帮你安排一场专属的宠爱之行' },
  { month:5,  day:1,  name:'劳动节',   emoji:'🌼', hint:'五一快乐！假期出行高峰，Leo 帮你找到人少的好去处' },
  { month:5,  day:20, name:'520',      emoji:'💌', hint:'520 快乐！今天特别推荐适合两个人的甜蜜出行' },
  { month:6,  day:1,  name:'儿童节',   emoji:'🎈', hint:'儿童节快乐！今天 Leo 优先推荐孩子最爱的活动' },
  { month:10, day:1,  name:'国庆节',   emoji:'🎑', hint:'国庆快乐！假期出行人多，Leo 帮你避开人潮' },
  { month:12, day:24, name:'平安夜',   emoji:'🎄', hint:'平安夜快乐！圣诞氛围正浓，适合出门感受节日气氛' },
  { month:12, day:25, name:'圣诞节',   emoji:'🎅', hint:'圣诞快乐！Leo 帮你找到最有节日感的打卡地点' },
];

const LUNAR_HOLIDAYS = [
  { lunarMonth:1, day:1,  name:'春节',   emoji:'🧧', hint:'春节快乐！Leo 帮你安排一场热热闹闹的新春出行' },
  { lunarMonth:1, day:15, name:'元宵节', emoji:'🏮', hint:'元宵节快乐！适合看灯、散步和吃点甜甜的汤圆' },
  { lunarMonth:5, day:5,  name:'端午节', emoji:'🐉', hint:'端午安康！今天适合安排有民俗氛围或轻松散步的行程' },
  { lunarMonth:7, day:7,  name:'七夕',   emoji:'🌙', hint:'七夕快乐！Leo 为你精心挑选了浪漫的夜间场所' },
  { lunarMonth:8, day:15, name:'中秋节', emoji:'🥮', hint:'中秋快乐！今天适合赏月、团聚和轻松散步' },
];

let S_holiday = null;  // 当日节日信息（null 表示普通日）

function nthWeekdayOfMonth(year, month, weekday, nth){
  const first = new Date(year, month - 1, 1);
  const offset = (weekday - first.getDay() + 7) % 7;
  return 1 + offset + (nth - 1) * 7;
}

function dynamicHoliday(now){
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const motherDay = nthWeekdayOfMonth(year, 5, 0, 2);
  const fatherDay = nthWeekdayOfMonth(year, 6, 0, 3);
  if(month === 5 && day === motherDay){
    return { month, day, name:'母亲节', emoji:'🌷', hint:'母亲节快乐！今天帮你安排一场温柔又舒心的陪伴之行' };
  }
  if(month === 6 && day === fatherDay){
    return { month, day, name:'父亲节', emoji:'👨', hint:'父亲节快乐！今天帮你安排一场专属爸爸的出行' };
  }
  return null;
}

function lunarDateParts(now){
  try {
    const formatter = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', {
      month: 'long',
      day: 'numeric',
    });
    const parts = formatter.formatToParts(now);
    const rawMonth = parts.find(part => part.type === 'month')?.value || '';
    const rawDay = parts.find(part => part.type === 'day')?.value || '';
    const monthNames = {
      '正月': 1, '一月': 1, '二月': 2, '三月': 3, '四月': 4,
      '五月': 5, '六月': 6, '七月': 7, '八月': 8, '九月': 9,
      '十月': 10, '冬月': 11, '十一月': 11, '腊月': 12, '十二月': 12,
    };
    const normalizedMonth = rawMonth.replace(/^闰/, '');
    const lunarMonth = monthNames[normalizedMonth];
    const day = Number.parseInt(rawDay, 10);
    if(!lunarMonth || !day) return null;
    return { lunarMonth, day, isLeapMonth: rawMonth.startsWith('闰') };
  } catch(e) {
    return null;
  }
}

function lunarHoliday(now){
  const lunar = lunarDateParts(now);
  if(!lunar || lunar.isLeapMonth) return null;
  return LUNAR_HOLIDAYS.find(h => h.lunarMonth === lunar.lunarMonth && h.day === lunar.day) || null;
}

function detectHoliday(){
  const now = new Date();
  const m = now.getMonth() + 1;
  const d = now.getDate();
  S_holiday = lunarHoliday(now) || HOLIDAYS.find(h => h.month === m && h.day === d) || dynamicHoliday(now);
  return S_holiday;
}

function holidayPromptContext(){
  return S_holiday ? `（今天是${S_holiday.name}${S_holiday.emoji}，方案标题和推荐理由请融入节日氛围，优先推荐适合${S_holiday.name}的场所）` : '';
}

// ===== 天气感知：更新欢迎气泡 + 注入规划上下文 =====
let S_weather = '';   // 全局天气摘要（注入 DeepSeek prompt）

async function fetchWeather(){
  try {
    const ctrl = new AbortController();
    setTimeout(()=>ctrl.abort(), 4000);
    const url = apiUrl(`/api/amap/weather?city=${encodeURIComponent(S_location.city||DEFAULT_LOCATION.city)}`);
    if(!url) return;
    const r = await fetch(
      url,
      { signal: ctrl.signal }
    );
    if(!r.ok) return;
    const d = await r.json();
    const lives = d?.lives?.[0] || d?.live;
    if(!lives) return;
    const { weather, temperature, winddirection, windpower } = lives;
    S_weather = `今天${weather}，气温${temperature}℃，${winddirection}风${windpower}级`;

    // 更新欢迎气泡，加入天气标签
    const firstBubble = chat.querySelector('.msg.bot .bubble');
    if(firstBubble && !firstBubble.querySelector('.weather-tag')){
      const tag = document.createElement('span');
      tag.className = 'weather-tag';
      const icon = weather.includes('雨') ? '🌧️' : weather.includes('云') || weather.includes('阴') ? '⛅' : '☀️';
      tag.textContent = `${icon} ${weather} ${temperature}℃`;
      firstBubble.appendChild(tag);

      // 雨天提示
      if(weather.includes('雨')){
        setTimeout(()=>msgBot(`今天${weather}，Leo 会优先推荐室内活动，出门记得带伞 ☂️`), 600);
      }
    }
  } catch(e){ /* 天气获取失败，静默忽略 */ }
}

// ===== 真实地理位置获取 =====
// S_location 存储当前真实位置，会覆盖内置默认位置
const S_location = {
  lat: DEFAULT_LOCATION.lat,
  lng: DEFAULT_LOCATION.lng,
  city: DEFAULT_LOCATION.city,
  district: DEFAULT_LOCATION.district,
  businessArea: DEFAULT_LOCATION.businessArea,
  address: DEFAULT_LOCATION.address,
  hasUserLocation: false,
  ready: false,
  status: 'locating',
};
let locationReadyPromise = null;

function normalizeAmapText(value, fallback = ''){
  if(Array.isArray(value)) return value[0] || fallback;
  return value || fallback;
}

function pickBusinessArea(comp){
  const areas = comp?.businessAreas;
  if(Array.isArray(areas) && areas[0]?.name) return areas[0].name;
  return '';
}

function applyDefaultLocation(){
  Object.assign(S_location, {
    ...DEFAULT_LOCATION,
    hasUserLocation: false,
    ready: true,
    status: 'failed',
  });
  updateLocationUI();
  refreshLocationBoundViews();
}

async function getUserLocation(){
  S_location.status = 'locating';
  S_location.ready = false;
  updateLocationUI();
  if(!navigator.geolocation){
    console.log('[位置] 浏览器不支持 Geolocation');
    applyDefaultLocation();
    return;
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        S_location.lat = latitude;
        S_location.lng = longitude;
        S_location.businessArea = '当前位置';
        S_location.district = '';
        S_location.address = '';

        // 高德逆地理编码：坐标 → 区/街道/城市
        try {
          const ctrl = new AbortController();
          setTimeout(() => ctrl.abort(), 5000);
          const url = apiUrl(`/api/amap/regeo?lng=${encodeURIComponent(longitude)}&lat=${encodeURIComponent(latitude)}`);
          if(!url) throw new Error('Missing API base');
          const r = await fetch(
            url,
            { signal: ctrl.signal }
          );
          const d = r.ok ? await r.json() : null;
          const comp = d?.addressComponent;
          if(comp){
            S_location.city = normalizeAmapText(comp.city, normalizeAmapText(comp.province, S_location.city));
            S_location.district = normalizeAmapText(comp.district, normalizeAmapText(comp.township, S_location.district));
            S_location.businessArea = pickBusinessArea(comp) || normalizeAmapText(comp.township, '') || S_location.district || S_location.businessArea;
            S_location.address  = d.formatted_address || '';
          }
        } catch(e){ /* 逆地理失败，保留默认 */ }

        S_location.hasUserLocation = true;
        S_location.ready = true;
        S_location.status = 'ready';
        updateLocationUI();
        refreshLocationBoundViews();
        resolve();
      },
      (err) => {
        // 用户拒绝或超时，回到天安门，不再使用望京默认值
        console.log('[位置] 获取失败:', err.message);
        applyDefaultLocation();
        resolve();
      },
      { timeout: 8000, maximumAge: 300000 }
    );
  });
}

function updateLocationUI(){
  // 更新侧边栏和移动端顶栏的位置显示
  const displayName = getLocationDisplayName();
  document.querySelectorAll('.sb-loc').forEach(el => {
    el.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1112 6a2.5 2.5 0 010 5z" fill="#22c98a"/></svg>${displayName}`;
  });
  document.querySelectorAll('.mob-loc').forEach(el => {
    el.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1112 6a2.5 2.5 0 010 5z" fill="#22c98a"/></svg>${displayName}`;
  });
  updateDiscoverHeader();
}

function updateDiscoverHeader(){
  const sub = document.querySelector('#page-discover .ph-sub');
  const area = getLocationPlanningName();
  const label = area === '当前位置' ? area : `${area}商圈`;
  if(sub) sub.textContent = `${label} · 周边热门`;
}

function refreshLocationBoundViews(){
  if($('page-map')?.classList.contains('active')) initMapPage();
  if(discoverList?.dataset.loaded){
    delete discoverList.dataset.loaded;
    if($('page-discover')?.classList.contains('active')) initDiscoverPage();
  }
}

// 把天气注入 aiPlanFromText 的 userText 上下文，同时注入真实位置
const _origAiPlan = aiPlanFromText;
window.aiPlanFromText = async function(userText){
  const locInfo = S_location.ready && S_location.address
    ? `（用户当前位置：${S_location.address}，城市：${S_location.city}）`
    : S_location.ready && S_location.district
    ? `（用户当前位置：${S_location.district}，城市：${S_location.city}）`
    : '';
  const weatherInfo = S_weather ? `（当前天气：${S_weather}）` : '';
  const holidayInfo = holidayPromptContext();
  return _origAiPlan(userText + locInfo + weatherInfo + holidayInfo);
};

// ===== P2：历史行程"重新规划"升级 =====
window.histRerun = (id) => {
  const h = S.history.find(x=>String(x.id)===String(id));
  if(!h) return;
  switchPage('chat');
  setTimeout(()=>{
    const desc = `${h.title}（${h.steps.join('、')}）— 帮我重新规划一个类似的下午`;
    inputEl.value = desc;
    inputEl.focus();
    doPlan(desc);
  }, 150);
};

// ===== 初始化 =====
syncViewportLayout();
window.addEventListener('resize', syncViewportLayout);
renderWelcomeBubble();
restoreAuth();
updateLocationUI();
initMapPage();
// 先获取位置，再获取天气（天气需要城市信息）
locationReadyPromise = getUserLocation().then(() => {
  // 用真实城市更新天气查询
  fetchWeather();
});
// 天气查询也用真实城市（异步竞争，fetchWeather 内部读 S_location.city）
