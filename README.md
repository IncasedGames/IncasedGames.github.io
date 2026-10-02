# Incased Games
Target: https://incasedgames.github.io (no www). The account or organization owner must be IncasedGAMES and the public repository must be IncasedGAMES.github.io.

## Current status
Website and integration source are prepared. GitHub organization/repository creation, Pages activation and Supabase provisioning are not completed. No public URL has been created. Community features clearly show unavailable until connected; they do not simulate successful submissions or store public reviews locally.

## Publish
1. Create the free IncasedGAMES GitHub organization if the name is available; create public repository IncasedGAMES.github.io. Do not rename the existing personal account.
2. Create a Supabase free-tier project. Run backend/schema.sql in SQL Editor. Enable the GitHub Auth provider (using a free GitHub OAuth application and its callback URL from Supabase), set Site URL to https://incasedgames.github.io and allow that URL for auth redirects. Review the project's current free limits before launch. No paid plan is required by this implementation.
3. Put its project HTTPS URL and **publishable key only** in public/config.js. Never put a secret/service-role key in the site or repository. The site uses GitHub OAuth, so visitors do not need a separate password or an email-delivery service. Configure the OAuth secret only in Supabase Auth settings, never the repository.
4. Push these files to the repository. Under repository Settings > Pages choose GitHub Actions. Run the 'Publish approved website' workflow manually.
5. Inspect the successful Pages deployment URL. Test a real GitHub sign-in, a review from a second browser, and an anonymous report. Reports appear only in Supabase Table Editor > bug_reports; they cannot be read by public users or normal signed-in users. Do not grant public SELECT to that table.

## Game updates
The published game is an exact fixed copy of the Terrain and Lava release. Its SHA-256 is pinned in release-lock.json and checked by build.mjs. No scheduled update, latest-release lookup, automatic library sync or push-triggered publish exists. Change the game and lock only after the owner explicitly requests an update on the website. Website styling/community edits do not grant game-update approval.

## Assets
The homepage cover reuses the game's title/skull/loading-screen artwork, recreated as a static SVG instead of claiming a GPU screenshot. Audio files are extracted exactly from the frozen release and can be previewed/downloaded. credits.js lists all seven audio packs, their original creators, modifications and CC0 sources. Models are intentionally scheduled for later. Add authorized GLBs under public/models/ then append {name,creator,license,file:'models/NAME.glb'} to public/models.json. In-page 3D viewing and downloads are already implemented. Do not claim redistribution licences for supplied models without confirmation.

## Local
Run npm test and npm run build; serve dist with any static HTTP server. file:// cannot import ES modules. Backend SQL needs a real Supabase/Postgres deployment for end-to-end verification. No fake accounts/reviews are seeded. No dependency installation is needed to build. Game saves are browser-local as before.
