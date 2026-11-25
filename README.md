# Org Assessment

A small static website for recording the current state of the organization:

1. **Questions**: the start page. Assessment questions, each with a free-text answer box, a progress bar, and who last edited each answer.
2. **Clients**: an editable table of active clients. Summary cards show average gross margin, G/A/R health, upcoming renewals and open escalations.
3. **Team**: an editable table of team members. Summary cards show headcount, billable count, allocation, roll-offs, flight risk, AI fluency and monthly cost.
4. **Capability map**: the biopharma IT capability heat map (content in `js/capability-map.js`). Each domain and note card has a comment thread. Click a tile to comment on that specific area. Comments are stored in the `comments` collection and included in JSON backups. If the Firebase rules don't list `comments`, only commenting stops working. The rest of the site carries on.

It's plain HTML, CSS and JavaScript with no build step. It's hosted on GitHub Pages, and shared data lives in **Firebase Firestore**. There's no sign-in: people open a link that contains an access code (`…/org-assessment/?k=CODE`).

## How data is stored

| Setup | Where data lives | Who sees it |
|---|---|---|
| `firebase` settings filled in `js/config.js` | Firestore, under `spaces/<access code>/` (one record per client, team member and answer) | Everyone who has the link with the access code. Changes appear live. |
| `firebase.config.apiKey` left empty | That browser's localStorage | Only that browser |

Edits save automatically about half a second after typing stops. Two people editing *different* cells of the same row don't overwrite each other. If two people edit the *same* answer box at once, whoever saves last wins.

## Set up Firebase (one time, about 10 minutes)

1. **Create a project.** Go to <https://console.firebase.google.com>, choose **Add project**, and follow the steps (Google Analytics isn't needed).
2. **Create the database.** Go to **Build → Firestore Database → Create database**. Pick a location near your team and start in **production mode**.
3. **Choose an access code.** Use a long random string of letters and digits (at least 20 characters; `-` and `_` are allowed). Keep it out of the repo. Put the rules with the real code in `firestore.rules.local`, which git ignores.
4. **Publish the rules.** Copy `firestore.rules`, replace `REPLACE_WITH_ACCESS_CODE` with your code, paste it into **Firestore Database → Rules**, and click **Publish**.
5. **Connect the site.** Go to **Project settings (gear icon) → General → Your apps → Web (`</>`)**, register an app (no hosting needed), and copy its config values into `firebase.config` in `js/config.js`. Commit and push.
6. **Share the link** `https://<your-github-username>.github.io/<repo>/?k=<your code>`. The page remembers the code in each browser, so later visits work without it.

> The Firebase web config (`apiKey` and so on) isn't a secret and is safe in a public repo. **The access code is the only lock.** Anyone with the link can read, change and delete everything, including the menu's *Import JSON backup* and *Clear all shared data*. Share the link only with the team, and not in public channels.

### Managing access later
- **The link leaked, or someone left:** export a backup (Data → Export everything), publish the rules with a new code, open the new link, import the backup, and share the new link. Old links stop working once the new rules are published.
- **Names on answers:** there are no accounts, so each person types their name in the box in the top bar. It's remembered in their browser and shown as "Last edited by …".

### Cost
The Firebase free (Spark) plan covers 50k document reads and 20k writes per day, which is far more than this tool needs for a team. If the daily quota is ever used up, the page shows a banner and stops saving until the next day.

## Run locally

Serve the folder (Google sign-in doesn't work from a `file://` page):

```powershell
python -m http.server 8000   # then open http://localhost:8000
```

## Host on GitHub Pages

Push to `main`, then go to **Settings → Pages → Build and deployment → Deploy from a branch → `main` / root**.

## Backups, import and export

- **Data → Export everything (JSON)** downloads a full backup. **Import JSON backup** (admins only in shared mode) replaces all data with a backup.
- Each table has **Export CSV** and **Import CSV**, so you can work in Excel. Import *appends* rows and matches columns by header name. Exporting an empty table gives you a CSV template.
- In browser-only mode, `data/seed.json` loads the first time a browser opens the site.

> ⚠️ **Privacy:** the GitHub repo and site are public. Never commit real data (exports, or `data/seed.json` with real rows). `.gitignore` already excludes exported `*.csv` and `org-assessment-*.json` files.

## Customize

Everything is in `js/config.js`:

- `questions`: add, remove or reword questions. Group them with `section`, and add an optional `hint`. **Every `id` must be unique**, because the id is how answers are stored. Changing or removing an id hides the answers already saved under it.
- `columns.clients` / `columns.team`: rename labels, change dropdown options, and set widths. Supported types: `text`, `textarea`, `number`, `currency`, `percent`, `date`, `select` and `computed`. Keep each column `key` the same after data has been entered.
- `currency` / `locale`: control money formatting, e.g. `currency: 'INR', locale: 'en-IN'`.

`artifact.html` is an alternative entry point for hosting the same app as a claude.ai Artifact. It isn't used on GitHub Pages.
