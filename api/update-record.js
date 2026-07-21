export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const notionToken = process.env.NOTION_TOKEN;

  if (!notionToken) {
    return res.status(500).json({ error: 'Missing Notion credentials' });
  }

  const { id, name, date, store, amount, category, subCategory, notes } = req.body;

  if (!id) {
    return res.status(400).json({ error: 'Missing record id' });
  }

  try {
    const properties = {};

    if (name !== undefined) {
      properties['品項'] = { title: [{ text: { content: name } }] };
    }
    if (date !== undefined) {
      properties['日期'] = { date: { start: date } };
    }
    if (store !== undefined) {
      properties['店鋪'] = { rich_text: [{ text: { content: store } }] };
    }
    if (amount !== undefined) {
      properties['金額'] = { number: Number(amount) };
    }
    if (category !== undefined) {
      properties['主分類'] = { select: { name: category } };
    }
    if (subCategory !== undefined) {
      properties['子分類'] = { select: { name: subCategory } };
    }
    if (notes !== undefined) {
      properties['備註'] = { rich_text: [{ text: { content: notes } }] };
    }

    const response = await fetch(`https://api.notion.com/v1/pages/${id}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${notionToken}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28'
      },
      body: JSON.stringify({ properties })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Notion error: ${error.message}`);
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Update error:', error);
    return res.status(500).json({ error: error.message });
  }
}
