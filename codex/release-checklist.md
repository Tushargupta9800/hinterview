# Hinterview Release Checklist

## Build

- Run `npm run build`
- Run `npm run test`
- Run `npm run release:check`

## Desktop

- Verify Electron opens against local packaged renderer
- Verify settings, question library, question flow, and my learning load without console errors
- Verify question progress and notes survive app restart
- Verify macOS permissions prompts behave correctly for microphone and speech features if enabled

## Web

- Verify `/`, `/questions/:slug`, `/learning`, and `/settings` load cleanly
- Verify retry states appear when the API is unavailable
- Verify AI hint, answer, and submit flows still work with a real configured agent

## Data and Migrations

- Confirm `.data/hinterview.sqlite` opens successfully after upgrading from an older local database
- Confirm `schema_migrations` contains the current hardening entries
- Confirm seeded and custom questions both load after restart

## Final UX

- Keyboard focus is visible on dialogs and primary actions
- Dialogs close cleanly and do not trap the app in a broken overlay state
- Library, question, and learning pages all have usable retry or recovery paths
