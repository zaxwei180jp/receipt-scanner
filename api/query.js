export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const notionToken = process.env.NOTION_TOKEN;
  const databaseId = process.env.NOTION_DATABASE_ID;

  if (!notionToken || !databaseId) {
    return res.status(500).json({ error: 'Missing Notion credentials' });
  }

  const { startDate, endDate, category, keyword } = req.body;

  try {
    const filters = [];

    if (startDate) {
      filters.push({
        property: '日期',
        date: { on_or_after: startDate }
      });
    }
    if (endDate) {
      filters.push({
        property: '日期',
        date: { on_or_before: endDate }
      });
    }
    if (category) {
      filters.push({
        property: '主分類',
        select: { equals: category }
      });
    }
    if (keyword) {
      filters.push({
        property: '品項',
        title: { contains: keyword }
      });
    }

    const queryBody = {
      page_size: 100,
      sorts: [{ property: '日期', direction: 'descending' }]
    };

    if (filters.length === 1) {
      queryBody.filter = filters[0];
    } else if (filters.length > 1) {
      queryBody.filter = { and: filters };
    }

    let allResults = [];
    let cursor = undefined;

    do {
      const body = cursor ? { ...queryBody, start_cursor: cursor } : queryBody;

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

    const records = allResults.map(page => {
      const props = page.properties;
      return {
        id: page.id,
        name: props['品項']?.title?.[0]?.plain_text || '',
        date: props['日期']?.date?.start || '',
        store: props['店鋪']?.rich_text?.[0]?.plain_text || '',
        amount: props['金額']?.number || 0,
        category: props['主分類']?.select?.name || '',
        subCategory: props['子分類']?.select?.name || '',
        notes: props['備註']?.rich_text?.[0]?.plain_text || ''
      };
    });

    const total = records.reduce((sum, r) => sum + r.amount, 0);

    return res.status(200).json({ records, total, count: records.length });
  } catch (error) {
    console.error('Query error:', error);
    return res.status(500).json({ error: error.message });
  }
}
