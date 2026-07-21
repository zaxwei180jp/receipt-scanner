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

    // Extract clean records
    const records = allResults.map(page => {
      const props = page.properties;
      return {
        name: props['品項']?.title?.[0]?.plain_text || '',
        date: props['日期']?.date?.start || '',
        amount: props['金額']?.number || 0,
        category: props['主分類']?.select?.name || '',
        subCategory: props['子分類']?.select?.name || '',
        notes: props['備註']?.rich_text?.[0]?.plain_text || ''
      };
    }).filter(r => r.date);

    const monthOf = (dateStr) => dateStr.slice(0, 7); // YYYY-MM

    const months = [...new Set(records.map(r => monthOf(r.date)))].sort();

    const monthlyTotal = {};
    const meatByMonth = {};
    const vegByMonth = {};
    const healthDrinkByMonth = {};
    const snackByMonth = {};
    const dailyByMonth = {};

    months.forEach(m => {
      monthlyTotal[m] = 0;
      meatByMonth[m] = 0;
      vegByMonth[m] = 0;
      healthDrinkByMonth[m] = 0;
      snackByMonth[m] = 0;
      dailyByMonth[m] = 0;
    });

    const itemAgg = {}; // name -> { count, total }

    for (const r of records) {
      const m = monthOf(r.date);
      monthlyTotal[m] += r.amount;

      if (r.subCategory === '肉類') meatByMonth[m] += r.amount;
      if (r.subCategory === '蔬菜') vegByMonth[m] += r.amount;
      if (r.subCategory === '零食') snackByMonth[m] += r.amount;
      if (r.category === '日用品') dailyByMonth[m] += r.amount;

      const searchText = `${r.name} ${r.notes}`;
      if (/R-1|LG21/i.test(searchText)) {
        healthDrinkByMonth[m] += r.amount;
      }

      if (!itemAgg[r.name]) itemAgg[r.name] = { count: 0, total: 0 };
      itemAgg[r.name].count += 1;
      itemAgg[r.name].total += r.amount;
    }

    const topItems = Object.entries(itemAgg)
      .map(([name, v]) => ({ name, count: v.count, total: v.total }))
      .sort((a, b) => b.count - a.count || b.total - a.total)
      .slice(0, 20);

    return res.status(200).json({
      months,
      monthlyTotal,
      meatByMonth,
      vegByMonth,
      healthDrinkByMonth,
      snackByMonth,
      dailyByMonth,
      topItems,
      recordCount: records.length
    });
  } catch (error) {
    console.error('Monthly analysis error:', error);
    return res.status(500).json({ error: error.message });
  }
}
