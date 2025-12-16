const products = [
    {
        id: 1,
        name: "Waffle with Berries",
        category: "Waffle",
        price: 6.50,
        image: "./assets/image-waffle.jpg"
    },
    {
        id: 2,
        name: "Vanilla Bean Crème Brûlée",
        category: "Crème Brûlée",
        price: 7.00,
        image: "./assets/image-creme-brulee.jpg"
    },
    {
        id: 3,
        name: "Macaron Mix of Five",
        category: "Macaron",
        price: 8.00,
        image: "https://secure.auifinefoods.com/img/product/6331040000_1-B.jpg?fv=81452C79E8D25849E8D3DF9F04660637"
    },
    {
        id: 4,
        name: "Classic Tiramisu",
        category: "Tiramisu",
        price: 5.50,
        image: "https://butternutbakeryblog.com/wp-content/uploads/2024/05/classic-tiramisu.jpg"
    },
    {
        id: 5,
        name: "Pistachio Baklava",
        category: "Baklava",
        price: 4.00,
        image: "./assets/image-baklava.jpg"
    },
    {
        id: 6,
        name: "Lemon Meringue Pie",
        category: "Pie",
        price: 5.00,
        image: "https://www.barleyandsage.com/wp-content/uploads/2024/06/lemon-meringue-pie-1200x1200-1.jpg"
    },
    {
        id: 7,
        name: "Red Velvet Cake",
        category: "Cake",
        price: 4.50,
        image: "https://static01.nyt.com/images/2024/06/04/multimedia/Red-Velvet-Cake-twcf/Red-Velvet-Cake-twcf-mediumSquareAt3X.jpg"
    },
    {
        id: 8,
        name: "Salted Caramel Brownie",
        category: "Brownie",
        price: 5.50,
        image: "https://www.recipetineats.com/tachyon/2015/08/Salted-Caramel-Stuffed-Brownies_7a-SQ.jpg"
    },
];

let cart = {}; // Object to store cart items: { productId: quantity }

const productGrid = document.getElementById('product-grid');
const cartList = document.getElementById('cart-list');
const cartCount = document.getElementById('cart-count');
const cartTotal = document.getElementById('cart-total');
const cartEmptyState = document.getElementById('cart-empty-state');
const cartItemsContainer = document.getElementById('cart-items-container');
const confirmOrderBtn = document.getElementById('confirm-order-btn');
const modal = document.getElementById('confirmation-modal');
const startNewOrderBtn = document.getElementById('start-new-order-btn');
const modalCartList = document.getElementById('modal-cart-list');
const modalTotalPrice = document.getElementById('modal-total-price');

// Initialize App
function init() {
    renderProducts();
    updateCartUI();
}

function formatPrice(price) {
    return `$${price.toFixed(2)}`;
}

function renderProducts() {
    productGrid.innerHTML = '';
    products.forEach(product => {
        const qty = cart[product.id] || 0;
        const inCart = qty > 0;

        const card = document.createElement('div');
        card.className = 'product-card';

        let buttonHTML = '';
        if (inCart) {
            buttonHTML = `
                <div class="quantity-controls">
                    <button class="qty-btn" onclick="updateQuantity(${product.id}, -1)">
                        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="2" fill="none" viewBox="0 0 10 2"><path fill="currentColor" d="M0 .375h10v1.25H0V.375Z"/></svg>
                    </button>
                    <span class="qty-val">${qty}</span>
                    <button class="qty-btn" onclick="updateQuantity(${product.id}, 1)">
                        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" fill="none" viewBox="0 0 10 10"><path fill="currentColor" d="M10 4.375H5.625V0h-1.25v4.375H0v1.25h4.375V10h1.25V5.625H10v-1.25Z"/></svg>
                    </button>
                </div>
            `;
        } else {
            buttonHTML = `
                <button class="add-to-cart-btn" onclick="addToCart(${product.id})">
                    <img src="./assets/icon-add-to-cart.svg" alt="cart" />
                    Add to Cart
                </button>
            `;
        }

        card.innerHTML = `
            <div class="image-container">
                <img src="${product.image}" alt="${product.name}" class="product-img ${inCart ? 'selected' : ''}">
                ${buttonHTML}
            </div>
            <p class="product-category">${product.category}</p>
            <h3 class="product-name">${product.name}</h3>
            <p class="product-price">${formatPrice(product.price)}</p>
        `;
        productGrid.appendChild(card);
    });
}

window.addToCart = (id) => {
    cart[id] = 1;
    renderProducts();
    updateCartUI();
};

window.updateQuantity = (id, change) => {
    if (cart[id]) {
        cart[id] += change;
        if (cart[id] <= 0) {
            delete cart[id];
        }
    }
    renderProducts();
    updateCartUI();
};

window.removeFromCart = (id) => {
    delete cart[id];
    renderProducts();
    updateCartUI();
};

function updateCartUI() {
    const totalQty = Object.values(cart).reduce((a, b) => a + b, 0);
    cartCount.textContent = totalQty;

    if (totalQty === 0) {
        cartEmptyState.classList.remove('hidden');
        cartItemsContainer.classList.add('hidden');
    } else {
        cartEmptyState.classList.add('hidden');
        cartItemsContainer.classList.remove('hidden');

        // Render Cart Items
        cartList.innerHTML = '';
        let total = 0;

        Object.entries(cart).forEach(([id, qty]) => {
            const product = products.find(p => p.id == id);
            const itemTotal = product.price * qty;
            total += itemTotal;

            const li = document.createElement('li');
            li.className = 'cart-item';
            li.innerHTML = `
                <img src="${product.image}" alt="${product.name}" class="cart-item-img">
                <div class="cart-item-info">
                    <h4>${product.name}</h4>
                    <div class="cart-item-meta">
                        <span class="item-qty">${qty}x</span>
                        <span class="item-price-each">@ ${formatPrice(product.price)}</span>
                        <span class="item-price-total">${formatPrice(itemTotal)}</span>
                    </div>
                </div>
                <button class="remove-item-btn" onclick="removeFromCart(${product.id})">
                    <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" fill="none" viewBox="0 0 10 10"><path fill="currentColor" d="M8.375 9.375 5 6 1.625 9.375l-1-1L4 5 .625 1.625l1-1L5 4 8.375.625l1 1L6 5l3.375 3.375-1 1Z"/></svg>
                </button>
            `;
            cartList.appendChild(li);
        });

        cartTotal.textContent = formatPrice(total);
    }
}

confirmOrderBtn.addEventListener('click', () => {
    modal.classList.remove('hidden');
    renderOrderSummary();
});

startNewOrderBtn.addEventListener('click', () => {
    cart = {};
    modal.classList.add('hidden');
    renderProducts();
    updateCartUI();
});

function renderOrderSummary() {
    modalCartList.innerHTML = '';
    let total = 0;

    Object.entries(cart).forEach(([id, qty]) => {
        const product = products.find(p => p.id == id);
        const itemTotal = product.price * qty;
        total += itemTotal;

        const li = document.createElement('li');
        li.className = 'modal-item';
        li.innerHTML = `
            <img src="${product.image}" alt="${product.name}">
            <div class="modal-item-info">
                <h4 class="modal-item-name">${product.name}</h4>
                <div class="modal-item-qty-price">
                    <span class="modal-item-qty">${qty}x</span>
                    <span>@ ${formatPrice(product.price)}</span>
                </div>
            </div>
            <span class="modal-item-total">${formatPrice(itemTotal)}</span>
        `;
        modalCartList.appendChild(li);
    });

    modalTotalPrice.textContent = formatPrice(total);
}

init();
