export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const notionToken = process.env.NOTION_TOKEN;

  if (!notionToken) {
    return res.status(500).json({ error: 'Missing Notion credentials' });
  }

  const { id } = req.body;

  if (!id) {
    return res.status(400).json({ error: 'Missing record id' });
  }

  try {
    const response = await fetch(`https://api.notion.com/v1/pages/${id}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${notionToken}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28'
      },
      body: JSON.stringify({ archived: true })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Notion error: ${error.message}`);
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Delete error:', error);
    return res.status(500).json({ error: error.message });
  }
}
