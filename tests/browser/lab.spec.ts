import { test, expect, type Page } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const fixtures = readdirSync('datasets').filter((name) => name.endsWith('.json'))
  .map((name) => JSON.parse(readFileSync(path.join('datasets', name), 'utf8')));
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
async function load(page: Page, name: string) {
  await page.getByLabel('Example dataset', { exact: true }).selectOption(name);
  await button(page, 'Load Example Dataset').click();
}
async function start(page: Page) {
  await button(page, 'Start').click();
  await expect(page.getByTestId('phase')).not.toHaveAttribute('data-phase', 'loading');
}
async function complete(page: Page, count = 3) {
  await start(page);
  for (let step = 1; step <= count; ++step) {
    await button(page, 'Next Step').click();
    await expect(page.getByTestId('step-count')).toHaveText(`Step ${step} / ${count}`);
  }
  await expect(page.getByTestId('phase')).toHaveAttribute('data-phase', 'complete');
}
async function optimal(page: Page) {
  await button(page, 'Find Optimal Assignment').click();
  await expect(page.getByTestId('comparison-result')).toBeVisible();
}
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Food Delivery Rider Assignment', exact: true })).toBeVisible();
});

test('required full flow: failure dataset → Start → Next → automatic → 7 / 5 / 40%', async ({ page }) => {
  await load(page, 'greedy_failure');
  const response = page.waitForResponse('**/api/greedy');
  await start(page);
  const trace = (await (await response).json()).steps;
  await expect(page.getByTestId('step-count')).toHaveText('Step 0 / 3');
  await expect(page.getByTestId('greedy-line')).toHaveCount(0);
  await button(page, 'Next Step').click();
  await expect(page.getByTestId('step-count')).toHaveText('Step 1 / 3');
  const selectedRow = page.getByTestId('candidate-table').locator('tbody tr[data-selected="true"]');
  await expect(selectedRow).toContainText(`${trace[0].selected.riderId} → ${trace[0].selected.orderId}`);
  await expect(page.getByTestId('candidate-table').locator('tbody tr')).toHaveCount(trace[0].candidates.length);
  await expect(page.locator('[data-testid="map-point"][data-consumed="true"]')).toHaveCount(2);
  await expect(page.getByRole('table', { name: 'Greedy assignments', exact: true }).locator('tbody tr')).toHaveCount(1);
  await button(page, 'Run Automatically').click();
  await expect(page.getByTestId('phase')).toHaveAttribute('data-phase', 'complete');
  await expect(page.getByTestId('cumulative-total')).toHaveText('7');
  await optimal(page);
  await expect(page.getByTestId('greedy-total')).toHaveText('7');
  await expect(page.getByTestId('optimal-total')).toHaveText('5');
  await expect(page.getByTestId('greedy-overhead')).toHaveText('40%');
  await expect(page.getByTestId('exhaustive-count')).toHaveText('6');
  await expect(page.getByTestId('optimal-line')).toHaveCount(3);
  await button(page, 'Optimal').click();
  await expect(page.getByTestId('greedy-line')).toHaveCount(0);
  await button(page, 'Both').click();
  await expect(page.getByTestId('greedy-line')).toHaveCount(3);
  await page.getByText('Timing & what it measures', { exact: true }).click();
  await expect(page.getByTestId('optimal-timing')).toContainText('ms');
  await expect(page.getByText('Compare · browser request', { exact: true })).toBeVisible();
  await page.locator('.comparison-section').screenshot({ path: 'test-results/demo-comparison.png' });
});

