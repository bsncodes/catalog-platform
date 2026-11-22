import { expect, test } from '@playwright/test';
import { mailpitMessageText, poll, searchMailpit, sql } from './support';

test('customer browses, searches, views a product and submits an enquiry that is emailed and PROCESSED', async ({ page, baseURL, request }) => {
  const apiRequests: string[] = [];
  page.on('request', (request) => {
    if (['fetch', 'xhr'].includes(request.resourceType())) apiRequests.push(request.url());
  });

  // 1. Homepage with five configured featured products.
  await page.goto('/');
  const featured = page.getByRole('list', { name: 'Featured products' });
  await expect(featured.getByRole('listitem')).toHaveCount(5);

  // 2. Category browsing: top-rated and additional sections.
  await page.getByRole('navigation', { name: 'Categories' }).getByRole('link', { name: "women's clothing" }).click();
  await expect(page.getByRole('heading', { level: 1, name: "women's clothing" })).toBeVisible();
  await expect(page.getByRole('list', { name: "Top rated in women's clothing" }).getByRole('listitem')).toHaveCount(5);
  await expect(page.getByRole('list', { name: "More in women's clothing" }).getByRole('listitem')).toHaveCount(1);

  // 3. Search.
  await page.getByRole('searchbox', { name: 'Search products' }).fill('jacket');
  await page.getByRole('button', { name: 'Search' }).click();
  const results = page.getByRole('list', { name: 'Search results' });
  await expect(results.getByRole('listitem').first()).toBeVisible();
  await expect(results).toContainText(/jacket/i);

  // 4. Product details.
  await page.goto('/');
  await featured.getByRole('listitem').first().getByRole('link').first().click();
  await expect(page).toHaveURL(/\/products\/\d+$/);
  await expect(page.getByText(/reviews/)).toBeVisible();
  await expect(page.getByText(/\$\d+\.\d{2}/).first()).toBeVisible();
  const title = (await page.getByRole('heading', { level: 1 }).textContent())?.trim() ?? '';
  expect(title.length).toBeGreaterThan(0);
  await expect(page.getByRole('img', { name: title })).toBeVisible();

  // 5. Enquiry submission and Thank You confirmation.
  const customerEmail = `e2e-${Date.now()}@example.com`;
  await page.getByRole('button', { name: 'Enquire' }).click();
  await page.getByLabel('Name').fill('E2E Customer');
  await page.getByLabel('Email').fill(customerEmail);
  await page.getByLabel('Phone').fill('+91 98765 43210');
  await page.getByLabel('Message (optional)').fill('Is this available in bulk?');
  await page.getByRole('button', { name: 'Send enquiry' }).click();
  await expect(page.getByRole('heading', { name: 'Thank you for your enquiry' })).toBeVisible();
  const reference = (await page.getByText(/^Reference: /).textContent())?.replace('Reference: ', '').trim() ?? '';
  expect(reference).toMatch(/^[0-9a-f-]{36}$/);

  // The browser only ever called the Gateway's public API (never Fake Store or internal services).
  const origin = new URL(baseURL ?? 'http://localhost:8080').origin;
  expect(apiRequests.length).toBeGreaterThan(0);
  for (const url of apiRequests) {
    expect(new URL(url).origin).toBe(origin);
    expect(new URL(url).pathname.startsWith('/api/catalog/')).toBe(true);
  }

  // 6. Catalog persisted the enquiry and its outbox event, and the event was published to SQS.
  expect(sql('catalog', `select entity_type || ':' || (entity_snapshot->>'name') from catalog_enquiries where id = '${reference}'`)).toBe(`PRODUCT:${title}`);
  await poll(() => sql('catalog', `select count(*) from outbox_events where aggregate_id = '${reference}' and published_at is not null`), (v) => v === '1');

  // 7. Notification Service consumed it and the sales email arrived in Mailpit.
  const mail = await poll(() => searchMailpit(reference), (r) => r.messages_count === 1);
  const message = mail.messages[0]!;
  expect(message.To.map((t) => t.Address)).toEqual(['product-sales@example.com']);
  expect(message.Subject).toBe(`New product enquiry: ${title}`);
  expect(await mailpitMessageText(message.ID)).toContain(customerEmail);

  // 8–9. Notification Service called the internal PATCH; Catalog persisted PROCESSED — observed through the
  // public status API via the gateway (what a customer or support agent would use), then confirmed in the DBs.
  const statusBody = await poll(
    async () => (await (await request.get(`/api/catalog/enquiries/${reference}`)).json()) as { data: { status: string; processedAt: string | null; entity: { name: string } } },
    (b) => b.data.status === 'PROCESSED',
  );
  expect(statusBody.data.processedAt).not.toBeNull();
  expect(statusBody.data.entity.name).toBe(title);
  expect(JSON.stringify(statusBody)).not.toContain(customerEmail);
  expect(sql('catalog', `select status from catalog_enquiries where id = '${reference}'`)).toBe('PROCESSED');
  expect(sql('notification', `select email_status || '/' || callback_status from notification_deliveries where enquiry_id = '${reference}'`)).toBe('SENT/COMPLETED');
  expect(sql('catalog', `select callback_result from processed_events where enquiry_id = '${reference}'`)).toBe('APPLIED');

  // 10. The customer still sees the Thank You confirmation (it never claimed delivery).
  await expect(page.getByRole('heading', { name: 'Thank you for your enquiry' })).toBeVisible();
});

test('category enquiry is routed to the category sales inbox', async ({ page, request }) => {
  await page.goto('/categories/electronics');
  await page.getByRole('button', { name: 'Enquire' }).click();
  await page.getByLabel('Name').fill('Category Buyer');
  await page.getByLabel('Email').fill('buyer@example.com');
  await page.getByLabel('Phone').fill('+919876543210');
  await page.getByRole('button', { name: 'Send enquiry' }).click();
  await expect(page.getByRole('heading', { name: 'Thank you for your enquiry' })).toBeVisible();
  const reference = (await page.getByText(/^Reference: /).textContent())?.replace('Reference: ', '').trim() ?? '';
  const mail = await poll(() => searchMailpit(reference), (r) => r.messages_count === 1);
  expect(mail.messages[0]!.To[0]!.Address).toBe('category-sales@example.com');
  await poll(async () => ((await (await request.get(`/api/catalog/enquiries/${reference}`)).json()) as { data: { status: string } }).data.status, (v) => v === 'PROCESSED');
});

test('invalid enquiry input is rejected in the browser and nothing is submitted', async ({ page }) => {
  let posted = false;
  page.on('request', (request) => {
    if (request.method() === 'POST') posted = true;
  });
  await page.goto('/products/1');
  await page.getByRole('button', { name: 'Enquire' }).click();
  await page.getByLabel('Email').fill('not-an-email');
  await page.getByRole('button', { name: 'Send enquiry' }).click();
  await expect(page.getByText('Name is required.')).toBeVisible();
  await expect(page.getByText('Enter a valid email address.')).toBeVisible();
  expect(posted).toBe(false);
});

test('unknown product shows a helpful error @responsive', async ({ page }) => {
  await page.goto('/products/9999');
  await expect(page.getByRole('alert')).toContainText('The requested product does not exist.');
  // No horizontal page scroll (checked on desktop and mobile viewports).
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
