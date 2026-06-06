// 闲时达 · Leisure Done  —  v3 UI
// 四页 SPA：对话规划 / 路线地图 / 灵感发现 / 历史行程
// -------------------------------------------------------

// ── file:// 协议检测：DeepSeek 和高德地图必须在 HTTP 下运行 ──
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
      <b>⚠️ 请用本地服务器打开，直接双击 HTML 无法调用 AI 和地图</b><br>
      <span style="color:#555">浏览器安全策略（CORS）会拦截 file:// 的网络请求。</span><br>
      <b>解决方法：</b>在项目根目录运行<br>
      <code style="background:#f2f2f2;padding:2px 8px;border-radius:4px;font-size:12px">python serve.py</code><br>
      然后浏览器访问 <code style="background:#f2f2f2;padding:2px 8px;border-radius:4px">http://localhost:8080</code>
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
};

// ===== DOM 引用 =====
const $ = id => document.getElementById(id);
const chat        = $('chat');
const inputEl     = $('input');
const sendBtn     = $('send');
const relayMask   = $('relayMask');
const relayCard   = $('relayCard');
const askMask     = $('askMask');
const askChat     = $('askChat');
const askInput    = $('askInput');
const askSend     = $('askSend');
const askClose    = $('askClose');
const mapTitle    = $('mapTitle');
const mapMeta     = $('mapMeta');
const mapSteps    = $('mapSteps');
const discoverList = $('discoverList');
const historyList  = $('historyList');
const acEmpty     = $('acEmpty');
const acContent   = $('acContent');

// ===== 工具 =====
function esc(s){ return (s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function scrollDown(){ chat.scrollTop = chat.scrollHeight; }
function node(html){ const d=document.createElement('div'); d.innerHTML=html.trim(); return d.firstChild; }

const CFG = () => window.APP_CONFIG || {};

// ── 后端 API（有后端时走后端，否则跳过）──
const BACKEND_ORIGIN = 'http://127.0.0.1:8848';
async function tryBackend(url, options = {}){
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2000);
    const r = await fetch(BACKEND_ORIGIN + url, { ...options, signal: ctrl.signal });
    clearTimeout(t);
    if(r.ok) return r.json();
  } catch(e) { /* 后端不可用，忽略 */ }
  return null;
}

// ── 高德 REST POI 搜索（5 秒超时，失败静默返回空数组）──
async function amapPoiSearch(keywords, types = '', city = '北京'){
  const key = CFG().AMAP_REST_KEY;
  if(!key) return [];
  const params = new URLSearchParams({
    key, keywords, types, city, offset: '6', output: 'json'
  });
  const url = `https://restapi.amap.com/v3/place/text?${params}`;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    const data = await r.json();
    if(data.status === '1' && data.pois?.length){
      return data.pois.map(p => ({
        name: p.name,
        address: p.address || '',
        type: p.type || '',
        lat: parseFloat((p.location||'0,0').split(',')[1]) || 0,
        lng: parseFloat((p.location||'0,0').split(',')[0]) || 0,
        rating: parseFloat(p.biz_ext?.rating) || 4.5,
        cost: parseInt(p.biz_ext?.cost) || 0,
      }));
    }
    return [];
  } catch(e){ return []; }  // 超时或 CORS 失败，静默返回空，DeepSeek 用自身知识兜底
}

// ── DeepSeek 直接调用 ──
async function callDeepSeek(systemPrompt, userContent, jsonMode = false){
  const key = CFG().DEEPSEEK_API_KEY;
  if(!key) throw new Error('MISSING_KEY');

  // file:// 协议下 fetch 会被浏览器 CORS 拦截，提前拦截给友好提示
  if(window.location.protocol === 'file:'){
    throw new Error('FILE_PROTOCOL');
  }

  const body = {
    model: CFG().DEEPSEEK_MODEL || 'deepseek-chat',
    max_tokens: 2048,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userContent  },
    ],
  };
  if(jsonMode) body.response_format = { type: 'json_object' };
  let r;
  try {
    r = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch(e) {
    throw new Error('NETWORK_ERROR');
  }
  if(!r.ok) throw new Error(`API_ERROR_${r.status}`);
  const d = await r.json();
  return d.choices[0].message.content;
}

