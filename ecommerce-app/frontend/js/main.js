/* ShopKart frontend — vanilla ES6+. One file, page logic chosen by <body data-page="...">. */
(() => {
  'use strict';

  // ------------------------------------------------------------------ config & utils
  // Same-origin by default. If the frontend is hosted separately, set <meta name="api-base" content="https://your-api.com">.
  const API = (document.querySelector('meta[name="api-base"]')?.content || '').replace(/\/$/, '') + '/api';
  const PLACEHOLDER = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="100%" height="100%" fill="#f1f3f6"/><text x="50%" y="50%" fill="#9aa" font-family="Arial" font-size="20" text-anchor="middle">Image unavailable</text></svg>');
  const GROUPS = {
    'Clothing': ['mens-shirts', 'tops', 'womens-dresses', 'kids-wear'],
    'Footwear': ['mens-shoes', 'womens-shoes', 'sports-shoes'],
    'Fruits & Vegetables': ['fruits', 'vegetables', 'groceries'],
    'Makeup & Beauty': ['makeup', 'skin-care', 'fragrances'],
    'Electronics': ['smartphones', 'laptops', 'tablets', 'mobile-accessories'],
    'Accessories': ['mens-watches', 'womens-watches', 'womens-bags', 'womens-jewellery', 'sunglasses'],
    'Home & Living': ['furniture', 'home-decoration', 'kitchen-accessories', 'lighting'],
  };
  // Homepage shelves (Amazon-style rows). [title, categories]
  const SHELVES = [
    ['Fashion & clothing', ['mens-shirts', 'tops', 'womens-dresses', 'kids-wear']],
    ['Footwear for everyone', ['mens-shoes', 'womens-shoes', 'sports-shoes']],
    ['Fresh fruits', ['fruits']],
    ['Fresh vegetables', ['vegetables']],
    ['Makeup & beauty', ['makeup', 'skin-care', 'fragrances']],
    ['Electronics & gadgets', ['smartphones', 'laptops', 'tablets', 'mobile-accessories']],
    ['Home & living', ['furniture', 'home-decoration', 'lighting']],
  ];

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const fmt = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const titleCase = (slug) => slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const params = new URLSearchParams(location.search);

  const Auth = {
    get token() { return localStorage.getItem('sk_token'); },
    get user() { try { return JSON.parse(localStorage.getItem('sk_user')); } catch { return null; } },
    set(token, user) { localStorage.setItem('sk_token', token); localStorage.setItem('sk_user', JSON.stringify(user)); },
    clear() { localStorage.removeItem('sk_token'); localStorage.removeItem('sk_user'); },
  };

  const toast = (msg, isError = false) => {
    let wrap = $('.toast-wrap');
    if (!wrap) { wrap = document.createElement('div'); wrap.className = 'toast-wrap'; wrap.setAttribute('role', 'status'); document.body.append(wrap); }
    const t = document.createElement('div');
    t.className = 'toast' + (isError ? ' error' : '');
    t.textContent = msg;
    wrap.append(t);
    setTimeout(() => t.remove(), 3200);
  };

  const goLogin = () => { location.href = 'login.html?next=' + encodeURIComponent(location.pathname.split('/').pop() + location.search + location.hash); };

  /** fetch wrapper: JSON in/out, bearer token, friendly errors. */
  async function api(path, { method = 'GET', body, auth = true } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (auth && Auth.token) headers.Authorization = 'Bearer ' + Auth.token;
    let res;
    try {
      res = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    } catch {
      throw Object.assign(new Error('Cannot reach the server. Check your connection and try again.'), { status: 0 });
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401 && auth && Auth.token) { Auth.clear(); toast('Your session ended. Please log in again.', true); setTimeout(goLogin, 900); }
      throw Object.assign(new Error(data.error || 'Something went wrong. Please try again.'), { status: res.status });
    }
    return data;
  }

  // Broken image fallback (capture phase: img error events don't bubble)
  document.addEventListener('error', (e) => {
    if (e.target.tagName === 'IMG' && !e.target.dataset.fb) { e.target.dataset.fb = '1'; e.target.src = PLACEHOLDER; }
  }, true);

  // ------------------------------------------------------------------ shared: header, footer, cart badge
  let categoriesCache = null;
  const loadCategories = async () => (categoriesCache ??= await api('/categories', { auth: false }));

  function renderHeader() {
    const user = Auth.user && Auth.token ? Auth.user : null;
    $('#site-header').innerHTML = `
      <header class="site-header">
        <div class="container header-main">
          <a class="logo" href="index.html" aria-label="ShopKart home">Shop<span>Kart</span></a>
          <form class="search" id="search-form" role="search">
            <input id="search-input" type="search" placeholder="Search for products, brands and more" aria-label="Search products" value="${esc(params.get('q') || '')}">
            <button type="submit">Search</button>
          </form>
          <nav class="header-actions" aria-label="Account">
            ${user ? `<div class="account">
                <button class="linklike" aria-haspopup="true">Hi, ${esc(user.name.split(' ')[0])} ▾</button>
                <div class="account-menu"><a href="orders.html">My orders</a><button id="logout-btn">Log out</button></div>
              </div>` : '<a class="login-btn" href="login.html">Login</a>'}
            <a class="cart-link" href="cart.html">🛒 Cart <span class="badge" id="cart-badge">0</span></a>
          </nav>
        </div>
        <div class="catnav catnav-wrap" id="catnav"></div>
      </header>`;
    $('#search-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const q = $('#search-input').value.trim();
      location.href = 'index.html' + (q ? '?q=' + encodeURIComponent(q) : '');
    });
    $('#logout-btn')?.addEventListener('click', () => { Auth.clear(); toast('You have been logged out.'); setTimeout(() => (location.href = 'index.html'), 500); });
    renderCatNav();
    refreshCartBadge();
  }

  async function renderCatNav() {
    const nav = $('#catnav');
    let cats = [];
    try { cats = await loadCategories(); } catch { return; }
    const have = new Set(cats.map((c) => c.slug));
    const used = new Set();
    const groups = Object.entries(GROUPS).map(([name, slugs]) => {
      const present = slugs.filter((s) => have.has(s));
      present.forEach((s) => used.add(s));
      return [name, present];
    }).filter(([, s]) => s.length);
    const rest = cats.map((c) => c.slug).filter((s) => !used.has(s));
    if (rest.length) groups.push(['More', rest]);
    nav.innerHTML = '<div class="container">' + groups.map(([name, slugs]) => `
      <div class="cat-group">
        <a href="index.html?category=${slugs.join(',')}">${esc(name)}</a>
        <div class="mega"><div class="mega-inner"><strong>Shop ${esc(name)}</strong>
          ${slugs.map((s) => `<a href="index.html?category=${s}">${esc(titleCase(s))}</a>`).join('')}
        </div></div>
      </div>`).join('') + '</div>';
  }

  async function refreshCartBadge(cart) {
    const badge = $('#cart-badge');
    if (!badge) return;
    if (cart) { badge.textContent = cart.count; return; }
    if (!Auth.token) { badge.textContent = '0'; return; }
    try { badge.textContent = (await api('/cart')).count; } catch { /* badge stays at 0 */ }
  }

  function renderFooter() {
    const el = $('#site-footer');
    if (el) el.innerHTML = `<footer class="site-footer"><div class="container">
      <div><strong>ShopKart</strong><br>A demo marketplace. No real payments are processed.</div>
      <div>Free delivery on orders above ₹499 · 7-day easy returns · Cash on delivery</div></div></footer>`;
  }

  async function addToCart(productId, qty = 1) {
    if (!Auth.token) { toast('Log in to add items to your cart.'); setTimeout(goLogin, 700); return null; }
    try {
      const cart = await api('/cart', { method: 'POST', body: { product_id: productId, quantity: qty } });
      refreshCartBadge(cart);
      toast('Added to cart');
      return cart;
    } catch (e) { toast(e.message, true); return null; }
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-add]');
    if (btn) addToCart(Number(btn.dataset.add));
  });

  // ------------------------------------------------------------------ shared: product card
  const starBadge = (p) => p.rating
    ? `<span class="stars ${p.rating < 3.5 ? 'low' : ''}">${p.rating.toFixed(1)} ★</span> <span class="muted">(${Number(p.rating_count).toLocaleString('en-IN')})</span>` : '';
  const priceBlock = (p) => `<span class="price">${fmt(p.price)}</span>${p.mrp > p.price ? `<span class="mrp">${fmt(p.mrp)}</span><span class="off">${p.discount}% off</span>` : ''}`;

  function productCard(p) {
    const out = p.stock < 1;
    return `<article class="card">
      <a href="product.html?id=${p.id}" aria-label="${esc(p.title)}">
        <div class="card-img"><img loading="lazy" src="${esc(p.thumbnail)}" alt="${esc(p.title)}"></div>
        <div class="card-brand">${esc(p.brand)}</div>
        <div class="card-title">${esc(p.title)}</div>
      </a>
      <div>${starBadge(p)}</div>
      <div>${priceBlock(p)}</div>
      <div class="muted" style="font-size:12px">${p.price >= 499 ? 'Free delivery' : '+ ₹40 delivery'}</div>
      <button class="btn btn-cart btn-sm" data-add="${p.id}" ${out ? 'disabled' : ''}>${out ? 'Out of stock' : 'Add to cart'}</button>
    </article>`;
  }

  // ------------------------------------------------------------------ HOME
  function setupHero() {
    const track = $('.hero-track');
    const slides = $$('.hero-slide', track);
    const dots = $('.hero-dots');
    let i = 0, timer;
    dots.innerHTML = slides.map((_, n) => `<button aria-label="Go to slide ${n + 1}"></button>`).join('');
    const go = (n) => {
      i = (n + slides.length) % slides.length;
      track.style.transform = `translateX(-${i * 100}%)`;
      $$('button', dots).forEach((d, k) => d.classList.toggle('on', k === i));
    };
    const play = () => { if (!matchMedia('(prefers-reduced-motion: reduce)').matches) timer = setInterval(() => go(i + 1), 5000); };
    $('.hero-nav.prev').onclick = () => go(i - 1);
    $('.hero-nav.next').onclick = () => go(i + 1);
    $$('button', dots).forEach((d, k) => (d.onclick = () => go(k)));
    $('.hero').addEventListener('mouseenter', () => clearInterval(timer));
    $('.hero').addEventListener('mouseleave', play);
    go(0); play();
  }

  async function initHome() {
    const f = {
      q: params.get('q') || '', category: params.get('category') || '', sort: params.get('sort') || 'relevance',
      min_price: '', max_price: '', min_rating: '', page: 1,
    };
    const browsing = Boolean(f.q || f.category);
    if (browsing) $$('.home-only').forEach((el) => el.classList.add('hidden'));
    else setupHero();

    const grid = $('#grid'), more = $('#load-more'), count = $('#result-count');
    const catSelect = $('#f-category');

    let cats = [];
    try { cats = await loadCategories(); } catch { /* category UI is optional */ }
    $('#cat-strip').innerHTML = cats.slice(0, 24).map((c) => `<a class="cat-chip" href="index.html?category=${c.slug}"><img loading="lazy" src="${esc(c.image)}" alt=""><span>${esc(c.name)}</span></a>`).join('');
    catSelect.innerHTML = '<option value="">All categories</option>' + cats.map((c) => `<option value="${c.slug}">${esc(c.name)} (${c.count})</option>`).join('');
    if (f.category && !cats.some((c) => c.slug === f.category)) catSelect.insertAdjacentHTML('beforeend', `<option value="${esc(f.category)}">Selected group</option>`);
    catSelect.value = f.category;
    $('#f-sort').value = f.sort;

    // Deals carousel
    if (!browsing) {
      api('/products?sort=discount&per_page=12', { auth: false }).then((d) => {
        $('#deals-track').innerHTML = d.items.map(productCard).join('');
      }).catch(() => $('#deals').classList.add('hidden'));
      const track = $('#deals-track');
      $('#deals .prev').onclick = () => track.scrollBy({ left: -620, behavior: 'smooth' });
      $('#deals .next').onclick = () => track.scrollBy({ left: 620, behavior: 'smooth' });
    }

    if (!browsing) {
      const shelves = $('#shelves');
      SHELVES.forEach(([title, slugs], n) => {
        shelves.insertAdjacentHTML('beforeend', `<section class="panel shelf hidden" id="shelf-${n}" style="margin-top:12px">
          <h2 class="section-title"><span>${esc(title)}</span> <a class="btn btn-sm" href="index.html?category=${slugs.join(',')}">View all</a></h2>
          <div class="carousel"><button class="carousel-btn prev" data-scroll="-1" aria-label="Scroll left">‹</button><div class="carousel-track"></div><button class="carousel-btn next" data-scroll="1" aria-label="Scroll right">›</button></div></section>`);
        api(`/products?category=${slugs.join(',')}&per_page=12`, { auth: false }).then((d) => {
          if (!d.items.length) return;
          $(`#shelf-${n}`).classList.remove('hidden');
          $(`#shelf-${n} .carousel-track`).innerHTML = d.items.map(productCard).join('');
        }).catch(() => {});
      });
      shelves.addEventListener('click', (e) => {
        const b = e.target.closest('[data-scroll]');
        if (b) $('.carousel-track', b.parentElement).scrollBy({ left: 620 * Number(b.dataset.scroll), behavior: 'smooth' });
      });
    }

    async function load(reset) {
      if (reset) { f.page = 1; grid.innerHTML = '<div class="skeleton card"></div>'.repeat(8); more.classList.add('hidden'); }
      const qs = new URLSearchParams({ sort: f.sort, page: f.page, per_page: 20 });
      ['q', 'category', 'min_price', 'max_price', 'min_rating'].forEach((k) => f[k] && qs.set(k, f[k]));
      more.disabled = true;
      try {
        const d = await api('/products?' + qs, { auth: false });
        if (reset) grid.innerHTML = '';
        if (!d.total) {
          grid.innerHTML = `<div class="grid-empty"><h2>No products found</h2><p class="muted">Try a different keyword or loosen your filters.</p><button class="btn" id="clear-all">Clear filters</button></div>`;
          $('#clear-all').onclick = () => (location.href = 'index.html');
          count.textContent = '0 results';
        } else {
          grid.insertAdjacentHTML('beforeend', d.items.map(productCard).join(''));
          count.textContent = `${d.total} result${d.total > 1 ? 's' : ''}${f.q ? ` for “${f.q}”` : ''}`;
        }
        more.classList.toggle('hidden', d.page >= d.pages);
      } catch (e) {
        grid.innerHTML = `<div class="grid-empty"><h2>Couldn’t load products</h2><p class="muted">${esc(e.message)}</p><button class="btn" id="retry">Try again</button></div>`;
        $('#retry').onclick = () => load(true);
      } finally { more.disabled = false; }
    }

    $('#filters-form').addEventListener('submit', (e) => {
      e.preventDefault();
      f.category = catSelect.value;
      f.min_price = $('#f-min').value; f.max_price = $('#f-max').value; f.min_rating = $('#f-rating').value;
      if (f.min_price && f.max_price && Number(f.min_price) > Number(f.max_price)) { toast('Minimum price is higher than maximum price.', true); return; }
      load(true);
    });
    $('#f-clear').onclick = () => (location.href = 'index.html' + (f.q ? '?q=' + encodeURIComponent(f.q) : ''));
    $('#f-sort').onchange = (e) => { f.sort = e.target.value; load(true); };
    more.onclick = () => { f.page += 1; load(false); };
    load(true);
  }

  // ------------------------------------------------------------------ PRODUCT DETAILS
  async function initProduct() {
    const root = $('#pdp-root');
    const id = Number(params.get('id'));
    let p;
    try { p = await api('/products/' + id, { auth: false }); }
    catch (e) {
      root.innerHTML = `<div class="panel empty"><div class="icon">🔍</div><h2>${e.status === 404 || !id ? 'Product not found' : 'Couldn’t load this product'}</h2><p class="muted">${esc(e.message)}</p><a class="btn" href="index.html">Continue shopping</a></div>`;
      return;
    }
    document.title = `${p.title} — ShopKart`;
    let qty = 1;
    const maxQty = Math.min(10, p.stock);

    const specRows = Object.entries(p.specs).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('');
    const stockMsg = p.stock < 1 ? '<span style="color:var(--red)">Out of stock</span>'
      : p.stock <= 5 ? `<span style="color:var(--red)">Only ${p.stock} left — order soon</span>` : '<span style="color:var(--green)">In stock</span>';

    root.innerHTML = `
      <nav class="breadcrumb"><a href="index.html">Home</a> › <a href="index.html?category=${esc(p.category)}">${esc(titleCase(p.category))}</a> › ${esc(p.title)}</nav>
      <div class="pdp">
        <div class="panel gallery">
          <div class="thumbs">${p.images.map((src, n) => `<button class="${n ? '' : 'on'}" data-img="${esc(src)}" aria-label="View image ${n + 1}"><img src="${esc(src)}" alt=""></button>`).join('')}</div>
          <div class="zoom" id="zoom" role="img" aria-label="${esc(p.title)}" style="background-image:url('${esc(p.images[0])}')"></div>
        </div>
        <div class="stack">
          <div class="panel">
            <div class="muted">${esc(p.brand)}</div>
            <h1>${esc(p.title)}</h1>
            <div>${starBadge(p)}</div>
            <div class="big-price">${fmt(p.price)} ${p.mrp > p.price ? `<span class="mrp">${fmt(p.mrp)}</span><span class="off">${p.discount}% off</span>` : ''}</div>
            <div class="muted">Inclusive of all taxes · ${p.price >= 499 ? 'Free delivery' : '₹40 delivery'}</div>
            <p>${stockMsg}</p>
            ${p.stock > 0 ? `<div>Quantity: <span class="qty"><button id="q-dec" aria-label="Decrease quantity" disabled>−</button><span id="q-val">1</span><button id="q-inc" aria-label="Increase quantity" ${maxQty <= 1 ? 'disabled' : ''}>+</button></span></div>` : ''}
            <div class="cta-row">
              <button class="btn btn-cart" id="btn-add" ${p.stock < 1 ? 'disabled' : ''}>Add to cart</button>
              <button class="btn btn-buy" id="btn-buy" ${p.stock < 1 ? 'disabled' : ''}>Buy now</button>
            </div>
          </div>
          <div class="panel"><h2 class="section-title">About this item</h2><p>${esc(p.description)}</p></div>
          <div class="panel"><h2 class="section-title">Specifications</h2><table class="specs">${specRows}</table></div>
        </div>
      </div>
      <div class="panel" style="margin-top:12px" id="reviews-panel"></div>
      <section class="panel hidden" style="margin-top:12px" id="related"><h2 class="section-title">Similar products</h2><div class="carousel"><div class="carousel-track" id="related-track"></div></div></section>`;

    // Gallery: thumbnails + hover zoom
    const zoom = $('#zoom');
    $$('.thumbs button').forEach((b) => b.addEventListener('click', () => {
      $$('.thumbs button').forEach((x) => x.classList.toggle('on', x === b));
      zoom.style.backgroundImage = `url('${b.dataset.img}')`;
    }));
    zoom.addEventListener('mouseenter', () => zoom.classList.add('zooming'));
    zoom.addEventListener('mousemove', (e) => {
      const r = zoom.getBoundingClientRect();
      zoom.style.backgroundPosition = `${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`;
    });
    zoom.addEventListener('mouseleave', () => { zoom.classList.remove('zooming'); zoom.style.backgroundPosition = 'center'; });

    // Quantity + CTAs
    const syncQty = () => { $('#q-val').textContent = qty; $('#q-dec').disabled = qty <= 1; $('#q-inc').disabled = qty >= maxQty; };
    $('#q-dec')?.addEventListener('click', () => { qty = Math.max(1, qty - 1); syncQty(); });
    $('#q-inc')?.addEventListener('click', () => { qty = Math.min(maxQty, qty + 1); syncQty(); });
    $('#btn-add')?.addEventListener('click', () => addToCart(p.id, qty));
    $('#btn-buy')?.addEventListener('click', async () => { if (await addToCart(p.id, qty)) location.href = 'cart.html#checkout'; });

    // Reviews
    function renderReviews(prod) {
      const user = Auth.token ? Auth.user : null;
      $('#reviews-panel').innerHTML = `
        <h2 class="section-title">Ratings &amp; reviews</h2>
        <div style="margin-bottom:10px">${starBadge(prod) || '<span class="muted">No ratings yet</span>'}</div>
        ${prod.reviews.length ? prod.reviews.map((r) => `<div class="review"><span class="stars ${r.rating < 3 ? 'low' : ''}">${r.rating} ★</span> <strong>${esc(r.user_name)}</strong> <span class="muted">· ${esc(r.created_at)}</span><p style="margin:6px 0 0">${esc(r.comment)}</p></div>`).join('') : '<p class="muted">Be the first to review this product.</p>'}
        <hr style="border:0;border-top:1px solid var(--line);margin:16px 0">
        ${user ? `<form id="review-form"><strong>Write a review</strong>
            <div class="star-input" role="radiogroup" aria-label="Your rating">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-star="${n}" aria-label="${n} star${n > 1 ? 's' : ''}">★</button>`).join('')}</div>
            <div class="field"><textarea id="review-text" rows="3" maxlength="1000" placeholder="What did you like or dislike?"></textarea></div>
            <button class="btn btn-sm" type="submit">Submit review</button></form>`
          : `<p><a href="login.html?next=${encodeURIComponent('product.html?id=' + prod.id)}" style="color:var(--blue);font-weight:500">Log in</a> to write a review.</p>`}`;
      let stars = 0;
      $$('[data-star]').forEach((b) => b.addEventListener('click', () => {
        stars = Number(b.dataset.star);
        $$('[data-star]').forEach((x) => x.classList.toggle('on', Number(x.dataset.star) <= stars));
      }));
      $('#review-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!stars) { toast('Choose a star rating first.', true); return; }
        try {
          renderReviews(await api(`/products/${prod.id}/reviews`, { method: 'POST', body: { rating: stars, comment: $('#review-text').value } }));
          toast('Thanks for your review!');
        } catch (err) { toast(err.message, true); }
      });
    }
    renderReviews(p);

    // Related products
    api(`/products?category=${encodeURIComponent(p.category)}&per_page=9`, { auth: false }).then((d) => {
      const items = d.items.filter((x) => x.id !== p.id).slice(0, 8);
      if (!items.length) return;
      $('#related').classList.remove('hidden');
      $('#related-track').innerHTML = items.map(productCard).join('');
    }).catch(() => {});
  }

  // ------------------------------------------------------------------ CART + CHECKOUT
  async function initCart() {
    const root = $('#cart-root');
    if (!Auth.token) {
      root.innerHTML = `<div class="panel empty"><div class="icon">🔐</div><h2>Log in to see your cart</h2><p class="muted">Your cart is saved to your account.</p><a class="btn" href="login.html?next=cart.html">Login</a></div>`;
      return;
    }
    let cart;
    try { cart = await api('/cart'); }
    catch (e) { root.innerHTML = `<div class="panel empty"><h2>Couldn’t load your cart</h2><p class="muted">${esc(e.message)}</p><button class="btn" onclick="location.reload()">Try again</button></div>`; return; }

    const emptyState = () => {
      root.innerHTML = `<div class="panel empty"><div class="icon">🛒</div><h2>Your cart is empty</h2><p class="muted">Add items you like and they’ll show up here.</p><a class="btn" href="index.html">Continue shopping</a></div>`;
    };

    function renderLines() {
      $('#cart-list').innerHTML = `<h2 class="section-title">My cart (${cart.count})</h2>` + cart.items.map(({ product: p, quantity, line_total }) => `
        <div class="cart-row">
          <a href="product.html?id=${p.id}"><img src="${esc(p.thumbnail)}" alt="${esc(p.title)}"></a>
          <div>
            <a href="product.html?id=${p.id}"><strong>${esc(p.title)}</strong></a>
            <div class="muted">${esc(p.brand)}</div>
            <div>${priceBlock(p)}</div>
            <div class="cart-actions">
              <span class="qty"><button data-dec="${p.id}" aria-label="Decrease quantity of ${esc(p.title)}">−</button><span>${quantity}</span><button data-inc="${p.id}" aria-label="Increase quantity of ${esc(p.title)}" ${quantity >= Math.min(10, p.stock) ? 'disabled' : ''}>+</button></span>
              <button class="link-btn" data-remove="${p.id}">Remove</button>
            </div>
          </div>
          <div><strong>${fmt(line_total)}</strong></div>
        </div>`).join('');
      const checkingOut = !$('#checkout-panel').classList.contains('hidden');
      $('#summary').innerHTML = `
        <h3>Price details</h3>
        <div class="row"><span>Price (${cart.count} item${cart.count > 1 ? 's' : ''})</span><span>${fmt(cart.mrp_total)}</span></div>
        <div class="row"><span>Discount</span><span style="color:var(--green)">− ${fmt(cart.discount)}</span></div>
        <div class="row"><span>Delivery</span><span>${cart.delivery ? fmt(cart.delivery) : '<span style="color:var(--green)">Free</span>'}</span></div>
        <div class="row total"><span>Total</span><span>${fmt(cart.total)}</span></div>
        ${cart.discount ? `<p style="color:var(--green);font-weight:500">You’ll save ${fmt(cart.discount)} on this order</p>` : ''}
        ${checkingOut ? '<button class="btn btn-buy" style="width:100%" type="submit" form="checkout-form" id="place-btn">Place order</button>'
          : '<button class="btn btn-buy" style="width:100%" id="go-checkout">Proceed to checkout</button>'}`;
      $('#go-checkout')?.addEventListener('click', openCheckout);
      renderOrderLines();
    }

    function renderOrderLines() {
      $('#order-lines').innerHTML = cart.items.map(({ product: p, quantity, line_total }) => `<div class="order-line"><img src="${esc(p.thumbnail)}" alt=""><div style="flex:1">${esc(p.title)}<div class="muted">Qty ${quantity}</div></div><strong>${fmt(line_total)}</strong></div>`).join('');
    }

    function openCheckout() {
      $('#checkout-panel').classList.remove('hidden');
      $('#checkout-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
      renderLines();
    }

    root.innerHTML = `
      <div class="cart-layout">
        <div class="stack">
          <div class="panel" id="cart-list"></div>
          <div class="panel hidden" id="checkout-panel">
            <h2 class="section-title">Delivery address &amp; payment</h2>
            <div id="checkout-error" class="alert alert-error hidden" role="alert"></div>
            <form id="checkout-form" novalidate>
              <div class="form-grid">
                <div class="field"><label for="c-name">Full name</label><input id="c-name" required autocomplete="name"></div>
                <div class="field"><label for="c-phone">Mobile number</label><input id="c-phone" required inputmode="numeric" maxlength="10" autocomplete="tel" placeholder="10-digit number"></div>
                <div class="field full"><label for="c-address">Address (house no., street, area)</label><textarea id="c-address" rows="2" required autocomplete="street-address"></textarea></div>
                <div class="field"><label for="c-city">City</label><input id="c-city" required autocomplete="address-level2"></div>
                <div class="field"><label for="c-state">State</label><input id="c-state" required autocomplete="address-level1"></div>
                <div class="field"><label for="c-pin">Pincode</label><input id="c-pin" required inputmode="numeric" maxlength="6" autocomplete="postal-code" placeholder="6-digit pincode"></div>
              </div>
              <strong>Payment method</strong>
              <label class="pay-opt"><input type="radio" name="pay" value="COD" checked> Cash on delivery</label>
              <label class="pay-opt"><input type="radio" name="pay" value="UPI"> UPI (demo — no real payment)</label>
              <label class="pay-opt"><input type="radio" name="pay" value="CARD"> Credit / debit card (demo — no real payment)</label>
            </form>
            <h3 style="margin:18px 0 0">Order summary</h3><div id="order-lines"></div>
          </div>
        </div>
        <aside class="panel summary" id="summary"></aside>
      </div>`;
    if (Auth.user) $('#c-name').value = Auth.user.name;
    renderLines();
    if (location.hash === '#checkout') openCheckout();

    // Quantity / remove (event delegation)
    $('#cart-list').addEventListener('click', async (e) => {
      const t = e.target.closest('button');
      if (!t) return;
      const find = (pid) => cart.items.find((i) => i.product.id === Number(pid));
      try {
        if (t.dataset.inc) cart = await api('/cart/' + t.dataset.inc, { method: 'PUT', body: { quantity: find(t.dataset.inc).quantity + 1 } });
        else if (t.dataset.dec) cart = await api('/cart/' + t.dataset.dec, { method: 'PUT', body: { quantity: find(t.dataset.dec).quantity - 1 } });
        else if (t.dataset.remove) { cart = await api('/cart/' + t.dataset.remove, { method: 'DELETE' }); toast('Item removed'); }
        else return;
      } catch (err) { toast(err.message, true); return; }
      refreshCartBadge(cart);
      cart.items.length ? renderLines() : emptyState();
    });

    // Place order
    $('#checkout-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const errBox = $('#checkout-error');
      errBox.classList.add('hidden');
      const body = {
        full_name: $('#c-name').value, phone: $('#c-phone').value, address: $('#c-address').value,
        city: $('#c-city').value, state: $('#c-state').value, pincode: $('#c-pin').value,
        payment_method: $('input[name="pay"]:checked').value,
      };
      const btn = $('#place-btn');
      btn.disabled = true; btn.textContent = 'Placing order…';
      try {
        const order = await api('/orders', { method: 'POST', body });
        refreshCartBadge({ count: 0 });
        root.innerHTML = `<div class="panel success"><div class="tick">✓</div><h2>Order placed!</h2>
          <p>Thanks, ${esc(order.shipping.full_name)}. We’ll deliver to ${esc(order.shipping.city)} – ${esc(order.shipping.pincode)}.</p>
          <p class="muted">Your order ID</p><div class="order-id">${esc(order.order_number)}</div>
          <p>Total: <strong>${fmt(order.total)}</strong> · ${order.payment_method === 'COD' ? 'Pay on delivery' : 'Paid (demo)'}</p>
          <p><a class="btn" href="orders.html">View my orders</a> <a class="btn btn-ghost" href="index.html">Continue shopping</a></p></div>`;
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (err) {
        errBox.textContent = err.message; errBox.classList.remove('hidden');
        errBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
        btn.disabled = false; btn.textContent = 'Place order';
        if (err.status === 409) { try { cart = await api('/cart'); cart.items.length ? renderLines() : emptyState(); } catch { /* ignore */ } }
      }
    });
    if (!cart.items.length) emptyState();
  }

  // ------------------------------------------------------------------ ORDERS
  async function initOrders() {
    const root = $('#orders-root');
    if (!Auth.token) { goLogin(); return; }
    try {
      const orders = await api('/orders');
      if (!orders.length) {
        root.innerHTML = `<div class="panel empty"><div class="icon">📦</div><h2>No orders yet</h2><p class="muted">When you place an order, it will appear here.</p><a class="btn" href="index.html">Start shopping</a></div>`;
        return;
      }
      root.innerHTML = orders.map((o) => `<div class="panel order-card">
        <div class="order-head"><div><strong>${esc(o.order_number)}</strong><div class="muted">${esc(o.created_at)}</div></div>
          <div><span class="stars">${esc(o.status)}</span> <strong style="margin-left:8px">${fmt(o.total)}</strong></div></div>
        ${o.items.map((i) => `<div class="order-line"><img src="${esc(i.image)}" alt=""><div style="flex:1">${esc(i.title)}<div class="muted">Qty ${i.quantity} × ${fmt(i.price)}</div></div></div>`).join('')}
        <div class="muted">Ship to: ${esc(o.shipping.full_name)}, ${esc(o.shipping.address)}, ${esc(o.shipping.city)}, ${esc(o.shipping.state)} ${esc(o.shipping.pincode)}</div></div>`).join('');
    } catch (e) { root.innerHTML = `<div class="panel empty"><h2>Couldn’t load your orders</h2><p class="muted">${esc(e.message)}</p></div>`; }
  }

  // ------------------------------------------------------------------ LOGIN / REGISTER
  function initLogin() {
    const rawNext = params.get('next') || '';
    const next = /^[\w-]+\.html([?#][\w\-=&%.,#]*)?$/.test(rawNext) ? rawNext : 'index.html'; // block open redirects
    if (Auth.token) { location.replace(next); return; }
    const err = $('#auth-error');
    const show = (mode) => {
      $('#login-form').classList.toggle('hidden', mode !== 'login');
      $('#register-form').classList.toggle('hidden', mode !== 'register');
      $$('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
      err.classList.add('hidden');
    };
    $$('.tabs button').forEach((b) => b.addEventListener('click', () => show(b.dataset.mode)));
    if (location.hash === '#register') show('register');

    const submit = (form, path, bodyFn) => form.addEventListener('submit', async (e) => {
      e.preventDefault();
      err.classList.add('hidden');
      const btn = $('button[type="submit"]', form);
      btn.disabled = true;
      try {
        const data = await api(path, { method: 'POST', body: bodyFn(), auth: false });
        Auth.set(data.token, data.user);
        location.href = next;
      } catch (ex) { err.textContent = ex.message; err.classList.remove('hidden'); btn.disabled = false; }
    });
    submit($('#login-form'), '/auth/login', () => ({ email: $('#l-email').value, password: $('#l-pass').value }));
    submit($('#register-form'), '/auth/register', () => ({ name: $('#r-name').value, email: $('#r-email').value, password: $('#r-pass').value }));
  }

  // ------------------------------------------------------------------ boot
  document.addEventListener('DOMContentLoaded', () => {
    if (location.protocol === 'file:') {
      document.body.insertAdjacentHTML('afterbegin', '<div style="background:#fdecea;color:#b71c1c;padding:14px 18px;font-weight:500;text-align:center">This page was opened as a file, so products can’t load. Start the server (<code>python app.py</code> inside the backend folder) and open <b>http://localhost:5000</b> instead.</div>');
    }
    renderHeader();
    renderFooter();
    ({ home: initHome, product: initProduct, cart: initCart, orders: initOrders, login: initLogin })[document.body.dataset.page]?.();
  });
})();
