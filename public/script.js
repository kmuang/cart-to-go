const MAX_QUANTITY = 99;
const currencyFormat = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const formatCents = cents => currencyFormat.format(cents / 100);
const $ = id => document.getElementById(id);

const ICON_MINUS = '<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="10" height="2" fill="none" viewBox="0 0 10 2"><path fill="currentColor" d="M0 .375h10v1.25H0V.375Z"/></svg>';
const ICON_PLUS = '<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="10" height="10" fill="none" viewBox="0 0 10 10"><path fill="currentColor" d="M10 4.375H5.625V0h-1.25v4.375H0v1.25h4.375V10h1.25V5.625H10v-1.25Z"/></svg>';
const ICON_REMOVE = '<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="10" height="10" fill="none" viewBox="0 0 10 10"><path fill="currentColor" d="M8.375 9.375 5 6 1.625 9.375l-1-1L4 5 .625 1.625l1-1L5 4 8.375.625l1 1L6 5l3.375 3.375-1 1Z"/></svg>';

const productSection = $('product-section');
const productGrid = $('product-grid');
const photoCredits = $('photo-credits');
const photoCreditsList = $('photo-credits-list');
const cartSidebar = $('cart-sidebar');
const cartList = $('cart-list');
const cartCount = $('cart-count');
const cartEmptyState = $('cart-empty-state');
const cartItemsContainer = $('cart-items-container');
const confirmOrderBtn = $('confirm-order-btn');
const closeCartBtn = $('close-cart-btn');
const mobileCartBtn = $('mobile-cart-btn');
const cartLive = $('cart-live');

const paymentModal = $('payment-modal');
const paymentItems = $('payment-items');
const paymentStatus = $('payment-status');
const paymentStatusText = $('payment-status-text');
const paymentRetryBtn = $('payment-retry-btn');
const paymentError = $('payment-error');
const payBtn = $('pay-btn');
const payBtnLabel = $('pay-btn-label');
const paySpinner = payBtn.querySelector('.spinner');
const cancelPaymentBtn = $('cancel-payment-btn');

const confirmationModal = $('confirmation-modal');
const startNewOrderBtn = $('start-new-order-btn');

let products = [];
const productsById = new Map();
const cart = new Map(); // productId -> quantity
const cardRefs = new Map();
const cartRefs = new Map();
let taxRate = 0.0825; // replaced by the server's rate once /api/config loads

function h(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [name, value] of Object.entries(props)) {
        if (value === false || value === null || value === undefined) continue;
        if (name === 'class') node.className = value;
        else if (name === 'text') node.textContent = value;
        else node.setAttribute(name, value === true ? '' : value);
    }
    node.append(...children);
    return node;
}

function iconButton(props, svg) {
    const button = h('button', { type: 'button', ...props });
    button.innerHTML = svg;
    return button;
}

const userError = message => Object.assign(new Error(message), { userFacing: true });
const imageUrl = (product, width) => `/assets/products/${product.image}-${width}.webp`;

function announce(message) {
    cartLive.textContent = '';
    setTimeout(() => { cartLive.textContent = message; }, 50);
}

function bump(element) {
    element.classList.remove('bump');
    void element.offsetWidth;
    element.classList.add('bump');
    // animationend never fires under reduced motion or in background tabs, so clean up on a timer too
    clearTimeout(element.bumpTimer);
    element.bumpTimer = setTimeout(() => element.classList.remove('bump'), 700);
}

/* ---------- Pricing (integer cents; the server recalculates the charge) ---------- */

function getSubtotalCents() {
    let total = 0;
    for (const [id, quantity] of cart) total += productsById.get(id).priceCents * quantity;
    return total;
}
const getTaxCents = () => Math.round(getSubtotalCents() * taxRate);
const getTotalCents = () => getSubtotalCents() + getTaxCents();
const taxLabel = () => `Estimated tax (${+(taxRate * 100).toFixed(2)}%)`;

/* ---------- Products ---------- */

