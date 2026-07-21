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
      max_tokens: 4096,
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
4. 判斷主分類與子分類，只能從以下清單中選（子分類必須屬於對應的主分類）：

生鮮食材 → 肉類、海鮮、蔬菜、水果
蛋奶製品 → 雞蛋、牛奶、起司、優格
健康飲品 → 果汁、豆乳、功能飲料
加工食品 → 冷凍食品、熟食、火鍋料、罐頭、零食
調味料 → 調味料
麵包甜點 → 麵包甜點
日用品 → 清潔用品、廚房用品、生活用品
其他 → 其他

只回傳 JSON 格式，不要其他說明文字。格式如下：
{
  "items": [
    {
      "original": "風雅卵",
      "translated": "雞蛋",
      "price": 298,
      "category": "蛋奶製品",
      "subCategory": "雞蛋"
    }
  ]
}

不要遺漏任何商品行。如果是購物袋，主分類設為「其他」、子分類「其他」。如果無法辨識價格，填 0。`
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
    return res.status(500).json({
      error: error.message,
      detail: error.name === 'SyntaxError' ? 'JSON 解析失敗，可能是回應被截斷' : undefined
    });
  }
}