// ── 核心：用 DeepSeek + 高德 POI 生成真实规划方案 ──
async function aiPlanFromText(userText){
  const city = CFG().USER_CITY || '北京';
  const loc  = CFG().USER_LOCATION || '望京';

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
    `你是「闲时达」本地生活规划 AI Leo。根据用户需求和高德 POI 数据，生成 2 套个性化出行方案。

只返回纯 JSON（不要任何 markdown 代码块），格式如下：
{"intent_summary":"一句话总结","constraints":[{"key":"约束名","reason":"推断原因"}],"plans":[{"id":"plan_1","title":"方案名","highlights":["亮点1","亮点2","亮点3"],"total_minutes":180,"total_cost":200,"steps":[{"order":1,"slot":"活动","time_range":"14:00-15:30","venue_name":"场所名","venue_address":"详细地址","venue_lat":40.003,"venue_lng":116.472,"why":"具体理由"}]}]}

规则：①优先从 POI 数据选真实场所 ②POI 为空时用你对北京望京的知识推断真实场所（坐标精确，望京 lat:39.99-40.01 lng:116.46-116.50）③why 必须结合用户约束 ④生成 2 套风格不同方案 ⑤total_cost 是整个行程人均费用（元）。`,
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
          lat: s.venue_lat || matched?.lat || 40.0000,
          lng: s.venue_lng || matched?.lng || 116.4700,
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
      '你是「闲时达」本地生活助手 Leo，回答关于路线、活动、餐厅的问题，简洁有用，100 字内，不说"打开地图"。',
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

const MOCK_SPOTS = [
  {id:1,name:'望京小街',category:'citywalk',heat:96,tip:'轻松逛吃，离家近，适合下午随走随停',price:0,duration_min:80,lat:40.0032,lng:116.4718,img_emoji:'街'},
  {id:2,name:'麒麟新天地亲子乐园',category:'亲子活动',heat:91,tip:'孩子有消耗体力的空间，家长也能坐下休息',price:88,duration_min:90,lat:39.9987,lng:116.4662,img_emoji:'乐'},
  {id:3,name:'轻食餐厅 Green Table',category:'轻食餐厅',heat:87,tip:'有低卡套餐和儿童椅，适合减脂期晚餐',price:76,duration_min:60,lat:40.0014,lng:116.4765,img_emoji:'餐'},
];

function mockPlanResponse(text = ''){
  const isFriends = /朋友|同事|聚会|团建|哥们|姐妹|4|四/.test(text);
  const isFamily = /老婆|老公|孩子|宝宝|家庭|亲子|妻子|丈夫/.test(text);
  const scene = isFamily ? 'family' : isFriends ? 'friends' : 'solo';
  const partySize = isFamily ? 3 : isFriends ? 4 : 1;
  const activity = {
    id:'mock_activity', name:'麒麟新天地亲子乐园', category:'亲子活动',
    distance_km:1.2, travel_minutes:12, rating:4.7, price_per_person:88,
    tags:['亲子友好','不远','可预约'], kid_friendly:true, has_reservation:true,
    queue_minutes:10, description:'适合 5 岁孩子放电', address:'望京麒麟新天地 B1',
    lat:39.9987, lng:116.4662,
  };
  const restaurant = {
    id:'mock_restaurant', name:'Green Table 轻食餐厅', category:'餐厅',
    distance_km:0.7, travel_minutes:8, rating:4.6, price_per_person:76,
    tags:['低卡','儿童椅','近'], kid_friendly:true, has_reservation:true,
    queue_minutes:5, description:'低卡套餐和儿童餐都比较稳', address:'望京小街 2 层',
    lat:40.0014, lng:116.4765, cuisine:'轻食', low_cal_options:true,
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
      location:'望京',
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
  if(url.includes('/api/discover')) return {spots:MOCK_SPOTS, home:{lat:40.0000,lng:116.4700,name:'望京'}};
  if(url.includes('/api/relay')) return {
    audience:'spouse',
    headline:'这个安排离家近、晚餐也照顾减脂，不会折腾。',
    plan_id:'mock_family_kid',
    focus_points:['路程短，孩子累了也好撤','晚餐有低卡选项','活动和吃饭都不用久等'],
    quick_actions:['同意，就按这个来','想再轻松一点','晚餐换一家']
  };
  if(url.includes('/api/execute')) return {
    all_success:true,
    items:[
      {action:'活动预约',target:'麒麟新天地亲子乐园',status:'success',detail:'已生成模拟预约'},
      {action:'餐厅订位',target:'Green Table 轻食餐厅',status:'success',detail:'已生成模拟订位'}
    ],
    itinerary:{
      summary:'下午亲子活动加轻食晚餐，轻松不远。',
      timeline:['14:30 亲子乐园','16:20 轻食晚餐'],
      share_text:'今天下午：14:30 去亲子乐园，16:20 吃轻食晚餐，路线都在望京附近。'
    }
  };
  if(url.includes('/api/chat')) return {reply:'建议步行或骑行，两个点都在望京附近，路上大约 8 到 12 分钟。'};
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

// ===== 导航（侧边栏 + 底部 Tab 统一处理）=====
function switchPage(name){
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab, .sb-item').forEach(t => t.classList.remove('active'));
  $(`page-${name}`).classList.add('active');
  document.querySelectorAll(`[data-page="${name}"]`).forEach(el => el.classList.add('active'));

  if(name === 'map')      initMapPage();
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

  let data;
  try {
    data = await apiJson('/api/plan', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({text}),
    });
  } catch(e){
    hideThink();
    const msg = e?.message || '';
    if(msg === 'FILE_PROTOCOL'){
      msgBot(`需要用本地服务器访问才能调用 AI。<br><br>
请在项目根目录运行：<br>
<code style="background:#f2f3f5;padding:2px 8px;border-radius:4px;font-size:12px">python serve.py</code><br>
然后访问 <code style="background:#f2f3f5;padding:2px 8px;border-radius:4px">http://localhost:8080</code>`);
    } else if(msg === 'NETWORK_ERROR'){
      msgBot('网络请求失败，请检查网络连接，或确认正在通过 <code>http://localhost:8080</code> 访问。');
    } else if(msg === 'MISSING_KEY'){
      msgBot('未检测到 DeepSeek API Key，请检查 config.js 配置。');
    } else {
      msgBot(`Leo 遇到了问题：${esc(msg) || '未知错误'}，请稍后重试。`);
    }
    return;
  }
  hideThink();

  S.sessionId     = data.session_id;
  S.scene         = data.intent.scene;
  S.plans         = data.plans;
  S.currentIntent = data.intent;

  // 渲染右侧分析面板（桌面）
  renderAnalysisPanel(data.intent);
  // 聊天流里给个简短确认
  msgBot(`好的！Leo 已识别关键信息（右侧面板可查看）。<br>以下是为「${sceneLabel(data.intent)}」量身定制的方案：`);
  data.plans.forEach(p => renderPlan(p, p.id === data.recommended_plan_id));
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

function renderAnalysisPanel(intent){
  const inferred = (intent.constraints||[]).filter(c=>c.source==='inferred');
  if(!inferred.length) return;

  acEmpty.hidden = true;
  acContent.hidden = false;

  const rows = inferred.map(c=>`
    <div class="con-row">
      <div class="con-check">
        <svg viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5 3.5-4" stroke="#22c98a" stroke-width="1.5" stroke-linecap="round"/></svg>
      </div>
      <span class="con-key">${esc(consIcon[c.key]||'')} ${esc(consMap[c.key]||c.key)}</span>
      <span class="con-val">${esc(c.reason)}</span>
    </div>`).join('');

  // 出行信息摘要
  const members = intent.members||[];
  const hasChild = members.some(m=>m.role==='child');
  const child = members.find(m=>m.role==='child');
  const spouse = members.find(m=>m.role==='spouse');

  const infoRows = [
    `<div class="con-row"><span class="con-key">👥 出行人数</span><span class="con-val">${intent.party_size} 人</span></div>`,
    hasChild ? `<div class="con-row"><span class="con-key">🧒 儿童年龄</span><span class="con-val">${child?.age||5} 岁</span></div>` : '',
    spouse?.note ? `<div class="con-row"><span class="con-key">💪 健康需求</span><span class="con-val">${esc(spouse.note)}</span></div>` : '',
    `<div class="con-row"><span class="con-key">⏱ 目标时长</span><span class="con-val">约 ${intent.duration_hours} 小时</span></div>`,
  ].filter(Boolean).join('');

  acContent.innerHTML = `
    <div class="intent-card">
      <div class="ic-header"><div class="ic-dot"></div><div class="ic-title">出行信息</div></div>
      ${infoRows}
    </div>
    <div class="intent-card">
      <div class="ic-header"><div class="ic-dot"></div><div class="ic-title">Leo 推断的关键需求</div></div>
      ${rows}
    </div>`;
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
  const steps = plan.steps.map((s,i)=>`
    <div class="step">
      <div class="step-time">${esc(s.time_range.split('-')[0]||'')}</div>
      <div class="dot">${slotIcon(s.slot)}</div>
      <div class="sbody">
        <div class="sslot">${esc(s.slot)}</div>
        <div class="sname">${esc(s.venue.name)}</div>
        <div class="swhy">${esc(s.why)}</div>
        ${s.venue.address ? `<div class="saddr" onclick="openMapForVenue('${s.venue.id}')">📍 ${esc(s.venue.address)}</div>` : ''}
      </div>
    </div>`).join('');
  const tags = plan.highlights.map(h=>`<span class="t">${esc(h)}</span>`).join('');
  const aud  = S.scene==='friends'?'friends':'spouse';
  const audLabel = S.scene==='friends'?'朋友':'老婆';

  const n = node(`<div class="msg bot" style="max-width:100%;width:100%;gap:6px">
    <div class="leo-av-msg">L</div>
    <div class="plan-card ${recommended?'recommended':''}">
      <div class="plan-head">
        <span class="pt">${esc(plan.title)}</span>
        ${recommended?'<span class="badge">推荐</span>':''}
      </div>
      <div class="plan-meta">约 ${Math.round(plan.total_minutes/60)} 小时 · 预估总花费 ¥${plan.total_cost}</div>
      <div class="plan-steps">${steps}</div>
      <div class="plan-tags">${tags}</div>
      <div class="relay-trigger">
        <button class="rt">📲 递给${audLabel}一起看</button>
      </div>
      <div class="plan-actions">
        <button class="btn btn-blue js-map">🗺️ 看路线</button>
        <button class="btn btn-primary js-choose">确认这个方案 →</button>
      </div>
    </div></div>`);

  n.querySelector('.rt').onclick    = () => openRelay(plan, aud);
  n.querySelector('.js-map').onclick = () => loadPlanToMap(plan);
  n.querySelector('.js-choose').onclick = () => choosePlan(plan);
  chat.appendChild(n); scrollDown();
}
function slotIcon(slot){ return ({'活动':'🎯','正餐':'🍽','附加活动':'✨'})[slot]||'📍'; }

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

// ── 高德地图实现 ──
async function initMapWithAmap(){
  if(!S.mapInstance || S.mapInstance._type !== 'amap'){
    // 清除可能存在的 Leaflet 实例
    if(S.mapInstance && S.mapInstance._type === 'leaflet'){
      S.mapInstance.remove();
      S.mapInstance = null;
      $('map').innerHTML = '';
    }
    S.mapInstance = new AMap.Map('map', { zoom:14, center:[116.4700,40.0000], viewMode:'2D' });
    S.mapInstance._type = 'amap';
  }
  clearAmap();

  const plan = S.currentPlan;
  if(!plan || !plan.steps.length){
    mapTitle.textContent='路线地图';
    mapMeta.textContent='选好方案后，在规划页点「看路线」';
    mapSteps.innerHTML=`<div class="map-empty"><div class="map-empty-icon">🗺️</div><div>选好方案后<br>点击「看路线」即可显示全程</div></div>`;
    try {
      const d = await apiJson('/api/discover');
      (d.spots||[]).forEach(s=>{
        createAmapMarker(s,'<div class="amap-pin discover">•</div>',s.name);
      });
      S.mapInstance.setFitView();
    } catch(e){}
    return;
  }

  mapTitle.textContent = plan.title || '路线地图';
  const home = {lat:40.0000,lng:116.4700,name:'望京'};
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
    ? `${plan.steps.length} 个站点 · 步行约 ${formatDistance(stats.distance)} · ${Math.ceil(stats.duration/60)} 分钟`
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
    const lmap = L.map('map').setView([40.0000,116.4700],14);
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
  const plan  = S.currentPlan;

  if(!plan || !plan.steps.length){
    mapTitle.textContent = '路线地图';
    mapMeta.textContent  = '选好方案后，在规划页点「看路线」';
    mapSteps.innerHTML   = `<div class="map-empty"><div class="map-empty-icon">🗺️</div><div>选好方案后<br>点击「看路线」即可显示全程</div></div>`;
    setTimeout(()=>lmap.invalidateSize(),80);
    return;
  }

  mapTitle.textContent = plan.title || '路线地图';

  // 出发点
  const homeMarker = L.marker([40.0000,116.4700],{
    icon: L.divIcon({html:'<div class="amap-pin home" style="background:#22c98a;color:#fff;border-radius:50%;width:30px;height:30px;display:grid;place-items:center;font-size:14px;box-shadow:0 2px 8px rgba(34,201,138,.4)">🏠</div>',iconSize:[30,30],className:'',iconAnchor:[15,30]})
  }).addTo(lmap);
  S.mapLayers.push(homeMarker);

  const points = [[40.0000,116.4700]];
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
    stepCards.push(makeStepCard(step,v,i,`🚶 步行约 ${dist<1000?dist+'m':(dist/1000).toFixed(1)+'km'}，约 ${walkMin} 分钟`));
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
  return meters < 1000 ? `${Math.round(meters)}m` : `${(meters/1000).toFixed(1)}km`;
}
async function renderAmapWalkingRoute(points){
  const backendRoute = await fetchBackendWalkingRoute(points);
  if(backendRoute?.ok){
    renderBackendRoutePolyline(backendRoute);
    backendRoute.legs.forEach((leg, i)=>{
      const distNode = $(`route-leg-${i}`)?.querySelector('.ms-dist');
      if(distNode) distNode.textContent = `后端高德步行 ${formatDistance(leg.distance)}，约 ${Math.ceil(leg.duration/60)} 分钟`;
    });
    return {
      distance: Number(backendRoute.distance || 0),
      duration: Number(backendRoute.duration || 0),
    };
  }

  let totalDistance = 0;
  let totalDuration = 0;
  if(points.length < 2) return {distance:0, duration:0};

  for(let i=1; i<points.length; i++){
    const leg = await searchAmapWalking(points[i-1], points[i]);
    const distNode = $(`route-leg-${i-1}`)?.querySelector('.ms-dist');
    if(leg.ok){
      totalDistance += leg.distance;
      totalDuration += leg.duration;
      if(distNode) distNode.textContent = `高德步行 ${formatDistance(leg.distance)}，约 ${Math.ceil(leg.duration/60)} 分钟`;
    } else if(distNode) {
      distNode.textContent = '高德路线规划失败，已保留站点';
    }
  }
  return {distance:totalDistance, duration:totalDuration};
}

async function fetchBackendWalkingRoute(points){
  try {
    return await apiJson('/api/amap/walking', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({points}),
    });
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
  try {
    const data = await apiJson('/api/discover');
    renderDiscover(data.spots);
  } catch(e){
    discoverList.innerHTML='<div class="disc-loading" style="color:var(--red)">加载失败，请重试</div>';
  }
}

function renderDiscover(spots){
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
  setTimeout(()=>{ inputEl.value=`我想去${name}，帮我规划一下下午`; inputEl.focus(); },100);
};

// ===== 历史页 =====
const HIST_KEY = 'leisureDoneHistory';

function saveHistory(plan, summary){
  const hist = JSON.parse(localStorage.getItem(HIST_KEY)||'[]');
  hist.unshift({
    id:Date.now(), planId:plan.id, title:plan.title, summary,
    steps:plan.steps.map(s=>`${s.slot}：${s.venue.name}`),
    plan,
    date:new Date().toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}),
  });
  localStorage.setItem(HIST_KEY,JSON.stringify(hist.slice(0,20)));
}

function renderHistoryPage(){
  const hist = JSON.parse(localStorage.getItem(HIST_KEY)||'[]');
  if(!hist.length){
    historyList.innerHTML=`<div class="hist-empty"><div class="hist-empty-icon">📭</div>还没有历史行程<br><span style="font-size:12px">规划并执行一次方案后，记录会出现在这里</span></div>`;
    return;
  }
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
  const h = JSON.parse(localStorage.getItem(HIST_KEY)||'[]').find(x=>x.id===id);
  if(h){ S.currentPlan=h.plan; switchPage('map'); }
};
window.histRerun = (id)=>{
  const h = JSON.parse(localStorage.getItem(HIST_KEY)||'[]').find(x=>x.id===id);
  if(h){ choosePlan(h.plan); switchPage('chat'); }
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
  const items = res.items.map(it=>{
    const icon = it.status==='success'?'✅':it.status==='fallback'?'🔄':'⚠️';
    const note = it.fallback_note?`<div class="enote">↳ ${esc(it.fallback_note)}</div>`:'';
    return `<div class="exec-item ${it.status==='failed'?'failed':''}">
      <span class="ei">${icon}</span>
      <div class="ed"><b>${esc(it.action)}</b>　${esc(it.detail)}${note}</div>
    </div>`;
  }).join('');

  const n = node(`<div class="msg bot" style="max-width:100%;width:100%;gap:6px">
    <div class="leo-av-msg">L</div>
    <div class="exec-card">
      <div class="eh">${res.all_success?'🎉 全部搞定！':'已尽力安排，部分需确认'}</div>
      ${items}
      <div class="share-box">${esc(res.itinerary.share_text)}</div>
      <button class="share-btn js-share">📤 复制行程，转发给家人 / 朋友</button>
      <button class="ask-btn js-ask">💬 问 Leo：路线怎么走 / 有什么建议</button>
    </div></div>`);

  n.querySelector('.js-share').onclick=()=>{
    navigator.clipboard?.writeText(res.itinerary.share_text);
    msgBot('✅ 行程文案已复制，去粘贴给家人吧！');
    saveHistory(plan, res.itinerary.summary);
  };
  n.querySelector('.js-ask').onclick=()=>openAsk();
  chat.appendChild(n); scrollDown();

  S.currentPlan = plan;
  setTimeout(()=>msgBot('路线已就绪 🗺️　切换到「路线地图」页可查看全程和步行距离。'),700);
}

// ===== 追问 Leo =====
let askContext='';
function openAsk(){
  askContext = S.planSummary;
  askMask.hidden=false;
  askInput.focus();
}
askClose.onclick=()=>{ askMask.hidden=true; };
askMask.onclick=e=>{ if(e.target===askMask) askMask.hidden=true; };

async function sendAsk(){
  const msg = askInput.value.trim();
  if(!msg) return;
  askInput.value='';
  askChat.appendChild(node(`<div class="ask-bubble user">${esc(msg)}</div>`));
  const loading = node(`<div class="ask-bubble bot"><span style="opacity:.4">Leo 思考中…</span></div>`);
  askChat.appendChild(loading);
  askChat.scrollTop=askChat.scrollHeight;
  try {
    const data = await apiJson('/api/chat',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({message:msg,context:askContext}),
    });
    loading.textContent=data.reply;
  } catch(e){ loading.textContent='暂时无法回答，请稍后重试。'; }
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

// ===== Initialize AMap =====
initMapPage();
