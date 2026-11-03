import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const notionToken = process.env.NOTION_TOKEN;
  const databaseId = process.env.NOTION_DATABASE_ID;

  if (!notionToken || !databaseId) {
    return res.status(500).json({ error: 'Missing Notion credentials' });
  }

  try {
    // 1. Read all records from Notion
    let allResults = [];
    let cursor = undefined;

    do {
      const body = cursor ? { start_cursor: cursor, page_size: 100 } : { page_size: 100 };
      const response = await fetch(
        `https://api.notion.com/v1/databases/${databaseId}/query`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${notionToken}`,
            'Content-Type': 'application/json',
            'Notion-Version': '2022-06-28'
          },
          body: JSON.stringify(body)
        }
      );
      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Notion error: ${error.message}`);
      }
      const data = await response.json();
      allResults = allResults.concat(data.results);
      cursor = data.has_more ? data.next_cursor : undefined;
    } while (cursor);

    const extractOriginal = (notes) => {
      const match = notes && notes.match(/原文:\s*([^|]+)/);
      return match ? match[1].trim() : '';
    };

    // 2. Build a list of distinct (chinese name + japanese original) pairs with counts
    const variantMap = {}; // key: name||original -> { name, original, count }
    for (const page of allResults) {
      const props = page.properties;
      const name = props['品項']?.title?.[0]?.plain_text || '';
      const notes = props['備註']?.rich_text?.[0]?.plain_text || '';
      const original = extractOriginal(notes);
      if (!name) continue;
      const key = `${name}||${original}`;
      if (!variantMap[key]) variantMap[key] = { name, original, count: 0 };
      variantMap[key].count += 1;
    }

    const variants = Object.values(variantMap);

    if (variants.length === 0) {
      return res.status(200).json({ groups: [], totalVariants: 0 });
    }

    // 3. Ask Claude to cluster variants that are the same product
    const variantList = variants.map((v, i) =>
      `${i}. 中文「${v.name}」 日文「${v.original || '(無)'}」 出現${v.count}次`
    ).join('\n');

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      messages: [{
        role: 'user',
        content: `以下是超市消費紀錄中出現過的商品品項清單（含中文譯名與日文原文）。請把「其實是同一種商品」的品項分到同一組，並為每組指定一個最簡潔、最通用的標準中文名稱。

分組原則：
- 同一種商品只因翻譯用詞或日文品牌不同而被拆開的，要合併（例如「りんご」「超りんご」「おいしいりんご」都是蘋果）
- 標準名稱用最基本的品名，去掉品牌、修飾詞（例如「蘋果」而非「特級蘋果」）
- 真正不同的商品不要亂合併（例如「蘋果」和「蘋果汁」是不同商品）
- 只有一個品項、沒有需要合併的，也要列為單獨一組（標準名稱就是它自己）

清單：
${variantList}

只回傳 JSON，格式如下（canonicalName 是標準中文名稱，members 是屬於這組的清單項目編號）：
{
  "groups": [
    { "canonicalName": "蘋果", "members": [0, 3, 7] },
    { "canonicalName": "牛奶", "members": [1] }
  ]
}`
      }]
    });

    const content = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(500).json({ error: '分析結果解析失敗', raw: content });
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // 4. Attach variant details to each group, only keep groups that actually merge
    //    or where canonical differs from the current name
    const groups = (parsed.groups || []).map(g => {
      const members = g.members.map(idx => variants[idx]).filter(Boolean);
      const needsChange = members.some(m => m.name !== g.canonicalName) || members.length > 1;
      return {
        canonicalName: g.canonicalName,
        members,
        totalCount: members.reduce((s, m) => s + m.count, 0),
        needsChange
      };
    }).filter(g => g.members.length > 0);

    // Sort: groups needing change first, then by total count
    groups.sort((a, b) => (b.needsChange - a.needsChange) || (b.totalCount - a.totalCount));

    return res.status(200).json({
      groups,
      totalVariants: variants.length
    });
  } catch (error) {
    console.error('Normalize analyze error:', error);
    return res.status(500).json({ error: error.message });
  }
}