for (const fixture of fixtures) {
  test(`predefined dataset ${fixture.name} produces the verified results`, async ({ page }) => {
    await load(page, fixture.name);
    const count = Math.min(fixture.riders.length, fixture.orders.length);
    await complete(page, count);
    await optimal(page);
    const displayedGreedy = Number((await page.getByTestId('greedy-total').innerText()).replaceAll(',', ''));
    const displayedOptimal = Number((await page.getByTestId('optimal-total').innerText()).replaceAll(',', ''));
    expect(Math.abs(displayedGreedy - fixture.expected.greedyTotal)).toBeLessThanOrEqual(0.00051);
    expect(Math.abs(displayedOptimal - fixture.expected.optimalTotal)).toBeLessThanOrEqual(0.00051);
    const unassigned = page.getByLabel('Greedy unassigned IDs', { exact: true });
    for (const id of [...fixture.expected.unassignedRiderIds, ...fixture.expected.unassignedOrderIds]) {
      await expect(unassigned).toContainText(id);
    }
    if (!count) await expect(page.locator('.step-explanation').getByText(/No assignment can be made because at least one group is empty/)).toBeVisible();
    if (fixture.expected.optimalTotal === 0) {
      await expect(page.getByTestId('greedy-overhead')).toHaveText('0%');
      await expect(page.getByTestId('comparison-result')).not.toContainText(/NaN|Infinity/);
    }
  });
}

test('candidate selection follows every C++ step and consumes one member of each group', async ({ page }) => {
  const response = page.waitForResponse('**/api/greedy');
  await start(page);
  const result = await (await response).json();
  for (let k = 0; k < result.steps.length; ++k) {
    await button(page, 'Next Step').click();
    const table = page.getByTestId('candidate-table');
    await expect(table.locator('tbody tr')).toHaveCount(result.steps[k].candidates.length);
    await expect(table.locator('tr[data-selected="true"]')).toContainText(`${result.steps[k].selected.riderId} → ${result.steps[k].selected.orderId}`);
    await expect(page.locator('[data-testid="map-point"][data-group="rider"][data-consumed="true"]')).toHaveCount(k + 1);
    await expect(page.locator('[data-testid="map-point"][data-group="order"][data-consumed="true"]')).toHaveCount(k + 1);
  }
});

