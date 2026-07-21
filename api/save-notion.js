export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { date, store, items, category, subCategory, notes } = req.body;

  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'No items to save' });
  }

  const notionToken = process.env.NOTION_TOKEN;
  const databaseId = process.env.NOTION_DATABASE_ID;

  if (!notionToken || !databaseId) {
    return res.status(500).json({ error: 'Missing Notion credentials' });
  }

  try {
    // Save each item as a separate record in Notion
    const results = [];

    for (const item of items) {
      const properties = {
        '品項': {
          title: [{ text: { content: item.translated || item.name } }]
        },
        '日期': {
          date: { start: date }
        },
        '店舗': {
          rich_text: [{ text: { content: store } }]
        },
        '金額': {
          number: item.price
        },
        '數量': {
          number: 1
        }
      };

      const itemCategory = item.category || category;
      const itemSubCategory = item.subCategory || subCategory;

      if (itemCategory) {
        properties['主分類'] = {
          select: { name: itemCategory }
        };
      }

      if (itemSubCategory) {
        properties['子分類'] = {
          select: { name: itemSubCategory }
        };
      }

      const noteParts = [];
      if (item.original && item.original !== item.translated) {
        noteParts.push(`原文: ${item.original}`);
      }
      if (notes) {
        noteParts.push(notes);
      }
      if (noteParts.length > 0) {
        properties['備註'] = {
          rich_text: [{ text: { content: noteParts.join(' | ') } }]
        };
      }

      const response = await fetch('https://api.notion.com/v1/pages', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${notionToken}`,
          'Content-Type': 'application/json',
          'Notion-Version': '2022-06-28'
        },
        body: JSON.stringify({
          parent: { database_id: databaseId },
          properties
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Notion error: ${error.message}`);
      }

      const data = await response.json();
      results.push({ id: data.id, name: item.name });

      // Add 1.5s delay to avoid Notion indexing lag
      await new Promise(resolve => setTimeout(resolve, 1500));
    }

    return res.status(200).json({
      success: true,
      message: `已儲存 ${results.length} 個品項`,
      saved: results
    });
  } catch (error) {
    console.error('Notion error:', error);
    return res.status(500).json({ error: error.message });
  }
}
