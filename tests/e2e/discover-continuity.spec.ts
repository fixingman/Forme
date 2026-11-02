import { test, expect, type Page } from "@playwright/test";
import { defaults } from "../../lib/catalog";

const at = new Date(Date.now() - 86400000).toISOString();
const piece = (i: number) => ({
  id: 99001 + i,
  source: "vinted",
  sourceId: String(99001 + i),
  sourceKey: `vinted:${99001 + i}`,
  sourceUrl: `https://www.vinted.se/items/${99001 + i}-fixture`,
  brand: ["Auralee", "Lemaire", "Studio Nicholson"][i % 3],
  title: `Cotton shirt ${i}`,
  price: 100,
  currency: "SEK",
  size: "M",
  gender: "men",
  genderSource: "provider",
  condition: "Good",
  image: "",
  imageUrl: "https://images1.vinted.net/fixture.webp",
  category: "",
  style: "Minimalism",
  rarity: 0,
  age: 1,
  fetchedAt: at,
  observedAt: at,
});
const pieces = Array.from({ length: 93 }, (_, i) => piece(i));
const settings = {
  ...defaults,
  following: ["Our Legacy"],
  excluded: [],
  styles: ["Minimalism"],
  saved: [],
  dismissed: [],
  tasteFeedback: [],
  searches: [],
  styleRules: {},
  gender: { selected: ["men"], includeUnknown: true },
  sizing: { enabled: false, selected: [], includeOneSize: true, includeUnspecified: true },
};
type Engine = "current" | "river";
const cardsOf = (page: Page) => page.locator(".grid .product");
const idsOf = (page: Page) =>
  cardsOf(page).evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-testid")!));
const reasonsOf = (page: Page) =>
  cardsOf(page).evaluateAll((nodes) =>
    Object.fromEntries(
      nodes.map((node) => [
        node.getAttribute("data-testid")!,
        (node.querySelector(".why") as HTMLElement)?.innerText,
      ]),
    ),
  );
const savedIds = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("forme-v2")!).saved as number[]);

async function setup(page: Page, engine: Engine, width: number) {
  await page.setViewportSize({ width, height: 800 });
  await page.clock.install();
  await page.addInitScript((settings) => {
    localStorage.setItem("forme-onboarding-complete", "1");
    if (!localStorage.getItem("forme-v2"))
      localStorage.setItem("forme-v2", JSON.stringify(settings));
  }, settings);
  let source = pieces,
    snapshots = 0,
    offline = false;
  await page.route("**/api/listings", (route) =>
    route.fulfill({ json: { fetchedAt: at, items: source } }),
  );
  await page.route("**/api/profile", (route) => route.fulfill({ json: { sync: "off" } }));
  for (const path of ["local-profile", "size-profile", "refresh"])
    await page.route(`**/api/${path}`, (route) =>
      route.fulfill({ status: 503, json: { error: "Isolated fixture" } }),
    );
  await page.route("**/api/learning", (route) => {
    const body = route.request().postDataJSON();
    if (offline && (body?.action === "events" || body?.action === "exposure"))
      return route.fulfill({ status: 503, json: { error: "Fixture offline" } });
    if (body?.action === "snapshot") {
      snapshots++;
      const keys = [...source].reverse().map((row) => row.sourceKey);
      // Deliberately change later server orderings: an active visit must retain its browse order.
      const ordered = snapshots === 1 ? keys : [...keys.slice(9), ...keys.slice(0, 9)];
      return route.fulfill({
        json: {
          id: "11111111-1111-4111-8111-111111111111",
          items: source,
          selectedKeys: engine === "current" ? null : ordered,
          selectedName: engine,
        },
      });
    }
    return route.fulfill({ json: { ok: true } });
  });
  await page.route("https://images1.vinted.net/**", (route) =>
    route.fulfill({ status: 404, body: "" }),
  );
  await page.goto("/discover");
  await expect.poll(() => snapshots).toBe(1);
  // Cross the snapshot debounce, including the initial selected-engine response.
  await page.clock.runFor(750);
  expect(snapshots).toBe(1);
  await expect(cardsOf(page)).toHaveCount(24);
  return {
    snapshots: () => snapshots,
    offline: (value: boolean) => {
      offline = value;
    },
    publish: (value: typeof pieces) => {
      source = value;
    },
  };
}
async function settleVote(page: Page, mock: Awaited<ReturnType<typeof setup>>, expected: number) {
  // A negative request-count assertion must cross the hook's 350 ms debounce.
  await page.clock.runFor(750);
  await expect.poll(() => mock.snapshots()).toBe(expected);
}