test('edits invalidate results; duplicates and invalid numbers block Start and recover', async ({ page }) => {
  await complete(page);
  await page.getByLabel('Rider 1 X', { exact: true }).fill('-3');
  await expect(page.getByTestId('phase')).toHaveAttribute('data-phase', 'ready');
  await expect(page.getByTestId('greedy-line')).toHaveCount(0);
  await expect(page.getByTestId('comparison-result')).toHaveCount(0);
  await page.getByLabel('Rider 2 ID', { exact: true }).fill('R1');
  await expect(page.getByText('ID: IDs must be unique within this group.').first()).toBeVisible();
  await expect(button(page, 'Start')).toBeDisabled();
  await page.getByLabel('Rider 2 ID', { exact: true }).fill('R2');
  await page.getByLabel('Rider 1 X', { exact: true }).fill('NaN');
  await expect(page.getByLabel('Rider 1 X', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await expect(button(page, 'Start')).toBeDisabled();
  await page.getByLabel('Rider 1 X', { exact: true }).fill('-1000');
  await expect(button(page, 'Start')).toBeEnabled();
});

test('manual removal allows empty groups with understandable feedback', async ({ page }) => {
  for (let count = 3; count > 0; --count) await button(page, 'Remove order 1').click();
  await expect(page.getByText(/At least one group is empty. No assignment can be made/)).toBeVisible();
  await start(page);
  await expect(page.getByTestId('step-count')).toHaveText('Step 0 / 0');
  await expect(page.getByTestId('cumulative-total')).toHaveText('0');
  await expect(page.getByLabel('Greedy unassigned IDs', { exact: true })).toContainText('R1, R2, R3');
  await optimal(page);
  await expect(page.getByTestId('greedy-overhead')).toHaveText('0%');
});

test('Reset and Pause cancel automatic playback', async ({ page }) => {
  await start(page);
  await button(page, 'Next Step').click();
  await button(page, 'Run Automatically').click();
  await button(page, 'Pause').click();
  await page.waitForTimeout(1100);
  await expect(page.getByTestId('step-count')).toHaveText('Step 1 / 3');
  await button(page, 'Run Automatically').click();
  await button(page, 'Reset').click();
  await page.waitForTimeout(1100);
  await expect(page.getByTestId('step-count')).toHaveText('Step 0 / 3');
  await expect(page.getByTestId('phase')).toHaveAttribute('data-phase', 'ready');
  await expect(page.getByTestId('greedy-line')).toHaveCount(0);
});

test('slow stale greedy responses cannot restore results after an edit or Reset', async ({ page }) => {
  await page.route('**/api/greedy', async (route) => {
    const response = await route.fetch();
    await new Promise((resolve) => setTimeout(resolve, 400));
    await route.fulfill({ response }).catch(() => {});
  });
  await button(page, 'Start').click();
  await expect(page.getByTestId('phase')).toHaveAttribute('data-phase', 'loading');
  await page.getByLabel('Rider 1 X', { exact: true }).fill('-2');
  await page.waitForTimeout(650);
  await expect(page.getByTestId('phase')).toHaveAttribute('data-phase', 'ready');
  await expect(page.getByTestId('greedy-line')).toHaveCount(0);
  await button(page, 'Start').click();
  await button(page, 'Reset').click();
  await page.waitForTimeout(650);
  await expect(page.getByTestId('phase')).toHaveAttribute('data-phase', 'ready');
});

test('slow stale optimal responses cannot restore comparison after input changes', async ({ page }) => {
  await complete(page);
  await page.route('**/api/compare', async (route) => {
    const response = await route.fetch();
    await new Promise((resolve) => setTimeout(resolve, 400));
    await route.fulfill({ response }).catch(() => {});
  });
  await button(page, 'Find Optimal Assignment').click();
  await page.getByLabel('Rider 1 X', { exact: true }).fill('-2');
  await page.waitForTimeout(650);
  await expect(page.getByTestId('comparison-result')).toHaveCount(0);
  await expect(page.getByTestId('phase')).toHaveAttribute('data-phase', 'ready');
});

test('failed greedy and optimal requests allow recovery through Retry', async ({ page }) => {
  const fail = (route: Parameters<Parameters<Page['route']>[1]>[0]) => route.fulfill({ status: 503,
    contentType: 'application/json', body: JSON.stringify({ error: { code: 'BACKEND_BUSY', message: 'Execution slots are busy. Please retry.' } }) });
  await page.route('**/api/greedy', fail);
  await start(page);
  await expect(page.getByRole('alert')).toContainText('Execution slots are busy');
  await page.unroute('**/api/greedy');
  await button(page, 'Retry').click();
  await expect(button(page, 'Next Step')).toBeEnabled();
  for (let k = 0; k < 3; ++k) await button(page, 'Next Step').click();
  await page.route('**/api/compare', fail);
  await button(page, 'Find Optimal Assignment').click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.unroute('**/api/compare');
  await button(page, 'Retry').click();
  await expect(page.getByTestId('greedy-overhead')).toHaveText('40%');
});

test('seeded generation is reproducible and supports independent 2–8 counts', async ({ page }) => {
  await page.getByText('Generate a random dataset', { exact: true }).click();
  await page.getByLabel('Random rider count').fill('2');
  await page.getByLabel('Random order count').fill('4');
  await page.getByLabel('Random seed').fill('42');
  await button(page, 'Generate Random Dataset').click();
  const points = await page.locator('[data-testid="map-point"] title').allTextContents();
  await button(page, 'Generate Random Dataset').click();
  expect(await page.locator('[data-testid="map-point"] title').allTextContents()).toEqual(points);
  await expect(page.locator('[data-testid="map-point"][data-group="rider"]')).toHaveCount(2);
  await expect(page.locator('[data-testid="map-point"][data-group="order"]')).toHaveCount(4);
  await complete(page, 2);
  await optimal(page);
});

for (const [name, width, height] of [['mobile-small', 320, 740], ['mobile', 390, 844], ['tablet', 820, 1180], ['desktop', 1440, 1000]] as const) {
  test(`${name} layout: no page overflow, readable labels, negative coordinates, and equal axis scale`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.reload();
    await load(page, 'negative_coordinates');
    await complete(page, 2);
    await optimal(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const labels = await page.getByTestId('coordinate-map').evaluate((svg) => {
      const view = (svg as unknown as SVGSVGElement).viewBox.baseVal;
      return [...svg.querySelectorAll('.point-label-bg')].map((node) => {
        const box = (node as SVGGraphicsElement).getBBox();
        return box.x >= 0 && box.y >= 0 && box.x + box.width <= view.width && box.y + box.height <= view.height;
      });
    });
    expect(labels.every(Boolean)).toBe(true);
    await load(page, 'greedy_failure');
    const scale = await page.getByTestId('coordinate-map').evaluate((svg) => {
      const r1 = svg.querySelector('[data-group="rider"][data-id="R1"] circle.rider-marker')!;
      const r2 = svg.querySelector('[data-group="rider"][data-id="R2"] circle.rider-marker')!;
      const r3 = svg.querySelector('[data-group="rider"][data-id="R3"] circle.rider-marker')!;
      const o3 = svg.querySelector('[data-group="order"][data-id="O3"] rect.order-marker')!;
      return { x: (Number(r2.getAttribute('cx')) - Number(r1.getAttribute('cx'))) / 3,
        y: Number(r3.getAttribute('cy')) - Number(o3.getAttribute('y')) - 6 };
    });
    expect(Math.abs(scale.x - scale.y)).toBeLessThan(0.00001);
    await page.screenshot({ path: `test-results/${name}.png`, fullPage: true });
  });
}

test('keyboard access, visible focus, reduced motion, and reveals without IntersectionObserver', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => { Object.defineProperty(window, 'IntersectionObserver', { value: undefined, configurable: true }); });
  await page.reload();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to simulation controls' })).toBeFocused();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await expect(button(page, 'Start')).toBeFocused();
  expect(await button(page, 'Start').evaluate((element) => getComputedStyle(element).outlineWidth)).toBe('3px');
  await start(page);
  await button(page, 'Next Step').click();
  expect(await page.getByTestId('greedy-line').evaluate((element) => getComputedStyle(element).animationName)).toBe('none');
  const revealStyles = await page.locator('.reveal').evaluateAll((elements) => elements.map((element) => getComputedStyle(element).opacity));
  expect(revealStyles.every((value) => value === '1')).toBe(true);
  await expect(page.locator('[role="status"]')).toHaveCount(1);
  await expect(page.getByTestId('candidate-table')).not.toHaveAttribute('aria-live');
});

