import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: import.meta.env.VITE_ANTHROPIC_API_KEY,
  dangerouslyAllowBrowser: true // 仅用于开发，生产环境需要后端代理
})

export async function generateTravelGuide(location) {
  const prompt = `请为"${location}"生成一份旅游图解指南。

要求：
1. 返回JSON格式，包含一个cards数组
2. 每个card代表一页，包含：title(标题), subtitle(副标题), content(内容数组), tip(提示)
3. content数组每项包含：icon(emoji), title(小标题), description(描述), tags(标签数组)
4. 生成5-8页内容，涵盖：景点推荐、美食、文化体验、交通指南、实用信息等
5. 内容要生动有趣，符合本地特色

请只返回JSON，不要其他说明文字。

示例格式：
{
  "cards": [
    {
      "title": "欢迎来到北京",
      "subtitle": "古老与现代的完美融合",
      "content": [
        {
          "icon": "🏛️",
          "title": "故宫博物院",
          "description": "中国明清两代的皇家宫殿，世界文化遗产",
          "tags": ["历史文化", "必游"]
        }
      ],
      "tip": "建议游览时间：半天"
    }
  ]
}`

  try {
    const message = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: prompt
      }]
    })

    // 解析AI返回的JSON
    const responseText = message.content[0].text
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)

    if (jsonMatch) {
      return JSON.parse(jsonMatch[0])
    }

    throw new Error('无法解析AI返回的数据')
  } catch (error) {
    console.error('AI API调用失败:', error)
    throw error
  }
}