function createProductCard(product, index) {
    const eager = index < 3;
    const img = h('img', {
        class: 'product-img',
        src: imageUrl(product, 400),
        srcset: `${imageUrl(product, 400)} 400w, ${imageUrl(product, 800)} 800w`,
        sizes: '(min-width: 850px) 250px, (min-width: 520px) 45vw, 100vw',
        width: 400,
        height: 400,
        alt: '',
        decoding: 'async',
        loading: eager ? 'eager' : 'lazy',
        fetchpriority: eager ? 'high' : null,
    });
    const actions = h('div', { class: 'card-actions' });
    const imageContainer = h('div', { class: 'image-container loading' }, img, actions);

    const markLoaded = () => imageContainer.classList.remove('loading');
    img.addEventListener('load', markLoaded);
    img.addEventListener('error', () => {
        markLoaded();
        imageContainer.classList.add('image-error');
    });
    if (img.complete && img.naturalWidth) markLoaded();

    cardRefs.set(product.id, { img, actions });
    updateProductCard(product.id);

    return h('article', { class: 'product-card' },
        imageContainer,
        h('p', { class: 'product-category', text: product.category }),
        h('h2', { class: 'product-name', text: product.name }),
        h('p', { class: 'product-price', text: formatCents(product.priceCents) }));
}

function createAddButton(product) {
    const button = h('button', {
        class: 'add-to-cart-btn',
        type: 'button',
        'data-action': 'add',
        'data-id': product.id,
        'aria-label': `Add ${product.name} to cart`,
    }, h('img', { src: '/assets/icon-add-to-cart.svg', alt: '', width: 20, height: 20 }), 'Add to Cart');
    return button;
}

function createQuantityControls(product, quantity) {
    return h('div', { class: 'quantity-controls', role: 'group', 'aria-label': `Quantity of ${product.name}` },
        iconButton({ class: 'qty-btn', 'data-action': 'dec', 'data-id': product.id, 'aria-label': `Decrease quantity of ${product.name}` }, ICON_MINUS),
        h('span', { class: 'qty-val', text: quantity }),
        iconButton({ class: 'qty-btn', 'data-action': 'inc', 'data-id': product.id, 'aria-label': `Increase quantity of ${product.name}` }, ICON_PLUS));
}

// Touches only the affected card instead of rebuilding the whole grid.
function updateProductCard(id) {
    const ref = cardRefs.get(id);
    if (!ref) return;
    const product = productsById.get(id);
    const quantity = cart.get(id) || 0;
    ref.img.classList.toggle('selected', quantity > 0);

    const quantityLabel = ref.actions.querySelector('.qty-val');
    if (quantity > 0 && quantityLabel) {
        quantityLabel.textContent = quantity;
        return;
    }
    ref.actions.replaceChildren(quantity > 0 ? createQuantityControls(product, quantity) : createAddButton(product));
}

function renderProducts() {
    cardRefs.clear();
    productGrid.replaceChildren(...products.map(createProductCard));
    productGrid.setAttribute('aria-busy', 'false');
}

function renderProductsError() {
    const retry = h('button', { class: 'retry-btn', type: 'button', text: 'Try again' });
    retry.addEventListener('click', loadProducts);
    productGrid.replaceChildren(h('div', { class: 'products-error', role: 'alert' },
        h('p', { text: 'We could not load the menu right now.' }), retry));
    productGrid.setAttribute('aria-busy', 'false');
}

function safeLink(url, text) {
    if (typeof url !== 'string' || !url.startsWith('https://')) return document.createTextNode(text);
    return h('a', { href: url, target: '_blank', rel: 'noopener noreferrer', text });
}

function renderCredits() {
    const credited = products.filter(product => product.credit);
    photoCredits.hidden = credited.length === 0;
    photoCreditsList.replaceChildren(...credited.map(({ name, credit }) => {
        const title = String(credit.title || name).replace(/\.[^.]+$/, '');
        const item = h('li', {}, `${name}: `, safeLink(credit.source, `“${title}”`));
        item.append(` by ${credit.author || 'unknown author'} (${credit.license})`);
        return item;
    }));
}

async function loadProducts() {
    productGrid.setAttribute('aria-busy', 'true');
    try {
        const response = await fetch('/api/products');
        if (!response.ok) throw new Error(`Products request failed: ${response.status}`);
        products = await response.json();
        productsById.clear();
        products.forEach(product => productsById.set(product.id, product));
        renderProducts();
        renderCredits();
    } catch (error) {
        console.error('Failed to load products:', error);
        renderProductsError();
    }
}

/* ---------- Cart ---------- */

