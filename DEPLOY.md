# 部署到 Vercel

## 本地測試

```bash
npm install
npm install -g vercel
vercel dev
```

瀏覽器打開 `http://localhost:3000`

---

## 部署步驟

### 1. GitHub 連結（可選，更簡單）

```bash
git init
git add .
git commit -m "initial"
git remote add origin https://github.com/你的用戶名/receipt-scanner.git
git push -u origin main
```

### 2. Vercel 部署

#### 方法 A：CLI
```bash
vercel
# 依照提示完成，選擇 Deploy
```

#### 方法 B：Web Dashboard
1. 去 https://vercel.com
2. Import Project → 選你的 GitHub repo
3. 完成

### 3. 設定 Environment Variables

在 Vercel Dashboard：
1. 進入你的專案
2. Settings → Environment Variables
3. 新增三個變數：
   - `ANTHROPIC_API_KEY` = `sk-ant-...` (你的 Anthropic key)
   - `NOTION_TOKEN` = `secret_...` (你的 Notion token)
   - `NOTION_DATABASE_ID` = `3a35bfd8338780c98a53f5d024b850f1`

4. Redeploy（部署會自動重新開始）

---

## 檢查

- 部署完成後，Vercel 會給你一個 URL，比如 `https://receipt-scanner-xxx.vercel.app`
- 打開那個 URL，上傳一張收據試試
- 如果有錯誤，去 Functions 看日誌

---

## 常見問題

**Q: 圖片無法上傳？**
A: 檢查 ANTHROPIC_API_KEY 是否正確、是否有額度

**Q: Notion 無法儲存？**
A: 確認：
- NOTION_TOKEN 正確
- NOTION_DATABASE_ID 正確
- Integration 已邀請到 Database

**Q: 我想修改代碼？**
A: 本地修改後：
```bash
git push
# 自動重新部署
```

---

## 用途

1. 📱 拍收據或上傳圖片
2. 🤖 Claude vision 自動掃描並提取品項+價格
3. 📝 檢查+修改資料
4. 💾 一鍵存入 Notion

---

**祝用愉快！** 🎉
