# Org Assessment

A small static website for recording the current state of the organization:

1. **Questions**: the start page. Assessment questions, each with a free-text answer box, a progress bar, and who last edited each answer.
2. **Clients**: an editable table of active clients. Summary cards show average gross margin, G/A/R health, upcoming renewals and open escalations.
3. **Team**: an editable table of team members. Summary cards show headcount, billable count, allocation, roll-offs, flight risk, AI fluency and monthly cost.

It's plain HTML, CSS and JavaScript with no build step. It's hosted on GitHub Pages, and shared data lives in **Firebase Firestore**. People sign in with Google.

## How data is stored

| Setup | Where data lives | Who sees it |
|---|---|---|
| `firebase` settings filled in `js/config.js` | Firestore (one record per client, team member and answer) | Everyone signed in whose email the Firestore rules allow. Changes appear live. |
| `firebase.config.apiKey` left empty | That browser's localStorage | Only that browser |

Edits save automatically about half a second after typing stops. Two people editing *different* cells of the same row don't overwrite each other. If two people edit the *same* answer box at once, whoever saves last wins.

## Set up Firebase (one time, about 10 minutes)

1. **Create a project.** Go to <https://console.firebase.google.com>, choose **Add project**, and follow the steps (Google Analytics isn't needed).
2. **Create the database.** Go to **Build → Firestore Database → Create database**. Pick a location near your team and start in **production mode**.
3. **Turn on Google sign-in.** Go to **Build → Authentication → Get started → Sign-in method → Google → Enable**, then Save.
4. **Allow your GitHub Pages domain.** Go to **Authentication → Settings → Authorized domains → Add domain** and add `<your-github-username>.github.io`. `localhost` is already there for local testing.
5. **Set who has access.** Open `firestore.rules` in this repo and edit the email list and/or the company domain line. Paste the whole file into **Firestore Database → Rules** and click **Publish**.
6. **Connect the site.** Go to **Project settings (gear icon) → General → Your apps → Web (`</>`)**, register an app (no hosting needed), and copy `apiKey`, `authDomain`, `projectId` and `appId` into `firebase.config` in `js/config.js`. Add the admins' emails to `firebase.admins`.
7. Commit and push. Open the site, sign in, and add a test row.

> The Firebase web config (`apiKey` and so on) isn't a secret. It only identifies the project and is safe in a public repo. **The rules are what protect the data**, so keep them restricted to your people. Anyone not on the list who signs in sees an "access denied" message and no data.

### Managing access later
- **Add or remove a person:** edit the list in `firestore.rules`, paste it into the Firebase console again, and Publish. It takes effect within a minute.
- **Admins** (`firebase.admins` in `config.js`) are the only people shown *Import JSON backup* and *Clear all shared data*. Every allowed person can add, edit and delete individual rows.

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