function createCartItem(product) {
    const qty = h('span', { class: 'item-qty' });
    const total = h('span', { class: 'item-price-total' });
    const li = h('li', { class: 'cart-item' },
        h('img', { src: imageUrl(product, 120), alt: '', width: 50, height: 50, class: 'cart-item-img', decoding: 'async' }),
        h('div', { class: 'cart-item-info' },
            h('h3', { text: product.name }),
            h('div', { class: 'cart-item-meta' }, qty, h('span', { class: 'item-price-each', text: `@ ${formatCents(product.priceCents)}` }), total)),
        iconButton({ class: 'remove-item-btn', 'data-action': 'remove', 'data-id': product.id, 'aria-label': `Remove ${product.name} from cart` }, ICON_REMOVE));
    return { li, qty, total };
}

function updateCartTotals() {
    $('cart-subtotal').textContent = formatCents(getSubtotalCents());
    $('cart-tax-label').textContent = taxLabel();
    $('cart-tax').textContent = formatCents(getTaxCents());
    $('cart-total').textContent = formatCents(getTotalCents());
    $('mobile-cart-total').textContent = formatCents(getTotalCents());
}

function updateCartUI(changedId) {
    const totalQuantity = [...cart.values()].reduce((sum, quantity) => sum + quantity, 0);
    const isEmpty = totalQuantity === 0;
    cartCount.textContent = totalQuantity;
    $('mobile-cart-count').textContent = totalQuantity;
    cartEmptyState.classList.toggle('hidden', !isEmpty);
    cartItemsContainer.classList.toggle('hidden', isEmpty);
    mobileCartBtn.hidden = isEmpty;

    for (const [id, ref] of cartRefs) {
        if (!cart.has(id)) {
            ref.li.remove();
            cartRefs.delete(id);
        }
    }
    for (const [id, quantity] of cart) {
        const product = productsById.get(id);
        let ref = cartRefs.get(id);
        if (!ref) {
            ref = createCartItem(product);
            cartRefs.set(id, ref);
            cartList.append(ref.li);
        }
        ref.qty.textContent = `${quantity}x`;
        ref.total.textContent = formatCents(product.priceCents * quantity);
    }

    updateCartTotals();
    if (changedId !== undefined) {
        bump(cartCount);
        const ref = cartRefs.get(changedId);
        if (ref) bump(ref.li);
    }
}

function handleCartAction(action, id, source) {
    const product = productsById.get(id);
    if (!product) return;
    const current = cart.get(id) || 0;

    if (action === 'add') {
        cart.set(id, 1);
        announce(`${product.name} added to cart`);
        warmUpPayments();
    } else if (action === 'inc') {
        cart.set(id, Math.min(current + 1, MAX_QUANTITY));
        announce(`${product.name}, quantity ${cart.get(id)}`);
    } else if (action === 'dec' && current > 1) {
        cart.set(id, current - 1);
        announce(`${product.name}, quantity ${current - 1}`);
    } else {
        cart.delete(id);
        announce(`${product.name} removed from cart`);
    }

    updateProductCard(id);
    updateCartUI(id);

    const actions = cardRefs.get(id).actions;
    if (source === 'grid') {
        (actions.querySelector('[data-action="inc"]') || actions.querySelector('[data-action="add"]'))?.focus();
    } else if (!cart.has(id)) {
        (cartList.querySelector('[data-action="remove"]') || closeCartBtn).focus();
    }
}

function onActionClick(source) {
    return event => {
        const button = event.target.closest('button[data-action]');
        if (button) handleCartAction(button.dataset.action, Number(button.dataset.id), source);
    };
}
productGrid.addEventListener('click', onActionClick('grid'));
cartList.addEventListener('click', onActionClick('cart'));

/* ---------- Mobile cart drawer ---------- */

const isDrawerOpen = () => cartSidebar.classList.contains('open');

function openCart() {
    cartSidebar.classList.add('open');
    mobileCartBtn.setAttribute('aria-expanded', 'true');
    productSection.inert = true;
    closeCartBtn.focus();
}

function closeCart({ restoreFocus = true } = {}) {
    cartSidebar.classList.remove('open');
    mobileCartBtn.setAttribute('aria-expanded', 'false');
    productSection.inert = false;
    if (restoreFocus) mobileCartBtn.focus();
}

mobileCartBtn.addEventListener('click', () => (isDrawerOpen() ? closeCart() : openCart()));
closeCartBtn.addEventListener('click', () => closeCart());
cartSidebar.addEventListener('click', event => {
    if (event.target === cartSidebar && isDrawerOpen()) closeCart();
});
document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && isDrawerOpen() && !document.querySelector('dialog[open]')) closeCart();
});
window.matchMedia('(min-width: 850px)').addEventListener('change', event => {
    if (event.matches && isDrawerOpen()) closeCart({ restoreFocus: false });
});

