require('dotenv').config();
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet');
const { Client, Environment } = require('square');

const DEFAULT_TAX_RATE = 0.0825;
const PUBLIC_DIR = path.join(__dirname, 'public');
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9-]{8,45}$/;

const defaultProducts = require('./data/products.json');
const imageCredits = require('./data/image-credits.json');

function parseTaxRate(value) {
    const rate = value === undefined || value === '' ? DEFAULT_TAX_RATE : Number(value);
    return Number.isFinite(rate) && rate >= 0 && rate < 1 ? rate : DEFAULT_TAX_RATE;
}

function getSquareHosts(isProduction) {
    return isProduction
        ? { sdk: 'https://web.squarecdn.com', connect: 'https://pci-connect.squareup.com' }
        : { sdk: 'https://sandbox.web.squarecdn.com', connect: 'https://pci-connect.squareupsandbox.com' };
}

function createApp({
    squareClient,
    locationId = process.env.SQUARE_LOCATION_ID,
    applicationId = process.env.SQUARE_APPLICATION_ID,
    taxRate = parseTaxRate(process.env.TAX_RATE),
    products = defaultProducts,
    credits = imageCredits,
    isProduction = process.env.SQUARE_ENVIRONMENT === 'production',
} = {}) {
    const client = squareClient || new Client({
        accessToken: process.env.SQUARE_ACCESS_TOKEN,
        environment: isProduction ? Environment.Production : Environment.Sandbox,
    });
    const square = getSquareHosts(isProduction);
    const priceById = new Map(products.map(product => [product.id, product.priceCents]));

    const app = express();
    app.disable('x-powered-by');
    app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", square.sdk],
                styleSrc: ["'self'", "'unsafe-inline'", square.sdk, 'https://fonts.googleapis.com'],
                fontSrc: [
                    "'self'",
                    'https://fonts.gstatic.com',
                    'https://square-fonts-production-f.squarecdn.com',
                    'https://d1g145x70srn7h.cloudfront.net',
                    'https://cash-f.squarecdn.com',
                ],
                frameSrc: ["'self'", square.sdk],
                connectSrc: ["'self'", square.sdk, square.connect, 'https://o160250.ingest.sentry.io'],
                imgSrc: ["'self'", 'data:', square.sdk],
                objectSrc: ["'none'"],
                baseUri: ["'self'"],
                formAction: ["'self'"],
                // Browsers would upgrade localhost subresources to https and break local development.
                upgradeInsecureRequests: isProduction ? [] : null,
            },
        },
    }));
    app.use(compression());
    app.use(cors());
    app.use(express.json({ limit: '10kb' }));

    app.use('/assets', express.static(path.join(PUBLIC_DIR, 'assets'), { maxAge: '30d' }));
    app.use('/img', express.static(path.join(PUBLIC_DIR, 'img'), { maxAge: '30d' }));
    app.use(express.static(PUBLIC_DIR, { dotfiles: 'ignore' }));

    // Exposes only the public values the Web Payments SDK needs on the client.
    app.get('/api/config', (req, res) => {
        res.json({
            locationId,
            applicationId,
            taxRate,
            sdkUrl: `${square.sdk}/v1/square.js`,
        });
    });

    app.get('/api/products', (req, res) => {
        res.json(products.map(product => ({
            ...product,
            credit: credits[product.image] || null,
        })));
    });

    app.post('/api/create-payment', async (req, res) => {
        const { sourceId, items, idempotencyKey } = req.body || {};

        if (typeof sourceId !== 'string' || !sourceId.trim()
            || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'A valid payment token and cart are required.' });
        }
        if (idempotencyKey !== undefined && !IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
            return res.status(400).json({ error: 'The idempotency key is invalid.' });
        }

        const seenProductIds = new Set();
        let subtotalCents = 0;
        for (const item of items) {
            const { productId, quantity } = item || {};
            const priceCents = priceById.get(productId);
            if (!Number.isSafeInteger(productId) || priceCents === undefined
                || seenProductIds.has(productId)
                || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 99) {
                return res.status(400).json({ error: 'The cart contains an invalid item or quantity.' });
            }
            seenProductIds.add(productId);
            subtotalCents += priceCents * quantity;
        }
        const taxCents = Math.round(subtotalCents * taxRate);
        const amountCents = subtotalCents + taxCents;

        try {
            const response = await client.paymentsApi.createPayment({
                idempotencyKey: idempotencyKey || crypto.randomUUID(),
                sourceId,
                locationId,
                amountMoney: {
                    amount: BigInt(amountCents),
                    currency: 'USD',
                },
            });
            const payment = response.result?.payment;
            if (!payment) {
                throw new Error('Square did not return a payment.');
            }

            res.json({
                success: true,
                subtotal: subtotalCents / 100,
                tax: taxCents / 100,
                total: amountCents / 100,
                payment: Object.fromEntries(
                    ['id', 'status', 'receiptNumber', 'receiptUrl']
                        .filter(key => payment[key] !== undefined && payment[key] !== null)
                        .map(key => [key, payment[key]])
                ),
            });
        } catch (error) {
            console.error('Square payment failed:', error);
            res.status(502).json({ error: 'Payment could not be completed. Check your card details or try another payment method.' });
        }
    });

    return app;
}

if (require.main === module) {
    const PORT = process.env.PORT || 3001;
    createApp().listen(PORT, () => {
        console.log(`Square payment server running on http://localhost:${PORT}`);
    });
}

module.exports = { createApp, DEFAULT_TAX_RATE };
