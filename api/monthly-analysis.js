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

    const MAIN_CATEGORIES = ['生鮮食材', '蛋奶製品', '健康飲品', '加工食品', '調味料', '麵包甜點', '日用品', '其他'];

    const monthlyTotal = {};
    const meatByMonth = {};
    const vegByMonth = {};
    const healthDrinkByMonth = {};
    const snackByMonth = {};
    const dailyByMonth = {};
    const mainCategoryByMonth = {}; // { category: { month: total } }

    MAIN_CATEGORIES.forEach(cat => {
      mainCategoryByMonth[cat] = {};
    });

    months.forEach(m => {
      monthlyTotal[m] = 0;
      meatByMonth[m] = 0;
      vegByMonth[m] = 0;
      healthDrinkByMonth[m] = 0;
      snackByMonth[m] = 0;
      dailyByMonth[m] = 0;
      MAIN_CATEGORIES.forEach(cat => {
        mainCategoryByMonth[cat][m] = 0;
      });
    });

    const extractOriginal = (notes) => {
      const match = notes && notes.match(/原文:\s*([^|]+)/);
      return match ? match[1].trim() : null;
    };

    const itemAgg = {}; // canonicalKey -> { count, total, nameCounts: { translatedName: count } }

    for (const r of records) {
      const m = monthOf(r.date);
      monthlyTotal[m] += r.amount;

      if (r.subCategory === '肉類') meatByMonth[m] += r.amount;
      if (r.subCategory === '蔬菜') vegByMonth[m] += r.amount;
      if (r.subCategory === '零食') snackByMonth[m] += r.amount;
      if (r.category === '日用品') dailyByMonth[m] += r.amount;

      if (mainCategoryByMonth[r.category]) {
        mainCategoryByMonth[r.category][m] += r.amount;
      } else if (r.category) {
        // Category not in the known list (e.g. old data) — bucket into 其他
        mainCategoryByMonth['其他'][m] += r.amount;
      }

      const searchText = `${r.name} ${r.notes}`;
      if (/R-1|LG21/i.test(searchText)) {
        healthDrinkByMonth[m] += r.amount;
      }

      // Group by original Japanese name when available (consistent across scans),
      // falling back to translated name for older records without it.
      const canonicalKey = extractOriginal(r.notes) || r.name;

      if (!itemAgg[canonicalKey]) itemAgg[canonicalKey] = { count: 0, total: 0, nameCounts: {} };
      itemAgg[canonicalKey].count += 1;
      itemAgg[canonicalKey].total += r.amount;
      itemAgg[canonicalKey].nameCounts[r.name] = (itemAgg[canonicalKey].nameCounts[r.name] || 0) + 1;
    }

    const topItems = Object.entries(itemAgg)
      .map(([key, v]) => {
        // Use the most frequently used translated name as the display label
        const displayName = Object.entries(v.nameCounts).sort((a, b) => b[1] - a[1])[0][0];
        return { name: displayName, count: v.count, total: v.total };
      })
      .sort((a, b) => b.count - a.count || b.total - a.total)
      .slice(0, 20);

    // ---------- Extra analysis: MoM change, average, projection, insights ----------
    const pctChange = (curr, prev) => {
      if (prev === 0) return curr > 0 ? 100 : 0;
      return Math.round(((curr - prev) / prev) * 1000) / 10;
    };

    const lastMonth = months[months.length - 1];
    const prevMonth = months.length >= 2 ? months[months.length - 2] : null;

    const momChange = {};
    const momChangeByCategory = {};
    if (lastMonth && prevMonth) {
      momChange.total = pctChange(monthlyTotal[lastMonth], monthlyTotal[prevMonth]);
      MAIN_CATEGORIES.forEach(cat => {
        momChangeByCategory[cat] = pctChange(
          mainCategoryByMonth[cat][lastMonth] || 0,
          mainCategoryByMonth[cat][prevMonth] || 0
        );
      });
    }

    const monthTotals = months.map(m => monthlyTotal[m]);
    const avgMonthly = monthTotals.length > 0
      ? Math.round(monthTotals.reduce((a, b) => a + b, 0) / monthTotals.length)
      : 0;

    // Projection for the most recent month if it matches the real current month
    const now = new Date();
    const currentMonthStr = now.toISOString().slice(0, 7);
    let projection = null;

    if (lastMonth === currentMonthStr) {
      const daysElapsed = now.getUTCDate();
      const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
      if (daysElapsed > 0) {
        const projected = Math.round((monthlyTotal[lastMonth] / daysElapsed) * daysInMonth);
        projection = {
          month: lastMonth,
          daysElapsed,
          daysInMonth,
          spentSoFar: monthlyTotal[lastMonth],
          projectedTotal: projected
        };
      }
    }

    // ---------- Generate text insights ----------
    const insights = [];

    if (lastMonth && prevMonth) {
      const dir = momChange.total > 0 ? '增加' : momChange.total < 0 ? '減少' : '持平';
      if (momChange.total !== 0) {
        insights.push(`${lastMonth} 總支出比 ${prevMonth} ${dir} ${Math.abs(momChange.total)}%（¥${monthlyTotal[prevMonth].toLocaleString()} → ¥${monthlyTotal[lastMonth].toLocaleString()}）`);
      }

      // Find category with biggest increase/decrease among all main categories
      const catChanges = MAIN_CATEGORIES.map(cat => ({
        label: cat,
        change: momChangeByCategory[cat],
        currAmount: mainCategoryByMonth[cat][lastMonth] || 0,
        prevAmount: mainCategoryByMonth[cat][prevMonth] || 0
      })).filter(c => c.currAmount > 0 || c.prevAmount > 0);

      const biggestIncrease = catChanges.filter(c => c.change > 0).sort((a, b) => b.change - a.change)[0];
      const biggestDecrease = catChanges.filter(c => c.change < 0).sort((a, b) => a.change - b.change)[0];

      if (biggestIncrease && biggestIncrease.change >= 20) {
        insights.push(`${biggestIncrease.label} 支出漲幅最大，比上月多花 ${biggestIncrease.change}%`);
      }
      if (biggestDecrease && biggestDecrease.change <= -20) {
        insights.push(`${biggestDecrease.label} 支出明顯下降，比上月少花 ${Math.abs(biggestDecrease.change)}%`);
      }
    }

    if (projection && avgMonthly > 0) {
      const vsAvg = pctChange(projection.projectedTotal, avgMonthly);
      if (Math.abs(vsAvg) >= 15) {
        insights.push(`本月（${projection.month}）已過 ${projection.daysElapsed}/${projection.daysInMonth} 天，照目前花費速度預估月底會花 ¥${projection.projectedTotal.toLocaleString()}，比過去平均${vsAvg > 0 ? '高' : '低'} ${Math.abs(vsAvg)}%`);
      } else {
        insights.push(`本月（${projection.month}）目前花費速度接近過去平均，預估月底約 ¥${projection.projectedTotal.toLocaleString()}`);
      }
    }

    if (topItems.length > 0) {
      const top = topItems[0];
      insights.push(`「${top.name}」是你買最多次的商品，累積買了 ${top.count} 次，共花 ¥${top.total.toLocaleString()}`);
    }

    if (months.length >= 3) {
      const last3 = months.slice(-3).map(m => monthlyTotal[m]);
      const isRising = last3[0] < last3[1] && last3[1] < last3[2];
      const isFalling = last3[0] > last3[1] && last3[1] > last3[2];
      if (isRising) {
        insights.push(`最近 3 個月總支出連續上升（${months.slice(-3).join(' → ')}），建議檢視是否有非必要消費增加`);
      } else if (isFalling) {
        insights.push(`最近 3 個月總支出連續下降，控管得不錯，繼續保持`);
      }
    }

    if (insights.length === 0) {
      insights.push('資料還不夠多，多累積幾個月的紀錄後分析會更準確');
    }

    return res.status(200).json({
      months,
      monthlyTotal,
      mainCategories: MAIN_CATEGORIES,
      mainCategoryByMonth,
      meatByMonth,
      vegByMonth,
      healthDrinkByMonth,
      snackByMonth,
      dailyByMonth,
      topItems,
      recordCount: records.length,
      momChange,
      momChangeByCategory,
      avgMonthly,
      projection,
      insights
    });
  } catch (error) {
    console.error('Monthly analysis error:', error);
    return res.status(500).json({ error: error.message });
  }
}