/* ---------- Square payments (loaded on demand) ---------- */

const squareState = { loading: false, promise: null, attachPromise: null, card: null, ready: false };
let configPromise = null;

function loadConfig() {
    configPromise ??= fetch('/api/config')
        .then(response => {
            if (!response.ok) throw userError('Could not load the payment configuration.');
            return response.json();
        })
        .then(config => {
            if (typeof config.taxRate === 'number' && config.taxRate >= 0 && config.taxRate < 1) {
                taxRate = config.taxRate;
                updateCartTotals();
            }
            return config;
        })
        .catch(error => {
            configPromise = null;
            throw error;
        });
    return configPromise;
}

function loadSquareSdk(url) {
    if (window.Square) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const script = h('script', { src: url, async: true });
        script.addEventListener('load', resolve);
        script.addEventListener('error', () => {
            script.remove();
            reject(userError('Square payment services could not be loaded. Check your connection and try again.'));
        });
        document.head.append(script);
    });
}

function updateConfirmButton() {
    confirmOrderBtn.disabled = squareState.loading;
    confirmOrderBtn.textContent = squareState.loading ? 'Loading secure payment form…' : 'Confirm Order';
}

async function createSquareCard() {
    const config = await loadConfig();
    if (!config.applicationId || !config.locationId) {
        throw userError('Square application ID or location ID is missing.');
    }
    await loadSquareSdk(config.sdkUrl);
    const payments = window.Square.payments(config.applicationId, config.locationId);
    squareState.card = await payments.card();
    return squareState.card;
}

function ensureSquareCard() {
    if (!squareState.promise) {
        squareState.loading = true;
        updateConfirmButton();
        squareState.promise = createSquareCard()
            .catch(error => {
                squareState.promise = null;
                throw error;
            })
            .finally(() => {
                squareState.loading = false;
                updateConfirmButton();
            });
    }
    return squareState.promise;
}

function attachSquareCard() {
    squareState.attachPromise ??= ensureSquareCard()
        .then(card => card.attach('#card-container'))
        .then(() => { squareState.ready = true; })
        .catch(error => {
            squareState.attachPromise = null;
            throw error;
        });
    return squareState.attachPromise;
}

// Starts loading the SDK as soon as the shopper shows intent, without blocking the page.
function warmUpPayments() {
    if (squareState.promise) return;
    ensureSquareCard().catch(error => console.error('Square payments warm-up failed:', error));
}

function setPaymentStatus(state, message) {
    paymentStatus.classList.toggle('hidden', state === 'ready');
    paymentStatus.classList.toggle('is-error', state === 'error');
    paymentStatus.querySelector('.spinner').classList.toggle('hidden', state !== 'loading');
    paymentRetryBtn.classList.toggle('hidden', state !== 'error');
    paymentStatusText.textContent = message || 'Loading secure payment form…';
}

function showPaymentError(message) {
    paymentError.textContent = message;
    paymentError.classList.remove('hidden');
}

async function preparePaymentForm() {
    paymentError.classList.add('hidden');
    if (squareState.ready) {
        setPaymentStatus('ready');
        setPayBusy(false);
        return;
    }
    setPaymentStatus('loading');
    payBtn.disabled = true;
    try {
        await attachSquareCard();
        setPaymentStatus('ready');
        setPayBusy(false);
    } catch (error) {
        console.error('Failed to initialize Square payments:', error);
        setPaymentStatus('error', error.userFacing
            ? error.message
            : 'Unable to load the secure card form. Please check the Square configuration and try again.');
    }
}

paymentRetryBtn.addEventListener('click', preparePaymentForm);

/* ---------- Checkout ---------- */

let isProcessing = false;
let pendingAttempt = null; // reused after a network failure so a retry cannot double-charge

function renderSummaryList(list) {
    list.replaceChildren(...[...cart].map(([id, quantity]) => {
        const product = productsById.get(id);
        return h('li', { class: 'summary-item' },
            h('img', { src: imageUrl(product, 120), alt: '', width: 50, height: 50, decoding: 'async' }),
            h('div', { class: 'summary-item-info' },
                h('h3', { class: 'summary-item-name', text: product.name }),
                h('div', { class: 'summary-item-meta' },
                    h('span', { class: 'item-qty', text: `${quantity}x` }),
                    h('span', { text: `@ ${formatCents(product.priceCents)}` }))),
            h('span', { class: 'summary-item-total', text: formatCents(product.priceCents * quantity) }));
    }));
}

