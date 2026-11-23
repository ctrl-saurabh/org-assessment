# Org Assessment

A small static website for recording the current state of the organization:

1. **Questions**: the start page. Assessment questions, each with a free-text answer box and a progress bar.
2. **Clients**: an editable table of active clients. *% of total revenue* is calculated for you, and summary cards show revenue, weighted margin, G/A/R health, upcoming renewals and concentration.
3. **Team**: an editable table of team members. Summary cards show headcount, billable count, allocation, roll-offs, flight risk, AI fluency and monthly cost.

It's plain HTML, CSS and JavaScript, with no build step and no backend.

## Run locally

Double-click `index.html`, or serve the folder so the seed-file loading works:

```powershell
python -m http.server 8000   # then open http://localhost:8000
```

## Host on GitHub Pages

```powershell
git init
git add .
git commit -m "Org assessment site"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

Then go to **Settings → Pages → Build and deployment → Deploy from a branch → `main` / root**.

## Where the data lives

- Everything you type **auto-saves to your browser's localStorage**. Nothing goes to a server. Another browser or device starts empty.
- **Data → Export everything (JSON)** downloads a full backup. **Import JSON backup** restores it, on any machine.
- Each table has **Export CSV** and **Import CSV**, so you can work in Excel. Import *appends* rows and matches columns by header name. Exporting an empty table gives you a CSV template.
- `data/seed.json` loads the first time a browser opens the site (when localStorage is empty). You can commit a backup there to give everyone the same starting point.

> ⚠️ **Privacy:** GitHub Pages sites on free plans are **public**, and so is any data you commit (including `data/seed.json`). Data typed into the page stays in your own browser. Don't commit real client revenue, cost rates or flight-risk notes to a public repo. `.gitignore` already excludes exported `*.csv` and `org-assessment-*.json` files.

## Customize

Everything is in `js/config.js`:

- `questions`: add, remove or reword questions. Group them with `section`, and add an optional `hint`.
- `columns.clients` / `columns.team`: rename labels, change dropdown options, and set widths. Supported types: `text`, `textarea`, `number`, `currency`, `percent`, `date`, `select` and `computed`.
- `currency` / `locale`: control money formatting, e.g. `currency: 'INR', locale: 'en-IN'`.

Keep each column `key` the same after you've entered data. The key is how saved values are stored.
