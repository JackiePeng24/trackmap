const STATIC_DEMO = import.meta.env.VITE_STATIC_DEMO === 'true'

const demoImages = {
  北京: 'https://images.unsplash.com/photo-1508804185872-d7badad00f7d?w=1920&q=85',
  成都: 'https://images.unsplash.com/photo-1564349683136-77e08dba1ef7?w=1920&q=85',
  杭州: 'https://images.unsplash.com/photo-1599571234909-29ed5d1321d6?w=1920&q=85',
  西安: 'https://images.unsplash.com/photo-1591122947157-26bad3a117d2?w=1920&q=85',
  上海: 'https://images.unsplash.com/photo-1537531383496-f4749b8032cf?w=1920&q=85',
  三亚: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1920&q=85'
}

const hotspotPositions = [
  { x: 20, y: 38 },
  { x: 39, y: 60 },
  { x: 58, y: 35 },
  { x: 73, y: 57 },
  { x: 87, y: 40 }
]

function buildDemoGuide(destination, vibe) {
  const theme = vibe && vibe !== '全部' ? vibe : '沉浸'
  const hotspotNames = [
    `${destination}城市地标`,
    `${destination}历史街区`,
    `${destination}在地风味`,
    `${destination}自然漫步`,
    `${destination}夜色目的地`
  ]

  const categories = ['城市', '历史', '美食', '自然', '休闲']
  const icons = ['🌆', '🏛️', '🥢', '🌿', '✨']

  const hotspots = hotspotNames.map((title, index) => ({
    id: `demo-${index + 1}`,
    ...hotspotPositions[index],
    title,
    category: categories[index],
    icon: icons[index],
    description: `以${theme}视角打开${destination}，感受城市真实地点与旅行叙事融合的体验。`,
    tags: [theme, categories[index]],
    duration: index === 0 ? '约 2 小时' : '约 1 小时',
    bestTime: index === 4 ? '日落后' : '白天',
    address: 'GitHub Pages 静态演示模式',
    phone: '',
    typeName: categories[index],
    coordinates: null
  }))

  return {
    destination,
    subtitle: `${theme}旅行画卷`,
    overview: `这是一份适配 GitHub Pages 的静态演示路线。本地运行时会调用 vivo AIGC 后端生成实时攻略、POI 与图片。`,
    accent: '#ff7a59',
    quickFacts: [
      { label: '部署形态', value: 'GitHub Pages' },
      { label: '本地能力', value: 'vivo AIGC' },
      { label: '体验节奏', value: '一日漫游' }
    ],
    hotspots,
    itinerary: hotspots.map((hotspot, index) => ({
      time: `${String(9 + index * 2).padStart(2, '0')}:00`,
      title: hotspot.title,
      description: `围绕${hotspot.category}体验展开，保留自由探索和拍照停留时间。`,
      hotspotTitle: hotspot.title
    })),
    panoramaPrompt: `${destination}${theme}旅行横向电影感画卷`
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
        chat: '本地后端调用 Doubao-Seed-2.0-mini',
        image: '本地后端调用 Doubao-Seedream-4.5',
        lbs: '本地后端调用 vivo 地理编码（POI 搜索）'
      }
    })
  }

  return request('/api/health')
}

export function generateTravelGuide(destination, vibe) {
  if (STATIC_DEMO) {
    return Promise.resolve({
      guide: buildDemoGuide(destination, vibe),
      source: 'static',
      warning: '当前为 GitHub Pages 静态演示版；完整 vivo AIGC 实时生成能力请在本地或后端服务环境运行。',
      cached: true
    })
  }

  return request('/api/travel-guide', {
    method: 'POST',
    body: JSON.stringify({ destination, vibe })
  })
}

export function generatePanoramaImage(destination, prompt) {
  if (STATIC_DEMO) {
    return Promise.resolve({
      imageUrl: demoImages[destination] || demoImages.北京,
      source: 'static',
      model: 'GitHub Pages static demo'
    })
  }

  return request('/api/panorama-image', {
    method: 'POST',
    body: JSON.stringify({ destination, prompt })
  })
}
