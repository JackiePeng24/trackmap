const STATIC_DEMO = import.meta.env.VITE_STATIC_DEMO === 'true'

const hotspotPositions = [
  { x: 22, y: 36 },
  { x: 42, y: 58 },
  { x: 58, y: 33 },
  { x: 73, y: 56 },
  { x: 86, y: 42 }
]

const modeKeywords = {
  shopping: { label: '购物', keyword: '购物中心', icon: '🛍️' },
  stay: { label: '住宿', keyword: '酒店', icon: '🏨' },
  transit: { label: '交通', keyword: '地铁站', icon: '🚇' },
  food: { label: '饮食', keyword: '餐厅', icon: '🥢' }
}

function areaNameFromPoint(x = 50, y = 50) {
  const horizontal = x < 34 ? '西侧' : x > 66 ? '东侧' : '中轴'
  const vertical = y < 34 ? '北段' : y > 66 ? '南段' : '核心区'
  return `${horizontal}${vertical}`
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
    description: `以视觉画册视角呈现 ${destination}${name}，可继续点击周边区域展开。`,
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
    subtitle: '无限视觉画册',
    overview: '以 flipbook 的视觉流探索：点击任意区域后，可按购物、住宿、交通、饮食模式查看周边单位并继续生成下一帧。',
    accent: '#f06d4f',
    quickFacts: [
      { label: '画面风格', value: '视觉画册' },
      { label: '交互方式', value: '点击续帧' },
      { label: 'POI 模式', value: '四类切换' }
    ],
    hotspots,
    itinerary: hotspots.map((hotspot, index) => ({
      time: `${String(9 + index * 2).padStart(2, '0')}:00`,
      title: hotspot.title,
      description: `从${hotspot.category}体验切入，串联下一处地图节点。`,
      hotspotTitle: hotspot.title
    })),
    panoramaPrompt: `${destination} AI漫游向导城市全景纯视觉底图，16:9，真实感3D城市沙盘，等距鸟瞰视角，体现真实地标、水系、街区肌理、建筑风格和地方文化；自然出现行人、车辆、桥梁、绿地和生活细节；无UI、无文字、无标签、无按钮、无搜索框、无定位图标、无路线、无卡片、无水印`
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
      summary: `已在 ${destination}${title} 按「${modeInfo.label}」模式识别周边单位。`,
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
    mapPrompt: `${destination}${title}${modeInfo.label}局部放大纯视觉底图，保持上一帧城市风格和空间关系，突出真实建筑、道路、河岸、树木、店铺、人群活动和地方文化；无UI、无文字、无标签、无按钮、无卡片、无定位图标、无路线、无水印`
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
    throw new Error(payload.error || payload.warning || `请求失败 (${response.status})`)
  }

  return payload
}

export function fetchHealth() {
  if (STATIC_DEMO) {
    return Promise.resolve({
      ok: true,
      configured: false,
      provider: 'GitHub Pages 静态演示',
      models: {
        chat: '本地后端：Doubao-Seed-2.0-mini',
        image: '本地后端：Doubao-Seedream-4.5',
        vlm: '本地后端：Qwen3-VL-30B-A3B-Thinking',
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
      warning: 'GitHub Pages 为静态演示版；本地运行后端才会调用真实模型生成地图、路线和 POI。',
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
    return Promise.reject(new Error('GitHub Pages 静态演示不调用图片生成模型，请本地运行后端查看真实生图。'))
  }

  return request('/api/panorama-image', {
    method: 'POST',
    body: JSON.stringify({ destination, prompt, context })
  })
}

export function exploreMapArea(destination, click, mode, guide, imageUrl) {
  if (STATIC_DEMO) {
    return Promise.resolve(demoAreaInsight(destination, click, mode))
  }

  return request('/api/area-insight', {
    method: 'POST',
    body: JSON.stringify({ destination, click, mode, guide, imageUrl })
  })
}
