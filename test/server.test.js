const assert = require('node:assert/strict');
const { afterEach, test } = require('node:test');
const { createApp } = require('../server');

const servers = new Set();

async function startTestServer(createPayment = async () => ({
    result: { payment: { id: 'payment-test-id', status: 'COMPLETED' } },
})) {
    const app = createApp({
        squareClient: { paymentsApi: { createPayment } },
        applicationId: 'sandbox-app-id',
        locationId: 'test-location-id',
        taxRate: 0.0825,
    });
    const server = app.listen(0);
    servers.add(server);
    await new Promise(resolve => server.once('listening', resolve));
    return `http://127.0.0.1:${server.address().port}`;
}

afterEach(async () => {
    await Promise.all([...servers].map(server => new Promise((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
    })));
    servers.clear();
});

test('payment config exposes the Square public IDs', async () => {
    const baseUrl = await startTestServer();
    const response = await fetch(`${baseUrl}/api/config`);
    assert.equal(response.status, 200);
    const config = await response.json();
    assert.equal(config.applicationId, 'sandbox-app-id');
    assert.equal(config.locationId, 'test-location-id');
    assert.equal(config.taxRate, 0.0825);
    assert.match(config.sdkUrl, /^https:\/\/(sandbox\.)?web\.squarecdn\.com\//);
});

test('catalog has 14 products with unique ids and optimized images', async () => {
    const baseUrl = await startTestServer();
    const products = await (await fetch(`${baseUrl}/api/products`)).json();
    assert.equal(products.length, 14);
    assert.equal(new Set(products.map(p => p.id)).size, 14);
    const image = await fetch(`${baseUrl}/assets/products/${products[0].image}-400.webp`);
    assert.equal(image.status, 200);
    assert.match(image.headers.get('cache-control'), /max-age=/);
});

test('source files and secrets are not served publicly', async () => {
    const baseUrl = await startTestServer();
    for (const file of ['.env', 'server.js', 'package.json', 'data/products.json']) {
        const response = await fetch(`${baseUrl}/${file}`);
        assert.equal(response.status, 404, file);
    }
});

test('security headers are set', async () => {
    const baseUrl = await startTestServer();
    const response = await fetch(`${baseUrl}/`);
    assert.equal(response.status, 200);
    assert.ok(response.headers.get('content-security-policy'));
    assert.equal(response.headers.get('x-powered-by'), null);
});

test('invalid idempotency keys and quantities are rejected', async () => {
    const baseUrl = await startTestServer();
    const post = body => fetch(`${baseUrl}/api/create-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceId: 'tok', ...body }),
    });
    assert.equal((await post({ items: [{ productId: 1, quantity: 1 }], idempotencyKey: 'bad key!' })).status, 400);
    assert.equal((await post({ items: [{ productId: 1, quantity: 0 }] })).status, 400);
    assert.equal((await post({ items: [{ productId: 1, quantity: 1 }, { productId: 1, quantity: 1 }] })).status, 400);
});

test('payment amount comes from server-side catalog prices', async () => {
    let squareRequest;
    const baseUrl = await startTestServer(async request => {
        squareRequest = request;
        return { result: { payment: { id: 'payment-test-id', status: 'COMPLETED' } } };
    });

    const response = await fetch(`${baseUrl}/api/create-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            sourceId: 'square-card-token',
            items: [{ productId: 1, quantity: 2 }, { productId: 2, quantity: 1 }],
            amount: 0.01,
            currency: 'EUR',
        }),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
        success: true,
        subtotal: 20,
        tax: 1.65,
        total: 21.65,
        payment: { id: 'payment-test-id', status: 'COMPLETED' },
    });
    // $20.00 subtotal + 8.25% estimated tax
    assert.equal(squareRequest.amountMoney.amount, 2165n);
    assert.equal(squareRequest.amountMoney.currency, 'USD');
    assert.equal(squareRequest.locationId, 'test-location-id');
});

test('invalid carts are rejected without calling Square', async () => {
    let squareCalled = false;
    const baseUrl = await startTestServer(async () => {
        squareCalled = true;
        return { result: { payment: {} } };
    });

    const response = await fetch(`${baseUrl}/api/create-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            sourceId: 'square-card-token',
            items: [{ productId: 1000, quantity: 1 }],
        }),
    });

    assert.equal(response.status, 400);
    assert.equal(squareCalled, false);
});

test('Square payment failures return a clear checkout error', async () => {
    const baseUrl = await startTestServer(async () => {
        throw new Error('Square error detail');
    });

    const response = await fetch(`${baseUrl}/api/create-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            sourceId: 'square-card-token',
            items: [{ productId: 1, quantity: 1 }],
        }),
    });

    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), {
        error: 'Payment could not be completed. Check your card details or try another payment method.',
    });
});
