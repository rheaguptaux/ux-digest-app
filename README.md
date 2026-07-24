# Today in UX

An AI-curated daily digest of UX news, pulled from Medium, NN Group, Smashing
Magazine, and other sources, summarized in plain language so it's never
overwhelming.

## How it works

- `backend/` — a script that fetches RSS feeds and asks Claude to summarize
  new articles. Runs automatically once a day via GitHub Actions
  (`.github/workflows/daily-digest.yml`) and writes `digest.json`.
- `app/` — the Expo (React Native) iOS app that displays `digest.json` as a
  clean daily feed.
- `digest.json` — the current day's digest. The app fetches this file
  directly from GitHub, so there's no server to run or pay for.

## 1. Push this to GitHub

```bash
cd ux-digest-app
git add -A
git commit -m "Initial UX digest app"
```
Create a new repo on github.com, then:
```bash
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git branch -M main
git push -u origin main
```

## 2. Add your Claude API key as a GitHub secret

1. Get an API key at console.anthropic.com (API Platform, not claude.ai).
2. In your GitHub repo: Settings → Secrets and variables → Actions → New
   repository secret.
3. Name: `ANTHROPIC_API_KEY`. Value: your key.

## 3. Run the digest job

Go to the "Actions" tab in your repo → "Generate daily UX digest" →
"Run workflow" to trigger it manually the first time. After that it runs
automatically every day (edit the `cron` schedule in the workflow file to
change the time — it's currently 12:00 UTC).

This commits an updated `digest.json` to your repo each day.

## 4. Point the app at your digest.json

Open `app/App.js` and replace:
```js
const DIGEST_URL =
  "https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPO/main/digest.json";
```
with your actual repo's raw URL (replace `YOUR_USERNAME` and `YOUR_REPO`).

## 5. Test it on your phone (no Mac needed)

```bash
cd app
npm install
npx expo start
```
Install the free "Expo Go" app on your iPhone from the App Store, then scan
the QR code that appears in your terminal. The app opens live on your phone.

## 6. Publish to the App Store (also no Mac needed)

Expo's EAS service builds and submits iOS apps in the cloud.

1. Sign up for a free Expo account at expo.dev, and a paid Apple Developer
   account at developer.apple.com ($99/year — required by Apple for any
   App Store app).
2. Install the EAS CLI and log in:
   ```bash
   npm install -g eas-cli
   eas login
   ```
3. From the `app/` folder, configure and build:
   ```bash
   eas build:configure
   eas build --platform ios
   ```
   EAS will ask for your Apple Developer credentials and handle
   certificates/provisioning automatically — this is the part that
   normally requires a Mac with Xcode.
4. Submit the build to App Store Connect:
   ```bash
   eas submit --platform ios
   ```
5. Log into appstoreconnect.apple.com to fill out your app's store listing
   (screenshots, description, privacy info) and submit for review.
   Apple's review typically takes 1-3 days.

## Customizing sources

Edit the `FEEDS` array in `backend/generate-digest.js` to add or remove RSS
feeds. Most publications have one — look for a link labeled "RSS" or try
`<site>/feed` or `<site>/rss`.

## Notes

- `MAX_ITEMS_PER_DAY` in `generate-digest.js` caps the digest at 8 items —
  lower it if you want it even sparser.
- LinkedIn isn't included as a source: it has no public feed/API for this
  kind of use and blocks scraping.