function setPayBusy(busy) {
    payBtn.disabled = busy || !squareState.ready;
    payBtn.setAttribute('aria-busy', String(busy));
    paySpinner.classList.toggle('hidden', !busy);
    cancelPaymentBtn.disabled = busy;
    payBtnLabel.textContent = busy ? 'Processing…' : `Pay ${formatCents(getTotalCents())}`;
}

function openPayment() {
    renderSummaryList(paymentItems);
    $('payment-subtotal').textContent = formatCents(getSubtotalCents());
    $('payment-tax-label').textContent = taxLabel();
    $('payment-tax').textContent = formatCents(getTaxCents());
    $('payment-total').textContent = formatCents(getTotalCents());
    setPayBusy(false);
    paymentModal.showModal();
    preparePaymentForm();
}

async function submitPayment() {
    if (isProcessing || !squareState.card) return;
    isProcessing = true;
    setPayBusy(true);
    paymentError.classList.add('hidden');

    try {
        const items = [...cart].map(([productId, quantity]) => ({ productId, quantity }));
        const fingerprint = JSON.stringify(items);

        if (!pendingAttempt || pendingAttempt.fingerprint !== fingerprint) {
            const tokenResult = await squareState.card.tokenize();
            if (tokenResult.status !== 'OK') {
                throw userError(tokenResult.errors?.[0]?.message || 'Your card details could not be verified. Please check them and try again.');
            }
            pendingAttempt = { token: tokenResult.token, key: crypto.randomUUID(), fingerprint };
        }

        let response;
        try {
            response = await fetch('/api/create-payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sourceId: pendingAttempt.token, idempotencyKey: pendingAttempt.key, items }),
            });
        } catch {
            throw userError('Network error. Please check your connection and try again.');
        }

        const result = await response.json().catch(() => ({}));
        pendingAttempt = null;
        if (!response.ok || !result.success) {
            throw userError(result.error || 'Payment could not be completed. Please try again.');
        }
        showConfirmation(result);
    } catch (error) {
        console.error('Payment failed:', error);
        showPaymentError(error.userFacing ? error.message : 'Payment could not be completed. Please try again.');
    } finally {
        isProcessing = false;
        setPayBusy(false);
    }
}

function isSquareReceiptUrl(value) {
    try {
        const { protocol, hostname } = new URL(value);
        return protocol === 'https:' && /(^|\.)squareup(sandbox)?\.com$/.test(hostname);
    } catch {
        return false;
    }
}

function showConfirmation({ subtotal, tax, total, payment = {} }) {
    renderSummaryList($('modal-cart-list'));
    $('modal-subtotal').textContent = formatCents(Math.round(subtotal * 100));
    $('modal-tax-label').textContent = taxLabel();
    $('modal-tax').textContent = formatCents(Math.round(tax * 100));
    $('modal-total-price').textContent = formatCents(Math.round(total * 100));

    const receiptId = payment.receiptNumber || payment.id;
    $('receipt').classList.toggle('hidden', !receiptId);
    $('receipt-id').textContent = receiptId || '';
    const receiptLink = $('receipt-link');
    const hasReceiptLink = isSquareReceiptUrl(payment.receiptUrl);
    receiptLink.classList.toggle('hidden', !hasReceiptLink);
    if (hasReceiptLink) receiptLink.href = payment.receiptUrl;
    else receiptLink.removeAttribute('href');

    paymentModal.close();
    confirmationModal.showModal();
}

function resetOrder() {
    const ids = [...cart.keys()];
    cart.clear();
    pendingAttempt = null;
    ids.forEach(id => updateProductCard(id));
    updateCartUI();
    if (isDrawerOpen()) closeCart({ restoreFocus: false });
    productGrid.querySelector('.add-to-cart-btn')?.focus();
}

confirmOrderBtn.addEventListener('click', () => {
    if (cart.size > 0) openPayment();
});
payBtn.addEventListener('click', submitPayment);
cancelPaymentBtn.addEventListener('click', () => paymentModal.close());
paymentModal.addEventListener('cancel', event => {
    if (isProcessing) event.preventDefault();
});
startNewOrderBtn.addEventListener('click', () => confirmationModal.close());
// Covers Escape as well as the button: the order is already paid, so closing starts a new one.
confirmationModal.addEventListener('close', resetOrder);

/* ---------- Init ---------- */

updateConfirmButton();
updateCartUI();
loadProducts();
loadConfig().catch(error => console.error('Failed to load configuration:', error));
