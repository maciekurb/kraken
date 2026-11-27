import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';

const CAPTURE_DIR = process.env.CAPTURE_DIR;

async function snap(page: Page, filename: string): Promise<void> {
  if (!CAPTURE_DIR) return;
  await page.screenshot({ path: path.join(CAPTURE_DIR, filename), fullPage: false });
}

async function revealMyFaction(page: Page): Promise<string> {
  await page.getByTestId('nav-tab-secret').click();
  const revealBtn = page.getByTestId('reveal-role-btn');
  if (await revealBtn.isVisible()) {
    await revealBtn.click();
  }
  const factionText = (await page.getByTestId('my-faction-name').textContent())?.trim() ?? '';
  await page.getByTestId('hide-role-btn').click();
  return factionText;
}

test('full 6-player Feed the Kraken P2P companion voyage (PL/EN, Pirate Reveal, Cabin Search, Flogging, Cult Rituals, Kraken Win)', async ({
  context,
}) => {
  const names = ['Alicja', 'Bartek', 'Celina', 'Dawid', 'Ewa', 'Filip'];
  const pages: Page[] = [];

  // 1. Open Host tab in local BroadcastChannel mode & capture Polish Home + Player Aid
  const hostPage = await context.newPage();
  pages.push(hostPage);
  await hostPage.goto('/?transport=local');
  await hostPage.getByTestId('lang-pl-btn').click();
  await expect(hostPage.getByText('Towarzysz pokładowy P2P')).toBeVisible();
  await snap(hostPage, '01-home-pl.png');

  await hostPage.getByTestId('open-offline-aid-btn').click();
  await expect(hostPage.getByText('Karta pomocy')).toBeVisible();
  await snap(hostPage, '02-player-aid-pl.png');
  await hostPage.getByTestId('aid-back-home-btn').click();

  // Switch to EN for deterministic role assertions
  await hostPage.getByTestId('lang-en-btn').click();
  await expect(hostPage.getByText('P2P Tabletop Companion')).toBeVisible();

  // Host creates room
  await hostPage.getByTestId('player-name-input').fill(names[0]);
  await hostPage.getByTestId('create-room-btn').click();
  const roomCode = (await hostPage.getByTestId('lobby-room-code').textContent())?.trim() ?? '';
  expect(roomCode).toHaveLength(4);

  // 2. Five peers join the same room in parallel tabs
  for (let i = 1; i < names.length; i++) {
    const p = await context.newPage();
    pages.push(p);
    await p.goto(`/?transport=local&join=${roomCode}`);
    await p.getByTestId('lang-en-btn').click();
    await p.getByTestId('player-name-input').fill(names[i]);
    await p.getByTestId('join-room-btn').click();
    await expect(p.getByTestId('lobby-room-code')).toHaveText(roomCode);
  }

  // Host sees all 6 crew members, snap Lobby with QR, then start voyage
  await expect(hostPage.getByTestId('lobby-crew-list')).toContainText('Filip');
  await snap(hostPage, '03-lobby-qr.png');
  await hostPage.getByTestId('start-voyage-btn').click();

  // Snap sealed role card
  await snap(hostPage, '04-secret-sealed.png');

  // 3. Each player peeks at their secret faction card
  const factionsByName: Record<string, string> = {};
  for (let i = 0; i < names.length; i++) {
    factionsByName[names[i]] = await revealMyFaction(pages[i]);
  }

  const sailors = names.filter((n) => factionsByName[n] === 'Sailor');
  const pirates = names.filter((n) => factionsByName[n] === 'Pirate');
  const cultLeaderName = names.find((n) => factionsByName[n] === 'Cult Leader')!;

  expect(sailors).toHaveLength(3);
  expect(pirates).toHaveLength(2);
  expect(cultLeaderName).toBeTruthy();

  // Verify Pirates see each other on their Secret Role Card & snap Pirate Reveal
  const pirate0Idx = names.indexOf(pirates[0]);
  await pages[pirate0Idx].getByTestId('reveal-role-btn').click();
  await expect(pages[pirate0Idx].getByTestId('pirate-allies-box')).toContainText(pirates[1]);
  await snap(pages[pirate0Idx], '05-pirate-conclave-revealed.png');
  await pages[pirate0Idx].getByTestId('hide-role-btn').click();

  // 4. Host sets Alicja as Captain and runs CABIN SEARCH on first Sailor (not Alicja)
  await hostPage.getByTestId('nav-tab-crew').click();
  await hostPage.getByTestId('captain-select').selectOption({ label: names[0] });
  await snap(hostPage, '06-crew-host-controls.png');

  const cabinTargetName = sailors.find((n) => n !== names[0])!;
  const bystanderIdx = names.findIndex((n) => n !== names[0] && n !== cabinTargetName);

  await hostPage.getByTestId('trigger-cabin-search-btn').click();
  await hostPage.getByTestId(`cabin-search-target-${cabinTargetName}`).click();

  // ONLY Host (who is Captain) sees the secret reveal; bystander does NOT!
  await expect(hostPage.getByTestId('cabin-search-revealed-faction')).toHaveText('Sailor');
  await expect(pages[bystanderIdx].getByTestId('cabin-search-secret-reveal')).toHaveCount(0);

  await hostPage.getByTestId('cabin-search-done-btn').click();
  await expect(hostPage.getByTestId(`badge-searched-${cabinTargetName}`)).toBeVisible();

  // 5. Run FLOGGING on a Pirate (not Alicja)
  const flogTargetName = pirates.find((n) => n !== names[0])!;
  await hostPage.getByTestId('trigger-flogging-btn').click();
  await hostPage.getByTestId(`flogging-target-${flogTargetName}`).click();
  await hostPage.getByTestId('flogging-card-0').click();
  const flogRevealText = (await hostPage.getByTestId('flogging-revealed-text').textContent()) ?? '';
  expect(flogRevealText).not.toContain('NOT Pirates');
  await snap(hostPage, '07-flogging-revealed.png');
  await hostPage.getByTestId('flogging-done-btn').click();
  await expect(hostPage.getByTestId(`badge-flogged-${flogTargetName}`)).toBeVisible();

  // 6. Run CULT RITUAL: CONVERSION (Anti-Tell simultaneous flow across all 6 tabs!)
  await hostPage.getByTestId('toggle-manual-rituals-btn').click();
  await hostPage.getByTestId('manual-ritual-conversion-btn').click();

  const cultLeaderIdx = names.indexOf(cultLeaderName);
  const eligibleTargetName = names.find(
    (n) => n !== cultLeaderName && n !== cabinTargetName && n !== flogTargetName
  )!;
  const eligibleTargetIdx = names.indexOf(eligibleTargetName);

  // Verify Cabin Searched & Flogged targets are NOT eligible for Cult Leader!
  await expect(
    pages[cultLeaderIdx].getByTestId(`ritual-target-${cabinTargetName}`)
  ).toHaveCount(0);
  await expect(
    pages[cultLeaderIdx].getByTestId(`ritual-target-${flogTargetName}`)
  ).toHaveCount(0);

  await snap(pages[cultLeaderIdx], '08-ritual-conversion-leader.png');

  // Cult Leader chooses real target; all other 5 submit decoys simultaneously
  await pages[cultLeaderIdx].getByTestId(`ritual-target-${eligibleTargetName}`).click();
  await pages[cultLeaderIdx].getByTestId('ritual-submit-btn').click();

  for (let i = 0; i < names.length; i++) {
    if (i === cultLeaderIdx) continue;
    const firstTarget = pages[i].locator('[data-testid^="ritual-target-"]').first();
    await firstTarget.click();
    await pages[i].getByTestId('ritual-submit-btn').click();
  }

  // Converted target receives Cultist conversion screen with Cult Leader's name!
  await expect(pages[eligibleTargetIdx].getByTestId('ritual-result-converted')).toContainText(
    cultLeaderName
  );
  await snap(pages[eligibleTargetIdx], '09-ritual-converted-alert.png');

  // Cult Leader sees leader confirmation
  await expect(pages[cultLeaderIdx].getByTestId('ritual-result-leader')).toContainText(
    eligibleTargetName
  );
  // Bystander sees neutral message
  const neutralIdx = names.findIndex(
    (n) => n !== cultLeaderName && n !== eligibleTargetName
  );
  await expect(pages[neutralIdx].getByTestId('ritual-result-neutral')).toBeVisible();

  // All 6 acknowledge to close ritual
  for (const p of pages) {
    await p.getByTestId('ritual-ack-btn').click();
  }

  // Verify converted target's Secret Role Card now shows Cultist + Cult Leader
  const newFaction = await revealMyFaction(pages[eligibleTargetIdx]);
  expect(newFaction).toBe('Cultist');

  // 7. Run CULT RITUAL: GUN STASH (Anti-Tell!)
  await hostPage.getByTestId('nav-tab-crew').click();
  await hostPage.getByTestId('manual-ritual-gun_stash-btn').click();
  for (let i = 0; i < names.length; i++) {
    const plusBtn = pages[i].getByTestId(`gun-plus-${names[0]}`);
    await plusBtn.click();
    await plusBtn.click();
    await pages[i].getByTestId(`gun-plus-${names[1]}`).click();
    await pages[i].getByTestId('ritual-submit-btn').click();
  }
  await expect(hostPage.getByTestId('ritual-result-guns')).toContainText(names[0]);
  for (const p of pages) {
    await p.getByTestId('ritual-ack-btn').click();
  }

  // 8. Run CULT RITUAL: ENLIGHTENMENT (Anti-Tell!)
  await hostPage.getByTestId('manual-ritual-enlightenment-btn').click();
  await hostPage.getByTestId('enl-confirm-team-btn').click();
  await expect(pages[cultLeaderIdx].getByTestId('enlightenment-leader-reveal')).toBeVisible();
  await expect(pages[neutralIdx].getByTestId('enlightenment-decoy-view')).toBeVisible();
  for (const p of pages) {
    await p.getByTestId('ritual-submit-btn').click();
  }
  for (const p of pages) {
    await p.getByTestId('ritual-ack-btn').click();
  }

  // 9. FEED THE KRAKEN on Cult Leader -> Immediate Cult Victory across all tabs!
  const captainForKraken = names.find((n) => n !== cultLeaderName)!;
  await hostPage.getByTestId('captain-select').selectOption({ label: captainForKraken });
  await hostPage.getByTestId('trigger-feed-kraken-btn').click();
  await hostPage.getByTestId(`feed-kraken-target-${cultLeaderName}`).click();

  await expect(hostPage.getByTestId('winner-headline')).toHaveText('Cult Wins!');
  await expect(pages[cultLeaderIdx].getByTestId('winner-headline')).toHaveText('Cult Wins!');

  // Switch back to Polish and verify Polish victory text & diacritics
  await hostPage.getByTestId('lang-pl-btn').click();
  await expect(hostPage.getByTestId('winner-headline')).toHaveText('Zwycięstwo Kultu!');
  await snap(hostPage, '10-game-over-pl.png');
});
