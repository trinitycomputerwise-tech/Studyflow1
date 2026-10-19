# StudyFlow — Static Study Planner

A responsive study planner built with plain HTML, CSS, and JavaScript. No framework, Python, Flask, or backend is required.

## Files
- `index.html` — page structure
- `styles.css` — responsive layout and visual styles
- `app.js` — assignment CRUD, filters, progress, subject summaries, calendar, dark mode, and localStorage persistence

## Run locally
Open `index.html` in your browser. For a local development server, use VS Code Live Server.

## Deploy to GitHub Pages
1. Create or open a GitHub repository.
2. Upload `index.html`, `styles.css`, and `app.js` to the repository root.
3. Open **Settings → Pages**.
4. Under Build and deployment, choose **Deploy from a branch**.
5. Select your main branch and `/(root)`, then save.
6. Wait for GitHub Pages to publish the site.

## Deploy to Netlify
Drag the `studyflow-static` folder (or its extracted contents) into Netlify Drop, or connect the GitHub repository. No build command is needed; publish directory is `.`.

## Important
Assignments are stored in the browser's localStorage on the current device/browser. They do not sync across devices and can be removed if site data is cleared. This static version has no user accounts or cloud database.
