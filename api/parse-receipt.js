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
              text: `你是收據掃描專家。請分析這張日本超市收據照片，提取每一項商品，並完成以下任務：

1. 提取商品原文名稱（日文）
2. 將商品名稱翻譯成繁體中文（簡潔、常用說法，例如「風雅卵」→「雞蛋」、「あじわいオレンジ」→「香吉士橙子」）
3. 提取價格
4. 判斷主分類（只能選：食物、日用品、其他）
5. 判斷子分類（只能選：蔬果、肉類、蛋類、乳製品、飲料、加工食品、調味料、零食、清潔、衛生、其他）

只回傳 JSON 格式，不要其他說明文字。格式如下：
{
  "items": [
    {
      "original": "風雅卵",
      "translated": "雞蛋",
      "price": 298,
      "category": "食物",
      "subCategory": "蛋類"
    }
  ]
}

不要遺漏任何商品行。如果是購物袋或折扣項目，主分類設為「其他」。如果無法辨識價格，填 0。`
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