for (const engine of ["current", "river"] as const)
  for (const width of [1280, 375]) {
    test(`${engine}: saving deep in Discover removes only that piece and preserves the browse at ${width}px`, async ({
      page,
    }) => {
      const mock = await setup(page, engine, width),
        cards = cardsOf(page);
      await cards.nth(23).scrollIntoViewIfNeeded();
      await expect(cards).toHaveCount(48);
      const initial = await idsOf(page),
        targetId = initial[35],
        anchor = page.getByTestId(initial[34]);
      const target = page.getByTestId(targetId),
        id = Number(targetId.replace("listing-", ""));
      await target.getByRole("button", { name: /^Save / }).scrollIntoViewIfNeeded();
      const reasons = await reasonsOf(page),
        y = (await anchor.boundingBox())!.y,
        scroll = await page.evaluate(() => scrollY);
      const outage = engine === "current" && width === 1280;
      mock.offline(outage);
      await target.getByRole("button", { name: /^Save / }).click();
      await expect(target).toHaveCount(0);
      expect(await savedIds(page)).toEqual([id]);
      if (outage) await expect(page.locator(".learning-sync-notice")).toBeVisible();
      await settleVote(page, mock, engine === "current" ? 1 : 2);
      await expect(cards).toHaveCount(48);
      const remaining = initial.filter((value) => value !== targetId),
        after = await idsOf(page);
      expect(after.slice(0, remaining.length)).toEqual(remaining); // One next piece fills the revealed window.
      const afterReasons = await reasonsOf(page);
      for (const key of remaining) expect(afterReasons[key]).toBe(reasons[key]);
      expect(Math.abs((await anchor.boundingBox())!.y - y)).toBeLessThan(2);
      expect(Math.abs((await page.evaluate(() => scrollY)) - scroll)).toBeLessThan(2);
      mock.offline(false);
      await page.evaluate(() => window.dispatchEvent(new Event("online")));
      await expect(page.locator(".learning-sync-notice")).toHaveCount(0);

      // Save state travels to Saved items; unsaving there makes the piece eligible on a later visit.
      await page.getByRole("link", { name: "Saved items, 1", exact: true }).click();
      await page
        .getByTestId(targetId)
        .getByRole("button", { name: /^Unsave / })
        .click();
      expect(await savedIds(page)).toEqual([]);
      const previousRequests = mock.snapshots();
      await page.getByRole("link", { name: "Discover", exact: true }).first().click();
      await expect(page.getByTestId(targetId)).toBeVisible();
      await expect.poll(() => mock.snapshots()).toBe(previousRequests + 1);
      await page.clock.runFor(750);
      expect(mock.snapshots()).toBe(previousRequests + 1);

      // Hide/Undo removes and restores one exact slot without collapsing or reshuffling the window.
      const beforeHide = await idsOf(page),
        hiddenId = beforeHide[35];
      await page
        .getByTestId(hiddenId)
        .getByRole("button", { name: /^Not for me:/ })
        .click();
      await expect(page.getByTestId(hiddenId)).toHaveCount(0);
      await expect(cards).toHaveCount(48);
      expect((await idsOf(page)).slice(0, 47)).toEqual(
        beforeHide.filter((key) => key !== hiddenId),
      );
      await settleVote(page, mock, previousRequests + 1 + (engine === "river" ? 1 : 0));
      await page.getByRole("button", { name: "Undo Not for me", exact: true }).click();
      await expect(page.getByTestId(hiddenId)).toBeVisible();
      await settleVote(page, mock, previousRequests + 1 + (engine === "river" ? 2 : 0));
      expect(await idsOf(page)).toEqual(beforeHide);

      // Item-page/Back remains the same browse; saving there still removes the piece on return.
      const detailId = beforeHide[35],
        link = page.getByTestId(detailId).getByRole("link").first();
      await link.scrollIntoViewIfNeeded();
      const position = await page.evaluate(() => scrollY);
      await link.click();
      await expect(page).toHaveURL(/\/items\/\d+$/);
      await page.getByRole("button", { name: "Save item", exact: true }).click();
      await expect(page.getByRole("button", { name: "Saved", exact: true })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await page.goBack();
      await expect(page).toHaveURL(/\/discover$/);
      await expect(page.getByTestId(detailId)).toHaveCount(0);
      await expect(cards).toHaveCount(48);
      expect((await idsOf(page)).slice(0, 47)).toEqual(
        beforeHide.filter((key) => key !== detailId),
      );
      await expect
        .poll(async () => Math.abs((await page.evaluate(() => scrollY)) - position))
        .toBeLessThan(2);

      // A deliberate hard preference still applies immediately, even to a frozen learned ordering.
      const first = cards.first(),
        firstId = (await first.getAttribute("data-testid"))!;
      const brand = pieces.find((row) => `listing-${row.id}` === firstId)!.brand;
      await first
        .getByRole("button", { name: `Brand preferences for ${brand}`, exact: true })
        .click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: `Not interested in ${brand}`, exact: true })
        .click();
      await expect(page.getByTestId(firstId)).toHaveCount(0);
      expect(
        (await idsOf(page)).every(
          (key) => pieces.find((row) => `listing-${row.id}` === key)?.brand !== brand,
        ),
      ).toBe(true);
    });
  }

for (const engine of ["current", "river"] as const)
  test(`${engine}: published additions append without moving the expanded feed`, async ({
    page,
  }) => {
    const mock = await setup(page, engine, 1280),
      cards = cardsOf(page);
    await cards.nth(23).scrollIntoViewIfNeeded();
    await expect(cards).toHaveCount(48);
    await cards
      .nth(35)
      .getByRole("button", { name: /^Save / })
      .scrollIntoViewIfNeeded();
    const before = await idsOf(page),
      scroll = await page.evaluate(() => scrollY),
      reasons = await reasonsOf(page);
    mock.publish([...pieces, piece(100), piece(101)]);
    await page.clock.fastForward(5 * 60000);
    await expect(page.locator(".feed-meta")).toContainText("95 pieces");
    await page.clock.runFor(750);
    expect(await idsOf(page)).toEqual(before);
    expect(await reasonsOf(page)).toEqual(reasons);
    expect(Math.abs((await page.evaluate(() => scrollY)) - scroll)).toBeLessThan(2);
    await expect(cards).toHaveCount(48);
    for (let pass = 0; pass < 3 && (await cards.count()) < 95; pass++) {
      await cards.last().scrollIntoViewIfNeeded();
      await page.clock.runFor(100);
    }
    await expect(cards).toHaveCount(95);
    expect((await idsOf(page)).slice(-2)).toEqual(["listing-99101", "listing-99102"]);
  });
