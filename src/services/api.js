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
  return request('/api/health')
}

export function generateTravelGuide(destination, vibe) {
  return request('/api/travel-guide', {
    method: 'POST',
    body: JSON.stringify({ destination, vibe })
  })
}

export function generatePanoramaImage(destination, prompt) {
  return request('/api/panorama-image', {
    method: 'POST',
    body: JSON.stringify({ destination, prompt })
  })
}
