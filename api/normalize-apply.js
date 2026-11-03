export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const notionToken = process.env.NOTION_TOKEN;
  const databaseId = process.env.NOTION_DATABASE_ID;

  if (!notionToken || !databaseId) {
    return res.status(500).json({ error: 'Missing Notion credentials' });
  }

  // mappings: [{ canonicalName, members: [{ name, original }] }]
  const { mappings } = req.body;

  if (!mappings || !Array.isArray(mappings) || mappings.length === 0) {
    return res.status(400).json({ error: '沒有要套用的對應' });
  }

  const extractOriginal = (notes) => {
    const match = notes && notes.match(/原文:\s*([^|]+)/);
    return match ? match[1].trim() : '';
  };

  try {
    // 1. Read all records
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

    // 2. Build a lookup: "name||original" -> canonicalName
    const lookup = {};
    for (const map of mappings) {
      for (const member of map.members) {
        const key = `${member.name}||${member.original || ''}`;
        lookup[key] = map.canonicalName;
      }
    }

    // 3. Go through records, update those whose current name differs from target
    let updated = 0;
    let skipped = 0;
    const failures = [];

    for (const page of allResults) {
      const props = page.properties;
      const name = props['品項']?.title?.[0]?.plain_text || '';
      const notes = props['備註']?.rich_text?.[0]?.plain_text || '';
      const original = extractOriginal(notes);
      const key = `${name}||${original}`;

      const target = lookup[key];
      if (!target || target === name) {
        skipped++;
        continue;
      }

      try {
        const response = await fetch(`https://api.notion.com/v1/pages/${page.id}`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${notionToken}`,
            'Content-Type': 'application/json',
            'Notion-Version': '2022-06-28'
          },
          body: JSON.stringify({
            properties: {
              '品項': { title: [{ text: { content: target } }] }
            }
          })
        });
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message);
        }
        updated++;
        // small delay to avoid rate limits
        await new Promise(r => setTimeout(r, 350));
      } catch (err) {
        failures.push({ name, original, error: err.message });
      }
    }

    return res.status(200).json({
      success: true,
      updated,
      skipped,
      failures
    });
  } catch (error) {
    console.error('Normalize apply error:', error);
    return res.status(500).json({ error: error.message });
  }
}
