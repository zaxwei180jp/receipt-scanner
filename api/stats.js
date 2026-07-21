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
    let allResults = [];
    let cursor = undefined;

    // Paginate through all records
    do {
      const body = cursor
        ? { start_cursor: cursor, page_size: 100 }
        : { page_size: 100 };

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

    // Aggregate by category and subcategory
    const categoryTotals = {};
    const subCategoryTotals = {};
    let grandTotal = 0;
    let recordCount = 0;

    for (const page of allResults) {
      const props = page.properties;
      const amount = props['金額']?.number || 0;
      const category = props['主分類']?.select?.name || '未分類';
      const subCategory = props['子分類']?.select?.name || '未分類';

      categoryTotals[category] = (categoryTotals[category] || 0) + amount;
      subCategoryTotals[subCategory] = (subCategoryTotals[subCategory] || 0) + amount;
      grandTotal += amount;
      recordCount += 1;
    }

    const categoryBreakdown = Object.entries(categoryTotals)
      .map(([name, total]) => ({
        name,
        total,
        percentage: grandTotal > 0 ? Math.round((total / grandTotal) * 1000) / 10 : 0
      }))
      .sort((a, b) => b.total - a.total);

    const subCategoryBreakdown = Object.entries(subCategoryTotals)
      .map(([name, total]) => ({
        name,
        total,
        percentage: grandTotal > 0 ? Math.round((total / grandTotal) * 1000) / 10 : 0
      }))
      .sort((a, b) => b.total - a.total);

    return res.status(200).json({
      grandTotal,
      recordCount,
      categoryBreakdown,
      subCategoryBreakdown
    });
  } catch (error) {
    console.error('Stats error:', error);
    return res.status(500).json({ error: error.message });
  }
}
