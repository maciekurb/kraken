# Feed the Kraken — P2P Companion PWA

A serverless **Peer-to-Peer Progressive Web App (PWA)** built for **GitHub Pages** that serves as a tabletop helper for the physical board game **Feed the Kraken** (Essential Edition, 5–11 players), supporting **Polish (`PL`)** and **English (`EN`)**.

Keep playing with the physical board, wooden ship, navigation cards, captain's logbook, and flintlock guns — while eliminating every *"everyone close your eyes"* phase!

## Features

- **Serverless P2P Star Topology (`PeerJS` WebRTC)**: One player hosts a room and shares a **QR code**, invite link, or 4-character room code. The Host maintains authoritative game state and sends each connected player *only* their filtered private view.
- **Mobile-Ready Resilience**: Session & host-state persistence in `localStorage`, automatic lock-screen / refresh reconnection, optional Screen Wake Lock, and full offline PWA caching (`vite-plugin-pwa`).
- **Complete Secret-Phase Automation**:
  - **5–11 Player Faction Distribution** (including the official **5-player variable Sailor/Pirate split** and **11-player blind starting Cultist**).
  - **Pirate Conclave (`Pirackie konszachty`)**: Pirates see their fellow Pirates privately inside their wax-sealed role card (with hold/tap privacy shield + auto-hide).
  - **Map Actions**:
    - **Cabin Search (`Przeszukanie kajuty`)**: Secretly reveals target's current role (including prior-conversion tentacle disclosure) *only* to the Captain and grants permanent Conversion immunity.
    - **Flogging (`Batożenie`)**: Interactive 2-card reveal showing `"I am NOT..."` publicly and granting permanent Conversion immunity.
    - **Cut Off Tongue (`Ucięcie języka`)**: Tracks silenced crew members who cannot become Captain.
    - **Feed the Kraken (`Karmienie Krakena`)**: Eliminates target without revealing their role — and automatically triggers **Cult Victory** if the Cult Leader is sacrificed!
  - **Anti-Tell Cult Rituals (`Nawrócenie`, `Schowek na broń`, `Oświecenie`)**: Simultaneous interactive screens (with matching decoy tasks for non-Cult Leaders) so nobody at the table can tell who is tapping their phone as the Cult Leader. Includes both a shuffled virtual 5-card Ritual Deck and manual card selection.
- **Interactive Player Aid (`Karta pomocy`)**: Available anytime (even offline without joining a room) in Polish and English — victory conditions, 5–11 crew table, navigation & mutiny rules, Short/Long navigation deck icons, cult rituals, and map actions.

## Development & Testing

```bash
npm install
npm run dev          # Local dev server (add ?transport=local for same-browser multi-tab testing)
npm test             # Run Vitest rules engine & protocol unit tests
npm run build        # Typecheck & build production PWA into dist/
npm run test:e2e     # Run 6-player multi-tab Playwright E2E suite
```

## Deploying to GitHub Pages

Live app: **https://maciekurb.github.io/kraken/**

1. Push to branch `master` (or `main`).
2. In your repository settings, go to **Settings → Pages → Source** and select **GitHub Actions** (auto-enabled on public repos by the workflow).
3. The included workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) automatically tests, builds, and publishes `dist/` on every push.
