# SECTiON

Read Light Novels · Machine Translation — a black & white, minimal light novel reader front-end.

## Pages
- `index.html` — Homepage
- `login.html` — Login / sign-up
- `library.html` — Library / browse
- `novel-detail.html` — Novel detail / chapter list
- `novel-edit.html` — Add / edit a novel and its chapters
- `reading.html` — Chapter reader
- `rankings.html` — Rankings
- `profile.html` — User profile
- `history.html` — Reading history
- `favorites.html` — Favorites
- `settings.html` — Settings

## Stack
HTML5 + CSS3 for structure and styling, plus a small vanilla-JS layer (`js/app.js`) that makes every page
functional using `localStorage` as the data store — there is no server. That means:

- **One browser = one reader.** Data doesn't sync across devices or browsers.
- Adding/editing novels and chapters (`novel-edit.html`), reading progress, favorites, history, tickets,
  and settings are all real and persist between visits — but only in the browser that saved them.
- Login/sign-up is a single local profile with no real authentication or password security. Don't use a
  real password here.

Fonts via Google Fonts (Inter), icons via Font Awesome 6 CDN.

To wire this up to real accounts and shared data across devices, `js/app.js`'s `loadDB`/`saveDB` functions
are the place to swap `localStorage` for real API calls.

## Live site
Enable GitHub Pages (Settings → Pages → Deploy from branch `main`, folder `/root`) and it will be live at:
`https://<your-username>.github.io/<repo-name>/`
