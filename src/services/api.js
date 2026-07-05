const STATIC_DEMO = import.meta.env.VITE_STATIC_DEMO === 'true'

const hotspotPositions = [
  { x: 22, y: 36 },
  { x: 42, y: 58 },
  { x: 58, y: 33 },
  { x: 73, y: 56 },
  { x: 86, y: 42 }
]

const modeKeywords = {
  shopping: { label: '购物', keyword: '购物中心', icon: '🛍️', color: '#f06d4f' },
  stay: { label: '住宿', keyword: '酒店', icon: '🏨', color: '#7f62d9' },
  transit: { label: '交通', keyword: '地铁站', icon: '🚇', color: '#2e7ecb' },
  food: { label: '饮食', keyword: '餐厅', icon: '🥢', color: '#d28a20' }
}

function areaNameFromPoint(x = 50, y = 50) {
  const horizontal = x < 34 ? '西侧' : x > 66 ? '东侧' : '中轴'
  const vertical = y < 34 ? '北段' : y > 66 ? '南段' : '核心区'
  return `${horizontal}${vertical}`
}

function svgMap(destination, focus = '城市中轴', mode = 'food') {
  const modeInfo = modeKeywords[mode] || modeKeywords.food
  const title = `${destination} · ${focus}`
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900">
    <defs>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="8" stdDeviation="8" flood-color="#1b1b1b" flood-opacity=".18"/>
      </filter>
      <pattern id="blocks" width="110" height="76" patternUnits="userSpaceOnUse">
        <rect x="9" y="9" width="42" height="20" rx="2" fill="none" stroke="#9ea49b" stroke-width="2"/>
        <rect x="62" y="16" width="35" height="18" rx="2" fill="none" stroke="#b1b5ad" stroke-width="2"/>
        <path d="M0 64H110M104 0V76" stroke="#c7c9c1" stroke-width="2"/>
      </pattern>
    </defs>
    <rect width="1600" height="900" fill="#efece1"/>
    <rect x="30" y="30" width="1540" height="840" rx="36" fill="#f8f5ea" stroke="#141414" stroke-width="4"/>
    <rect x="30" y="30" width="1540" height="86" rx="36" fill="#fbfaf4" stroke="#141414" stroke-width="4"/>
    <circle cx="68" cy="73" r="10" fill="none" stroke="#c8c2b7" stroke-width="4"/>
    <circle cx="98" cy="73" r="10" fill="none" stroke="#c8c2b7" stroke-width="4"/>
    <circle cx="128" cy="73" r="10" fill="none" stroke="#c8c2b7" stroke-width="4"/>
    <rect x="165" y="48" width="410" height="46" rx="23" fill="#fffdf6" stroke="#111" stroke-width="3"/>
    <text x="190" y="78" font-family="monospace" font-size="22" font-weight="700" fill="#111">${title}</text>
    <rect x="1360" y="48" width="95" height="46" rx="23" fill="#111"/>
    <text x="1386" y="78" font-family="sans-serif" font-size="18" font-weight="700" fill="#fff">Map</text>
    <rect x="30" y="116" width="1540" height="700" fill="url(#blocks)"/>
    <rect x="620" y="145" width="360" height="610" fill="#cfe0c0" stroke="#7c986f" stroke-width="4"/>
    <rect x="690" y="230" width="220" height="130" fill="#ead4b3" stroke="#8c6d46" stroke-width="5"/>
    <rect x="665" y="520" width="270" height="145" fill="#e8dac1" stroke="#8c6d46" stroke-width="5"/>
    <path d="M790 150V765" stroke="#d94735" stroke-width="12"/>
    <path d="M108 476H1492" stroke="#2d79bd" stroke-width="8"/>
    <path d="M260 680C430 610 520 670 650 590C805 492 930 520 1110 420C1250 340 1350 360 1450 300" fill="none" stroke="#222" stroke-width="4" stroke-dasharray="12 10"/>
    <rect x="655" y="180" width="290" height="62" rx="10" fill="#fffdf6" stroke="#111" stroke-width="3" filter="url(#shadow)"/>
    <text x="678" y="219" font-family="sans-serif" font-size="26" font-weight="800" fill="#111">${destination} 旅行地图</text>
    <rect x="1020" y="266" width="260" height="58" rx="10" fill="#fffdf6" stroke="#111" stroke-width="3" filter="url(#shadow)"/>
    <text x="1040" y="303" font-family="sans-serif" font-size="24" font-weight="800" fill="#111">${modeInfo.icon} ${modeInfo.label}探索</text>
    <rect x="475" y="424" width="185" height="70" rx="10" fill="#f7d8cf" stroke="#d94735" stroke-width="3"/>
    <text x="505" y="468" font-family="sans-serif" font-size="24" font-weight="800" fill="#111">点击继续</text>
    <circle cx="790" cy="476" r="58" fill="#fffdf6" stroke="#111" stroke-width="4" filter="url(#shadow)"/>
    <circle cx="790" cy="476" r="20" fill="${modeInfo.color}"/>
    <path d="M790 402V550M716 476H864" stroke="${modeInfo.color}" stroke-width="8"/>
    <rect x="1200" y="665" width="275" height="115" rx="14" fill="#fffdf6" stroke="#111" stroke-width="4" filter="url(#shadow)"/>
    <text x="1230" y="705" font-family="sans-serif" font-size="25" font-weight="900" fill="#111">Legend</text>
    <circle cx="1240" cy="740" r="13" fill="${modeInfo.color}"/>
    <text x="1265" y="748" font-family="sans-serif" font-size="19" fill="#111">当前模式 POI</text>
    <path d="M1230 765H1460" stroke="#2d79bd" stroke-width="6"/>
    <text x="1265" y="790" font-family="sans-serif" font-size="19" fill="#111">推荐移动路径</text>
    <rect x="30" y="816" width="1540" height="54" rx="0" fill="#222"/>
    <text x="470" y="850" font-family="sans-serif" font-size="24" font-weight="700" fill="#f7f3e8">Tap anywhere on the map to expand this journey</text>
  </svg>`

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

export function createFallbackMapImage(destination, focus = '城市中轴', mode = 'food') {
  return svgMap(destination, focus, mode)
}

function demoGuide(destination, vibe) {
  const theme = vibe && vibe !== '全部' ? vibe : '地图'
  const names = ['城市地标', '历史街区', '风味街巷', '绿地水岸', '夜游节点']
  const categories = ['城市', '历史', '美食', '自然', '休闲']
  const icons = ['🌆', '🏛️', '🥢', '🌿', '✨']
  const hotspots = names.map((name, index) => ({
    id: `demo-hotspot-${index + 1}`,
    ...hotspotPositions[index],
    title: `${destination}${name}`,
    category: categories[index],
    icon: icons[index],
    description: `以 2D 地图视角呈现${destination}${name}，可继续点击周边区域展开。`,
    tags: [theme, categories[index]],
    duration: index === 0 ? '约 2 小时' : '约 1 小时',
    bestTime: index === 4 ? '日落后' : '白天',
    address: 'GitHub Pages 静态演示',
    phone: '',
    typeName: categories[index],
    coordinates: null
  }))

  return {
    destination,
    subtitle: '2D 地图漫游',
    overview: '仿 flipbook 的平面地图探索：点击任意区域后，可按购物、住宿、交通、饮食模式查看周边单位并继续生成局部地图。',
    accent: '#f06d4f',
    quickFacts: [
      { label: '地图风格', value: '2D 手绘' },
      { label: '交互方式', value: '点击扩展' },
      { label: 'POI 模式', value: '四类切换' }
    ],
    hotspots,
    itinerary: hotspots.map((hotspot, index) => ({
      time: `${String(9 + index * 2).padStart(2, '0')}:00`,
      title: hotspot.title,
      description: `从${hotspot.category}体验切入，串联下一处地图节点。`,
      hotspotTitle: hotspot.title
    })),
    panoramaPrompt: `${destination} 2D 平面旅行地图，手绘线稿，米色纸张，红色主轴，蓝色道路，绿色公园，flipbook 页面设计`
  }
}

function demoAreaInsight(destination, click, mode) {
  const modeInfo = modeKeywords[mode] || modeKeywords.food
  const title = areaNameFromPoint(click?.x, click?.y)
  const pois = Array.from({ length: 5 }, (_, index) => ({
    id: `demo-poi-${mode}-${index + 1}`,
    name: `${destination}${modeInfo.label}点 ${index + 1}`,
    address: `${title} · 静态演示地址`,
    typeName: modeInfo.keyword,
    phone: '',
    coordinates: null
  }))

  return {
    area: {
      title,
      summary: `已在${destination}${title}按「${modeInfo.label}」模式识别周边单位。`,
      mode,
      modeLabel: modeInfo.label,
      icon: modeInfo.icon,
      x: click?.x ?? 50,
      y: click?.y ?? 50
    },
    pois,
    route: pois.slice(0, 4).map((poi, index) => ({
      order: index + 1,
      title: poi.name,
      description: index === 0 ? '从当前点击区域出发' : `继续前往${modeInfo.label}备选点`
    })),
    mapPrompt: `${destination}${title}${modeInfo.label}局部 2D 平面地图，手绘线稿，flipbook 设计`
  }
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload.error || `请求失败 (${response.status})`)
  }

  return payload
}

export function fetchHealth() {
  if (STATIC_DEMO) {
    return Promise.resolve({
      ok: true,
      configured: true,
      provider: 'GitHub Pages 静态演示',
      models: {
        chat: '本地后端：Doubao-Seed-2.0-mini',
        image: '本地后端：Doubao-Seedream-4.5',
        lbs: '本地后端：vivo POI 搜索'
      }
    })
  }

  return request('/api/health')
}

export function generateTravelGuide(destination, vibe) {
  if (STATIC_DEMO) {
    return Promise.resolve({
      guide: demoGuide(destination, vibe),
      source: 'static',
      warning: 'GitHub Pages 为静态演示版；本地运行会调用 vivo AIGC 生成实时地图、路线和 POI。',
      cached: true
    })
  }

  return request('/api/travel-guide', {
    method: 'POST',
    body: JSON.stringify({ destination, vibe })
  })
}

export function generatePanoramaImage(destination, prompt, context = {}) {
  if (STATIC_DEMO) {
    return Promise.resolve({
      imageUrl: svgMap(destination, context.focus || '城市中轴', context.mode || 'food'),
      source: 'static',
      model: 'GitHub Pages static map'
    })
  }

  return request('/api/panorama-image', {
    method: 'POST',
    body: JSON.stringify({ destination, prompt, context })
  })
}

export function exploreMapArea(destination, click, mode, guide) {
  if (STATIC_DEMO) {
    return Promise.resolve(demoAreaInsight(destination, click, mode))
  }

  return request('/api/area-insight', {
    method: 'POST',
    body: JSON.stringify({ destination, click, mode, guide })
  })
}
