export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { date, store, item, notes } = req.body;

  if (!item) {
    return res.status(400).json({ error: 'No item to save' });
  }

  const notionToken = process.env.NOTION_TOKEN;
  const databaseId = process.env.NOTION_DATABASE_ID;

  if (!notionToken || !databaseId) {
    return res.status(500).json({ error: 'Missing Notion credentials' });
  }

  try {
    const properties = {
      '品項': {
        title: [{ text: { content: item.translated || item.name } }]
      },
      '日期': {
        date: { start: date }
      },
      '店鋪': {
        rich_text: [{ text: { content: store } }]
      },
      '金額': {
        number: item.price
      },
      '數量': {
        number: 1
      }
    };

    if (item.category) {
      properties['主分類'] = { select: { name: item.category } };
    }

    if (item.subCategory) {
      properties['子分類'] = { select: { name: item.subCategory } };
    }

    const noteParts = [];
    if (item.original) {
      noteParts.push(`原文: ${item.original}`);
    }
    if (notes) {
      noteParts.push(notes);
    }
    if (noteParts.length > 0) {
      properties['備註'] = { rich_text: [{ text: { content: noteParts.join(' | ') } }] };
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

    return res.status(200).json({
      success: true,
      id: data.id,
      name: item.translated || item.name
    });
  } catch (error) {
    console.error('Notion error:', error);
    return res.status(500).json({ error: error.message });
  }
}
