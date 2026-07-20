import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { image } = req.body;

    if (!image) {
      return res.status(400).json({ error: 'No image provided' });
    }

    // Extract base64 data
    const base64Image = image.split(',')[1] || image;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: base64Image
              }
            },
            {
              type: 'text',
              text: `你是收據掃描專家。請分析這張收據照片，提取以下資訊：

1. 所有商品品項（名稱）
2. 對應的價格

只回傳 JSON 格式，不要其他說明文字。格式如下：
{
  "items": [
    {"name": "商品名稱", "price": 299},
    {"name": "商品名稱", "price": 298}
  ]
}

如果是日文商品名，保留原文。如果無法辨識價格，填 0。`
            }
          ]
        }
      ]
    });

    const content = response.content[0].type === 'text' ? response.content[0].text : '';
    
    // Parse JSON response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(500).json({ error: '無法解析收據', raw: content });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return res.status(200).json(parsed);
  } catch (error) {
    console.error('Parse error:', error);
    return res.status(500).json({ error: error.message });
  }
}