test('eight coincident pairs: separate unclipped labels, bounded exhaustive search, and zero overhead on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await load(page, 'empty_both');
  await page.locator('.coordinate-editor > summary').click();
  for (let index = 0; index < 8; ++index) {
    await button(page, '+ Add rider').click();
    await button(page, '+ Add order').click();
  }
  await expect(button(page, '+ Add rider')).toBeDisabled();
  await expect(button(page, '+ Add order')).toBeDisabled();
  await complete(page, 8);
  await optimal(page);
  await expect(page.getByTestId('exhaustive-count')).toHaveText('40,320');
  await expect(page.getByTestId('greedy-overhead')).toHaveText('0%');
  const boxes = await page.getByTestId('coordinate-map').evaluate((svg) =>
    [...svg.querySelectorAll('.point-label-bg')].map((node) => {
      const box = (node as SVGGraphicsElement).getBBox();
      return { x: box.x, y: box.y, w: box.width, h: box.height };
    }));
  expect(boxes).toHaveLength(16);
  for (let i = 0; i < boxes.length; ++i) {
    for (let j = i + 1; j < boxes.length; ++j) {
      const a = boxes[i]; const b = boxes[j];
      expect(a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y).toBe(false);
    }
  }
  await page.getByTestId('coordinate-map').screenshot({ path: 'test-results/coincident-mobile.png' });
});

test('an incomplete success response becomes a readable error and Retry recovers', async ({ page }) => {
  await page.route('**/api/greedy', (route) => route.fulfill({ status: 200,
    contentType: 'application/json', body: JSON.stringify({ assignments: [] }) }));
  await start(page);
  await expect(page.getByRole('alert')).toContainText('incomplete result');
  await page.unroute('**/api/greedy');
  await button(page, 'Retry').click();
  await expect(button(page, 'Next Step')).toBeEnabled();
});
