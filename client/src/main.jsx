import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
    Search, UserRound, Heart, ShoppingBag, Menu, ChevronDown,
    ArrowRight, Truck, RotateCcw, ShieldCheck, ShieldAlert, Headphones, Star,
    Plus, Minus, X, SlidersHorizontal, LayoutDashboard, Package,
    ClipboardList, Users, Tags, Settings, LogOut, TrendingUp,
    Pencil, Trash2, Bell, CircleHelp, UserPlus, Activity, LockKeyhole, KeyRound, ChevronLeft, ChevronRight
} from 'lucide-react';
import './styles.css';
import './admin-delete.css';
import './mfa-security.css';
import './security-audit.css';
import './mobile-responsive.css';
import './product-gallery.css';
import './shopping-discovery.css';
import './product-search.css';

const API_BASE_URL = String(import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000').replace(/\/+$/, '');

const initialProducts = [
    { id: 1, name: 'Studio Wireless Headphones', category: 'Electronics', price: 2999, oldPrice: 3999, rating: 4.8, reviews: 128, image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=900&q=85', tag: 'BESTSELLER', description: 'Immersive sound, soft-touch comfort and a beautifully minimal finish.' },
    { id: 2, name: 'Everyday Runner Sneakers', category: 'Fashion', price: 3499, oldPrice: 4999, rating: 4.7, reviews: 94, image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=85', tag: '20% OFF', description: 'A versatile everyday sneaker made for long days and spontaneous plans.' },
    { id: 3, name: 'Arc Smart Watch', category: 'Electronics', price: 4499, oldPrice: 5499, rating: 4.6, reviews: 76, image: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=85', tag: 'POPULAR', description: 'A clean, considered design that keeps your day in rhythm.' },
    { id: 4, name: 'Everyday Carry Tote', category: 'Fashion', price: 2299, oldPrice: 2799, rating: 4.9, reviews: 61, image: 'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?auto=format&fit=crop&w=900&q=85', tag: 'NEW', description: 'A refined everyday carryall with space for all the essentials.' },
    { id: 5, name: 'Soft Glow Table Lamp', category: 'Home & Living', price: 1499, oldPrice: 1999, rating: 4.5, reviews: 48, image: 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=900&q=85', tag: 'DESIGN PICK', description: 'Warm ambient light for slower evenings and calmer spaces.' },
    { id: 6, name: 'Daily Ritual Skincare Set', category: 'Beauty', price: 1899, oldPrice: 2299, rating: 4.7, reviews: 83, image: 'https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?auto=format&fit=crop&w=900&q=85', tag: 'VALUE SET', description: 'A simple daily routine, thoughtfully put together.' },
    { id: 7, name: 'Move Training Dumbbells', category: 'Sports & Fitness', price: 1299, oldPrice: 1599, rating: 4.6, reviews: 37, image: 'https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?auto=format&fit=crop&w=900&q=85', tag: 'EVERYDAY ESSENTIAL', description: 'Compact, dependable training essentials for your home setup.' },
    { id: 8, name: 'Little Explorer Bear', category: 'Toys & Games', price: 899, oldPrice: 1199, rating: 4.9, reviews: 55, image: 'https://images.unsplash.com/photo-1559454403-b8fb88521f11?auto=format&fit=crop&w=900&q=85', tag: 'GIFT PICK', description: 'A soft companion for playtime, gifting and little adventures.' }
];

const categories = [
    { name: 'Electronics', icon: '⌁', image: 'https://images.unsplash.com/photo-1498049794561-7780e7231661?auto=format&fit=crop&w=700&q=80' },
    { name: 'Fashion', icon: '✳', image: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=700&q=80' },
    { name: 'Home & Living', icon: '⌂', image: 'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=700&q=80' },
    { name: 'Beauty', icon: '✧', image: 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=700&q=80' },
    { name: 'Sports & Fitness', icon: '↗', image: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=700&q=80' },
    { name: 'Toys & Games', icon: '♡', image: 'https://images.unsplash.com/photo-1559454403-b8fb88521f11?auto=format&fit=crop&w=700&q=80' }
];

const money = n => '₹' + Number(n).toLocaleString('en-IN');

function normalizeProductSearch(value) {
    return String(value ?? '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim();
}

function scoreProductSearch(product, rawQuery) {
    const terms = normalizeProductSearch(rawQuery).split(/\s+/).filter(Boolean);
    if (!terms.length) return 0;

    const name = normalizeProductSearch(product.name);
    const category = normalizeProductSearch(product.category);
    const tag = normalizeProductSearch(product.tag);
    const description = normalizeProductSearch(product.description);
    const searchable = `${name} ${category} ${tag} ${description}`;

    // Every query word must match somewhere, so multi-word searches are useful
    // even when the customer enters the words in a different order.
    if (!terms.every(term => searchable.includes(term))) return -1;

    return terms.reduce((score, term) => {
        if (name === term) return score + 120;
        if (name.startsWith(term)) return score + 90;
        if (name.includes(term)) return score + 65;
        if (category.includes(term)) return score + 38;
        if (tag.includes(term)) return score + 28;
        return score + 12;
    }, 0);
}

// First-time visitors see the NOVA story before entering the storefront.
function getPublicEntryView() {
    try {
        return window.localStorage.getItem('nova_market_intro_explored') === 'true'
            ? 'storefront'
            : 'about';
    } catch {
        return 'about';
    }
}

function ProductCard({ product, onAdd, onOpen, favorite, onFavorite }) {
    return (
        <article className="product-card" data-store-reveal>
            <button
                type="button"
                className={'favorite ' + (favorite ? 'is-favorite' : '')}
                onClick={() => onFavorite(String(product.id))}
                aria-label={favorite ? `Remove ${product.name} from wishlist` : `Add ${product.name} to wishlist`}
                aria-pressed={favorite}
                title={favorite ? 'Remove from wishlist' : 'Add to wishlist'}
            >
                <Heart size={17} fill={favorite ? 'currentColor' : 'none'} />
            </button>

            {product.tag && <span className="product-tag">{product.tag}</span>}

            <button className="product-image" onClick={() => onOpen(product)}>
                <img src={product.image || 'https://placehold.co/900x900?text=NOVA+Product'} alt={product.name} loading="lazy" decoding="async" />
            </button>

            <div className="product-info">
                <span className="eyebrow muted">{product.category}</span>
                <button className="product-name" onClick={() => onOpen(product)}>
                    {product.name}
                </button>

                <div className="rating">
                    <Star size={13} fill="currentColor" />
                    <b>{product.rating}</b>
                    <span>({product.reviews})</span>
                </div>

                <div className="price-row">
                    <strong>{money(product.price)}</strong>
                    {product.oldPrice > product.price && <del>{money(product.oldPrice)}</del>}
                </div>

                <button className="add-button" onClick={() => onAdd(product)}>
                    <Plus size={15} /> Add to bag
                </button>
            </div>
        </article>
    );
}

function Header({
    query, setQuery, products = [], onSelectProduct, onSearchSubmit,
    cartCount, wishlistCount, onWishlist, onCart, onAccount, onAbout,
    activeCategory, setActiveCategory, onCategorySelect
}) {
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);
    const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
    const searchContainerRef = useRef(null);
    const searchInputRef = useRef(null);
    const closeMobileNav = () => setMobileNavOpen(false);

    const searchMatches = useMemo(() => {
        const cleanQuery = String(query || '').trim();
        if (!cleanQuery) return [];
        return products
            .map(product => ({ product, score: scoreProductSearch(product, cleanQuery) }))
            .filter(item => item.score >= 0)
            .sort((a, b) => b.score - a.score || Number(b.product.rating || 0) - Number(a.product.rating || 0) || Number(b.product.reviews || 0) - Number(a.product.reviews || 0))
            .map(item => item.product);
    }, [products, query]);

    const suggestions = searchMatches.slice(0, 6);

    useEffect(() => {
        const handleOutsidePointer = event => {
            if (!searchContainerRef.current?.contains(event.target)) {
                setSearchOpen(false);
                setActiveSuggestionIndex(-1);
            }
        };
        document.addEventListener('pointerdown', handleOutsidePointer);
        return () => document.removeEventListener('pointerdown', handleOutsidePointer);
    }, []);

    useEffect(() => {
        setActiveSuggestionIndex(-1);
    }, [query]);

    const updateSearch = value => {
        setQuery(value);
        if (String(value).trim()) setActiveCategory('All');
        setActiveSuggestionIndex(-1);
        setSearchOpen(true);
    };

    const submitSearch = () => {
        closeMobileNav();
        setSearchOpen(false);
        setActiveSuggestionIndex(-1);
        setActiveCategory('All');
        onSearchSubmit?.();
    };

    const chooseProduct = product => {
        setQuery(product.name || '');
        setActiveCategory('All');
        setSearchOpen(false);
        setActiveSuggestionIndex(-1);
        closeMobileNav();
        onSelectProduct?.(product);
    };

    const handleSearchKeyDown = event => {
        if (event.key === 'Escape') {
            setSearchOpen(false);
            setActiveSuggestionIndex(-1);
            searchInputRef.current?.blur();
            return;
        }
        if (event.key === 'ArrowDown') {
            if (!searchOpen) setSearchOpen(true);
            if (suggestions.length) {
                event.preventDefault();
                setActiveSuggestionIndex(index => index < suggestions.length - 1 ? index + 1 : 0);
            }
            return;
        }
        if (event.key === 'ArrowUp' && suggestions.length) {
            event.preventDefault();
            setActiveSuggestionIndex(index => index > 0 ? index - 1 : suggestions.length - 1);
            return;
        }
        if (event.key === 'Enter') {
            event.preventDefault();
            if (activeSuggestionIndex >= 0 && suggestions[activeSuggestionIndex]) {
                chooseProduct(suggestions[activeSuggestionIndex]);
            } else if (String(query || '').trim()) {
                submitSearch();
            }
        }
    };

    const clearSearch = () => {
        setQuery('');
        setActiveCategory('All');
        setActiveSuggestionIndex(-1);
        setSearchOpen(true);
        searchInputRef.current?.focus();
    };

    const chooseCategory = category => {
        setSearchOpen(false);
        setActiveSuggestionIndex(-1);
        closeMobileNav();
        onCategorySelect(category);
    };

    return (
        <header className="site-header">
            <div className="topbar">
                <button
                    type="button"
                    className="mobile-menu icon-button"
                    aria-label={mobileNavOpen ? 'Close navigation menu' : 'Open navigation menu'}
                    aria-expanded={mobileNavOpen}
                    aria-controls="nova-main-navigation"
                    onClick={() => setMobileNavOpen(open => !open)}
                >
                    {mobileNavOpen ? <X /> : <Menu />}
                </button>

                <button
                    type="button"
                    className="wordmark"
                    onClick={() => {
                        closeMobileNav();
                        setQuery('');
                        setActiveCategory('All');
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                >
                    NOVA<span>.</span>
                </button>

                <form
                    className="searchbox searchbox-enhanced"
                    role="search"
                    ref={searchContainerRef}
                    onSubmit={event => { event.preventDefault(); submitSearch(); }}
                >
                    <Search size={17} aria-hidden="true" />
                    <input
                        ref={searchInputRef}
                        value={query}
                        onChange={event => updateSearch(event.target.value)}
                        onFocus={() => setSearchOpen(true)}
                        onKeyDown={handleSearchKeyDown}
                        placeholder="Search products, categories and more..."
                        aria-label="Search NOVA products"
                        aria-autocomplete="list"
                        aria-expanded={searchOpen}
                        aria-controls="nova-product-search-results"
                        aria-activedescendant={activeSuggestionIndex >= 0 ? `nova-search-option-${activeSuggestionIndex}` : undefined}
                        autoComplete="off"
                        spellCheck="false"
                    />
                    {query ? (
                        <button type="button" className="product-search-clear" onClick={clearSearch} aria-label="Clear product search" title="Clear search">
                            <X size={15} />
                        </button>
                    ) : (
                        <kbd aria-hidden="true">↵</kbd>
                    )}

                    {searchOpen && (
                        <div className="product-search-dropdown" id="nova-product-search-results">
                            {String(query || '').trim() ? (
                                <>
                                    <div className="product-search-heading">
                                        <span>PRODUCT MATCHES</span>
                                        <small>{searchMatches.length} {searchMatches.length === 1 ? 'result' : 'results'}</small>
                                    </div>
                                    {suggestions.length ? (
                                        <div className="product-search-list" role="listbox" aria-label="Matching products">
                                            {suggestions.map((product, index) => (
                                                <button
                                                    type="button"
                                                    role="option"
                                                    id={`nova-search-option-${index}`}
                                                    aria-selected={activeSuggestionIndex === index}
                                                    className={`product-search-option${activeSuggestionIndex === index ? ' is-active' : ''}`}
                                                    key={product.id}
                                                    onMouseEnter={() => setActiveSuggestionIndex(index)}
                                                    onClick={() => chooseProduct(product)}
                                                >
                                                    <img src={product.image || 'https://placehold.co/96x96?text=NOVA'} alt="" loading="lazy" />
                                                    <span className="product-search-option-copy">
                                                        <strong>{product.name}</strong>
                                                        <small>{product.category}{product.tag ? ` · ${product.tag}` : ''}</small>
                                                    </span>
                                                    <b className="product-search-price">{money(product.price)}</b>
                                                </button>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="product-search-empty">
                                            <Search size={20} />
                                            <strong>No products found</strong>
                                            <span>Try another product name, category or keyword.</span>
                                        </div>
                                    )}
                                    <div className="product-search-footer">
                                        <span>{searchMatches.length > 6 ? `Showing 6 of ${searchMatches.length} matches` : 'Search across names, categories, tags and descriptions'}</span>
                                        <button type="submit" disabled={!searchMatches.length}>View all results <ArrowRight size={14} /></button>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="product-search-heading">
                                        <span>EXPLORE NOVA</span>
                                        <small>Popular categories</small>
                                    </div>
                                    <div className="product-search-categories">
                                        {categories.map(category => (
                                            <button type="button" key={category.name} onClick={() => chooseCategory(category.name)}>
                                                <span>{category.icon}</span>{category.name}<ArrowRight size={12} />
                                            </button>
                                        ))}
                                    </div>
                                    <div className="product-search-footer product-search-hint">
                                        <span>Tip: search by product, category or a feature</span>
                                        <kbd>ESC</kbd>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </form>

                <div className="header-actions">
                    <button
                        type="button"
                        className={'icon-button wishlist-header-button' + (wishlistCount > 0 ? ' has-saved' : '')}
                        title={`Wishlist${wishlistCount ? ` (${wishlistCount})` : ''}`}
                        aria-label={`Open wishlist, ${wishlistCount} saved ${wishlistCount === 1 ? 'product' : 'products'}`}
                        onClick={() => { closeMobileNav(); onWishlist(); }}
                    >
                        <Heart fill={wishlistCount > 0 ? 'currentColor' : 'none'} />
                        {wishlistCount > 0 && <span className="count">{wishlistCount > 99 ? '99+' : wishlistCount}</span>}
                    </button>

                    <button
                        type="button"
                        className="icon-button"
                        title="Account"
                        onClick={() => { closeMobileNav(); onAccount(); }}
                    >
                        <UserRound />
                    </button>

                    <button
                        type="button"
                        className="icon-button bag-action"
                        onClick={() => { closeMobileNav(); onCart(); }}
                        title="Shopping bag"
                    >
                        <ShoppingBag />
                        <span className="count">{cartCount}</span>
                    </button>
                </div>
            </div>

            <nav id="nova-main-navigation" className={'main-nav ' + (mobileNavOpen ? 'is-open' : '')} aria-label="Product categories">
                <button
                    className={activeCategory === 'All' ? 'nav-active' : ''}
                    onClick={() => { closeMobileNav(); onCategorySelect('All'); }}
                >
                    All products
                </button>

                {categories.map(c => (
                    <button
                        key={c.name}
                        className={activeCategory === c.name ? 'nav-active' : ''}
                        onClick={() => { closeMobileNav(); onCategorySelect(c.name); }}
                    >
                        {c.name}
                    </button>
                ))}

                <button className="about-nav-link" onClick={() => { closeMobileNav(); onAbout(); }}>Our story</button>

                <button
                    className="offers-link"
                    onClick={() => { closeMobileNav(); onCategorySelect('Offers'); }}
                >
                    Offers <span>✦</span>
                </button>
            </nav>
        </header>
    );
}

function CartDrawer({ cart, onClose, onChangeQty, onCheckout }) {
    const total = cart.reduce((s, p) => s + p.price * p.qty, 0);

    return (
        <div className="overlay" onClick={onClose}>
            <aside className="cart-drawer" onClick={e => e.stopPropagation()}>
                <div className="drawer-head">
                    <div>
                        <span className="eyebrow">YOUR SELECTION</span>
                        <h2>
                            Your bag <span className="muted">({cart.reduce((s, p) => s + p.qty, 0)})</span>
                        </h2>
                    </div>
                    <button className="icon-button" onClick={onClose}>
                        <X />
                    </button>
                </div>

                {cart.length === 0 ? (
                    <div className="empty-cart">
                        <ShoppingBag size={42} />
                        <h3>Your bag is waiting</h3>
                        <p>Find something that makes your everyday better.</p>
                        <button className="button button-dark" onClick={onClose}>
                            Explore products <ArrowRight size={16} />
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="cart-items">
                            {cart.map(p => (
                                <div className="cart-item" key={p.id}>
                                    <img src={p.image} alt="" />

                                    <div className="cart-item-info">
                                        <b>{p.name}</b>
                                        <span>{money(p.price)}</span>

                                        <div className="qty-control">
                                            <button onClick={() => onChangeQty(p.id, -1)}>
                                                <Minus size={13} />
                                            </button>
                                            <span>{p.qty}</span>
                                            <button onClick={() => onChangeQty(p.id, 1)}>
                                                <Plus size={13} />
                                            </button>
                                        </div>
                                    </div>

                                    <button
                                        className="remove-item"
                                        onClick={() => onChangeQty(p.id, -p.qty)}
                                    >
                                        <X size={15} />
                                    </button>
                                </div>
                            ))}
                        </div>

                        <div className="cart-summary">
                            <div className="summary-line">
                                <span>Subtotal</span>
                                <b>{money(total)}</b>
                            </div>
                            <p>Shipping and taxes calculated at checkout.</p>

                            <button className="button button-gold full" onClick={onCheckout}>
                                Continue to checkout <ArrowRight size={16} />
                            </button>

                            <button className="text-button full" onClick={onClose}>
                                Continue shopping
                            </button>
                        </div>
                    </>
                )}
            </aside>
        </div>
    );
}


function WishlistDrawer({ products, onClose, onRemove, onAdd }) {
    return (
        <div className="overlay wishlist-overlay" onClick={onClose}>
            <aside className="cart-drawer wishlist-drawer" onClick={event => event.stopPropagation()} aria-label="Your wishlist">
                <div className="drawer-head">
                    <div>
                        <span className="eyebrow gold-text">YOUR SAVED FINDS</span>
                        <h2>Wishlist <span className="muted">({products.length})</span></h2>
                    </div>
                    <button type="button" className="icon-button" onClick={onClose} aria-label="Close wishlist">
                        <X />
                    </button>
                </div>

                {products.length === 0 ? (
                    <div className="empty-cart wishlist-empty">
                        <Heart size={42} />
                        <h3>Your wishlist is waiting</h3>
                        <p>Save the pieces you love and they will be kept here for your next visit.</p>
                        <button type="button" className="button button-dark" onClick={onClose}>
                            Explore products <ArrowRight size={16} />
                        </button>
                    </div>
                ) : (
                    <div className="wishlist-items">
                        {products.map(product => (
                            <article className="wishlist-item" key={String(product.id)}>
                                <img
                                    src={product.image || 'https://placehold.co/300x300?text=NOVA'}
                                    alt={product.name}
                                    loading="lazy"
                                    decoding="async"
                                />
                                <div className="wishlist-item-copy">
                                    <span className="eyebrow muted">{product.category}</span>
                                    <b>{product.name}</b>
                                    <strong>{money(product.price)}</strong>
                                    <div className="wishlist-item-actions">
                                        <button type="button" className="button button-dark" onClick={() => onAdd(product)}>
                                            Add to bag <ShoppingBag size={14} />
                                        </button>
                                        <button type="button" className="wishlist-remove" onClick={() => onRemove(product.id)}>
                                            <X size={14} /> Remove
                                        </button>
                                    </div>
                                </div>
                            </article>
                        ))}
                    </div>
                )}
            </aside>
        </div>
    );
}

function CheckoutModal({ cart, account, onClose, onPlaceOrder }) {
    const [form, setForm] = useState({
        recipientName: account?.fullName || '',
        phone: '',
        addressLine1: '',
        addressLine2: '',
        city: '',
        state: '',
        postalCode: ''
    });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    const subtotal = cart.reduce((sum, item) => sum + Number(item.price) * item.qty, 0);
    const shipping = subtotal <= 999 ? 49 : 0;
    const total = subtotal + shipping;

    async function handleSubmit(event) {
        event.preventDefault();
        setError('');
        setSubmitting(true);
        try {
            await onPlaceOrder(form);
        } catch (err) {
            setError(err.message || 'Unable to place your order. Please try again.');
        } finally {
            setSubmitting(false);
        }
    }

    function updateField(event) {
        const { name, value } = event.target;
        setForm(current => ({ ...current, [name]: value }));
    }

    return (
        <div className="overlay checkout-overlay" onClick={onClose}>
            <section className="checkout-modal" onClick={event => event.stopPropagation()}>
                <div className="drawer-head checkout-heading">
                    <div>
                        <span className="eyebrow gold-text">NOVA SECURE CHECKOUT</span>
                        <h2>Delivery details</h2>
                        <p className="muted">Signed in as {account?.email}</p>
                    </div>
                    <button type="button" className="icon-button" onClick={onClose} aria-label="Close checkout">
                        <X />
                    </button>
                </div>

                <form className="checkout-form" onSubmit={handleSubmit}>
                    <div className="checkout-fields">
                        <label>
                            Recipient name
                            <input name="recipientName" value={form.recipientName} onChange={updateField} minLength="2" maxLength="100" required />
                        </label>
                        <label>
                            Mobile number
                            <input name="phone" type="tel" inputMode="numeric" pattern="[6-9][0-9]{9}" maxLength="10" placeholder="10-digit mobile number" value={form.phone} onChange={updateField} required />
                        </label>
                        <label className="checkout-wide">
                            Address line 1
                            <input name="addressLine1" value={form.addressLine1} onChange={updateField} minLength="5" maxLength="200" placeholder="House / flat, street, area" required />
                        </label>
                        <label className="checkout-wide">
                            Address line 2 (optional)
                            <input name="addressLine2" value={form.addressLine2} onChange={updateField} maxLength="200" placeholder="Landmark, apartment, etc." />
                        </label>
                        <label>
                            City
                            <input name="city" value={form.city} onChange={updateField} minLength="2" maxLength="80" required />
                        </label>
                        <label>
                            State
                            <input name="state" value={form.state} onChange={updateField} minLength="2" maxLength="80" required />
                        </label>
                        <label>
                            PIN code
                            <input name="postalCode" inputMode="numeric" pattern="[0-9]{6}" maxLength="6" placeholder="6-digit PIN code" value={form.postalCode} onChange={updateField} required />
                        </label>
                    </div>

                    <section className="checkout-summary">
                        <h3>Order summary</h3>
                        {cart.map(item => (
                            <div className="checkout-item" key={item.id}>
                                <span>{item.name} × {item.qty}</span>
                                <b>{money(Number(item.price) * item.qty)}</b>
                            </div>
                        ))}
                        <div className="checkout-total-line"><span>Subtotal</span><b>{money(subtotal)}</b></div>
                        <div className="checkout-total-line"><span>Delivery</span><b>{shipping === 0 ? 'FREE' : money(shipping)}</b></div>
                        <div className="checkout-grand-total"><span>Total payable</span><strong>{money(total)}</strong></div>
                        <div className="cod-note">
                            <ShieldCheck size={17} />
                            <span><b>Cash on Delivery</b><small>Pay when your order arrives. Online payment is not enabled yet.</small></span>
                        </div>
                    </section>

                    {error && <p className="login-error checkout-error" role="alert">{error}</p>}

                    <div className="checkout-actions">
                        <button type="button" className="button button-light" onClick={onClose} disabled={submitting}>Back</button>
                        <button type="submit" className="button button-gold" disabled={submitting || cart.length === 0}>
                            {submitting ? 'Placing order…' : 'Place order · ' + money(total)}
                        </button>
                    </div>
                </form>
            </section>
        </div>
    );
}

function ProductModal({ product, onClose, onAdd, isFavorite, onFavorite }) {
    const [activeImageIndex, setActiveImageIndex] = useState(0);
    const touchStartX = useRef(null);
    const overlayRef = useRef(null);
    const closeHandlerRef = useRef(onClose);
    closeHandlerRef.current = onClose;

    const galleryImages = [...new Set([
        product?.image,
        ...(Array.isArray(product?.images) ? product.images : [])
    ].map(value => String(value || '').trim()).filter(Boolean))].slice(0, 8);

    useEffect(() => {
        setActiveImageIndex(0);
        touchStartX.current = null;
    }, [product?.id]);

    // Lock the page behind the product dialog. Keep the dialog itself scrollable.
    useEffect(() => {
        if (!product) return undefined;

        const scrollY = window.scrollY || window.pageYOffset || 0;
        const body = document.body;
        const root = document.documentElement;

        const previousBodyStyles = {
            position: body.style.position,
            top: body.style.top,
            left: body.style.left,
            right: body.style.right,
            width: body.style.width,
            overflow: body.style.overflow,
            paddingRight: body.style.paddingRight
        };
        const previousRootOverflow = root.style.overflow;
        const scrollbarWidth = Math.max(0, window.innerWidth - root.clientWidth);

        body.style.position = 'fixed';
        body.style.top = `-${scrollY}px`;
        body.style.left = '0';
        body.style.right = '0';
        body.style.width = '100%';
        body.style.overflow = 'hidden';
        if (scrollbarWidth > 0) {
            body.style.paddingRight = `${scrollbarWidth}px`;
        }
        root.style.overflow = 'hidden';

        const closeOnEscape = event => {
            if (event.key === 'Escape') closeHandlerRef.current?.();
        };
        const preventBackdropScroll = event => {
            const target = event.target;
            const insideDialog = target instanceof Element && target.closest('.product-modal');
            if (!insideDialog) event.preventDefault();
        };

        const overlay = overlayRef.current;
        overlay?.addEventListener('wheel', preventBackdropScroll, { passive: false });
        overlay?.addEventListener('touchmove', preventBackdropScroll, { passive: false });
        document.addEventListener('keydown', closeOnEscape);

        return () => {
            overlay?.removeEventListener('wheel', preventBackdropScroll);
            overlay?.removeEventListener('touchmove', preventBackdropScroll);
            document.removeEventListener('keydown', closeOnEscape);

            body.style.position = previousBodyStyles.position;
            body.style.top = previousBodyStyles.top;
            body.style.left = previousBodyStyles.left;
            body.style.right = previousBodyStyles.right;
            body.style.width = previousBodyStyles.width;
            body.style.overflow = previousBodyStyles.overflow;
            body.style.paddingRight = previousBodyStyles.paddingRight;
            root.style.overflow = previousRootOverflow;

            window.scrollTo(0, scrollY);
        };
    }, [product?.id]);

    if (!product) return null;

    const changeImage = direction => {
        if (galleryImages.length < 2) return;
        setActiveImageIndex(current => (current + direction + galleryImages.length) % galleryImages.length);
    };
    const handleTouchStart = event => {
        touchStartX.current = event.touches?.[0]?.clientX ?? null;
    };
    const handleTouchEnd = event => {
        if (touchStartX.current === null) return;
        const endX = event.changedTouches?.[0]?.clientX ?? touchStartX.current;
        const distance = touchStartX.current - endX;
        touchStartX.current = null;
        if (Math.abs(distance) > 42) changeImage(distance > 0 ? 1 : -1);
    };
    const activeImage = galleryImages[activeImageIndex] || product.image || 'https://placehold.co/900x900?text=NOVA+Product';

    return (
        <div
            ref={overlayRef}
            className="overlay product-modal-overlay"
            onClick={onClose}
            aria-modal="true"
            role="presentation"
        >
            <div
                className="product-modal"
                onClick={event => event.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label={`${product.name} product details`}
            >
                <button type="button" className="modal-close icon-button" onClick={onClose} aria-label="Close product details">
                    <X />
                </button>

                <div className="product-gallery-column">
                    <div className="modal-image product-gallery-main" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
                        <img src={activeImage} alt={`${product.name} — image ${activeImageIndex + 1}`} loading="lazy" decoding="async" />
                        {galleryImages.length > 1 && (
                            <>
                                <button type="button" className="product-gallery-arrow product-gallery-prev" onClick={() => changeImage(-1)} aria-label="Previous product image"><ChevronLeft size={19} /></button>
                                <button type="button" className="product-gallery-arrow product-gallery-next" onClick={() => changeImage(1)} aria-label="Next product image"><ChevronRight size={19} /></button>
                                <span className="product-gallery-count">{activeImageIndex + 1} / {galleryImages.length}</span>
                            </>
                        )}
                    </div>
                    {galleryImages.length > 1 && (
                        <div className="product-gallery-thumbs" role="group" aria-label="Choose product image">
                            {galleryImages.map((imageUrl, index) => (
                                <button
                                    key={`${imageUrl}-${index}`}
                                    type="button"
                                    className={'product-gallery-thumb' + (index === activeImageIndex ? ' is-active' : '')}
                                    onClick={() => setActiveImageIndex(index)}
                                    aria-label={`Show product image ${index + 1}`}
                                    aria-pressed={index === activeImageIndex}
                                >
                                    <img src={imageUrl} alt="" loading="lazy" decoding="async" />
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="modal-copy">
                    <span className="eyebrow gold-text">NOVA SELECT</span>
                    <span className="eyebrow muted">{product.category}</span>
                    <h2>{product.name}</h2>

                    <div className="rating">
                        <Star size={14} fill="currentColor" />
                        <b>{product.rating}</b>
                        <span>({product.reviews} reviews)</span>
                    </div>

                    <div className="price-row modal-price">
                        <strong>{money(product.price)}</strong>
                        {product.oldPrice > product.price && <del>{money(product.oldPrice)}</del>}
                    </div>

                    <p>{product.description}</p>

                    <div className="stock-note">
                        <span className="stock-dot" /> In stock · Ready to ship
                    </div>

                    <button
                        type="button"
                        className="button button-dark full"
                        onClick={() => {
                            onAdd(product);
                            onClose();
                        }}
                    >
                        Add to bag <ShoppingBag size={16} />
                    </button>
                    <button
                        type="button"
                        className={'button button-light full modal-wishlist-button' + (isFavorite ? ' is-saved' : '')}
                        aria-pressed={isFavorite}
                        onClick={() => onFavorite(String(product.id))}
                    >
                        <Heart size={16} fill={isFavorite ? 'currentColor' : 'none'} />
                        {isFavorite ? 'Remove from wishlist' : 'Save to wishlist'}
                    </button>

                    <div className="modal-perks">
                        <span><Truck size={15} /> Free delivery over ₹999</span>
                        <span><RotateCcw size={15} /> Easy 7-day returns</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

function LoginPage({ onBack, onAuthenticated }) {
    const [resetToken] = useState(() => new URLSearchParams(window.location.search).get('resetToken') || '');
    const [resetEmail] = useState(() => new URLSearchParams(window.location.search).get('email') || '');
    const [mode, setMode] = useState(resetToken ? 'reset' : 'login');
    useEffect(() => {
        if (resetToken || resetEmail) {
            // Remove one-time credentials from the address bar/history after
            // the reset form has captured them in component state.
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }, [resetToken, resetEmail]);
    const [name, setName] = useState('');
    const [email, setEmail] = useState(resetEmail);
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [mfaCode, setMfaCode] = useState('');
    const [mfaSecret, setMfaSecret] = useState('');
    const [recoveryCodes, setRecoveryCodes] = useState([]);
    const [pendingAdminAccount, setPendingAdminAccount] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    function switchMode(newMode) {
        setMode(newMode);
        setError('');
        setSuccess('');
        setPassword('');
        setConfirmPassword('');
        setMfaCode('');
        setMfaSecret('');
        setRecoveryCodes([]);
        setPendingAdminAccount(null);
    }

    async function handleLogin(e) {
        e.preventDefault();
        setError('');
        setSuccess('');
        setLoading(true);

        try {
            const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Login failed.');
            if (data.requiresMfa) {
                setMode('mfa-verify');
                setSuccess('Password accepted. Enter the six-digit code from your authenticator app.');
                return;
            }
            if (data.requiresMfaSetup) {
                const setupResponse = await fetch(`${API_BASE_URL}/api/auth/mfa/setup/start`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
                const setupData = await setupResponse.json();
                if (!setupResponse.ok) throw new Error(setupData.error || 'Unable to prepare two-factor setup.');
                setMfaSecret(setupData.secret);
                setMode('mfa-setup');
                setSuccess('Add this setup key to Google Authenticator or another TOTP app, then enter the current six-digit code.');
                return;
            }
            onAuthenticated(data);
        } catch (err) {
            setError(err.message || 'Unable to connect to NOVA.');
        } finally {
            setLoading(false);
        }
    }

    async function handleMfaSubmit(e) {
        e.preventDefault();
        setError('');
        setSuccess('');
        setLoading(true);
        try {
            const isSetup = mode === 'mfa-setup';
            const endpoint = isSetup ? '/api/auth/mfa/setup/verify' : '/api/auth/mfa/verify';
            const response = await fetch(`${API_BASE_URL}${endpoint}`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: mfaCode.trim() })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Two-factor verification failed.');
            setMfaCode('');
            if (Array.isArray(data.recoveryCodes) && data.recoveryCodes.length) {
                setRecoveryCodes(data.recoveryCodes);
                setPendingAdminAccount(data);
                setMode('mfa-backup');
                setSuccess('Two-factor authentication is enabled. Save these one-time backup codes now.');
                return;
            }
            onAuthenticated(data);
        } catch (err) {
            setError(err.message || 'Unable to verify your authenticator code.');
        } finally {
            setLoading(false);
        }
    }

    async function copyRecoveryCodes() {
        try {
            await navigator.clipboard.writeText(recoveryCodes.join('\n'));
            setSuccess('Backup codes copied. Store them somewhere private and offline.');
        } catch {
            setError('Clipboard access was unavailable. Select and copy the backup codes manually.');
        }
    }

    async function copyMfaSecret() {
        try {
            await navigator.clipboard.writeText(mfaSecret);
            setSuccess('Setup key copied. Add it to your authenticator app.');
        } catch {
            setError('Clipboard access was unavailable. Select and copy the setup key manually.');
        }
    }

    async function handleRegister(e) {
        e.preventDefault();
        setError('');
        setSuccess('');
        if (Array.from(password).length < 15) {
            setError('Password must contain at least 15 characters.');
            return;
        }
        if (password !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }
        setLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, password })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Registration failed.');
            setName('');
            setPassword('');
            setConfirmPassword('');
            setMode('login');
            setSuccess('Account created successfully! Please sign in.');
        } catch (err) {
            setError(err.message || 'Unable to register your account.');
        } finally {
            setLoading(false);
        }
    }

    async function handleForgotPassword(e) {
        e.preventDefault();
        setError('');
        setSuccess('');
        setLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}/api/auth/forgot-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Unable to request a password reset.');
            setSuccess(data.message || 'If an account exists for that email, a reset link will be sent.');
        } catch (err) {
            setError(err.message || 'Unable to connect to the password recovery service.');
        } finally {
            setLoading(false);
        }
    }

    async function handleResetPassword(e) {
        e.preventDefault();
        setError('');
        setSuccess('');
        if (Array.from(password).length < 15) {
            setError('Your new password must contain at least 15 characters.');
            return;
        }
        if (password !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }
        if (!resetToken || !email) {
            setError('This reset link is incomplete. Request a new password reset link.');
            return;
        }
        setLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}/api/auth/reset-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, token: resetToken, password })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Unable to reset password.');
            setPassword('');
            setConfirmPassword('');
            window.history.replaceState({}, document.title, window.location.pathname);
            setMode('login');
            setSuccess('Password changed successfully. Please sign in with your new password.');
        } catch (err) {
            setError(err.message || 'Unable to reset your password.');
        } finally {
            setLoading(false);
        }
    }

    const pageContent = {
        login: { eyebrow: 'WELCOME BACK', title: 'Good to see you again.', subtitle: 'Sign in to your NOVA account and continue.' },
        register: { eyebrow: 'JOIN NOVA', title: 'Create your account.', subtitle: 'Join NOVA and discover something good.' },
        forgot: { eyebrow: 'ACCOUNT RECOVERY', title: 'Forgot your password?', subtitle: 'Enter your account email and we will send a secure reset link.' },
        reset: { eyebrow: 'SECURE YOUR ACCOUNT', title: 'Choose a new password.', subtitle: 'Create a new password for your NOVA account.' },
        'mfa-verify': { eyebrow: 'TWO-FACTOR SECURITY', title: 'Verify it’s you.', subtitle: 'Enter a current code from your authenticator app. A one-time backup code also works.' },
        'mfa-setup': { eyebrow: 'SECURE YOUR ADMIN ACCOUNT', title: 'Set up an authenticator.', subtitle: 'NOVA requires two-factor authentication for every admin-workspace account.' },
        'mfa-backup': { eyebrow: 'SAVE YOUR BACKUP CODES', title: 'Keep these codes safe.', subtitle: 'Each code can be used once if you lose access to your authenticator.' }
    }[mode];

    const submitHandler = mode === 'login' ? handleLogin
        : mode === 'register' ? handleRegister
            : mode === 'forgot' ? handleForgotPassword
                : mode === 'reset' ? handleResetPassword
                    : (mode === 'mfa-verify' || mode === 'mfa-setup') ? handleMfaSubmit
                        : event => event.preventDefault();

    return (
        <main className="login-screen">
            <button className="login-back" onClick={onBack}>← Back to shopping</button>
            <section className="login-card">
                <div className="login-logo">NOVA<span>.</span></div>
                <span className="eyebrow gold-text">{pageContent.eyebrow}</span>
                <h1>{pageContent.title}</h1>
                <p className="login-subtitle">{pageContent.subtitle}</p>

                <form className="login-form" onSubmit={submitHandler}>
                    {mode === 'register' && (
                        <label>
                            Full name
                            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Enter your full name" autoComplete="name" minLength={2} maxLength={100} required />
                        </label>
                    )}

                    {(mode === 'login' || mode === 'register' || mode === 'forgot' || mode === 'reset') && (
                        <label>
                            Email address
                            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Enter your email" autoComplete="email" readOnly={mode === 'reset'} required />
                        </label>
                    )}

                    {mode === 'mfa-setup' && (
                        <div className="mfa-setup-panel">
                            <b>1. Add NOVA Market to your authenticator</b>
                            <p>In Google Authenticator, Microsoft Authenticator or another TOTP app, choose <strong>Add account → Enter a setup key</strong>.</p>
                            <span className="mfa-key-label">Account setup key</span>
                            <code className="mfa-secret-key">{mfaSecret}</code>
                            <button type="button" className="button button-light mfa-copy-button" onClick={copyMfaSecret}>Copy setup key</button>
                            <p className="mfa-helper">Account: {email || 'your administrator email'} · Key type: Time-based (TOTP) · Code length: 6 digits</p>
                            <b>2. Verify the authenticator</b>
                            <p>Enter the current six-digit code shown by the app below.</p>
                        </div>
                    )}

                    {(mode === 'mfa-verify' || mode === 'mfa-setup') && (
                        <label>
                            {mode === 'mfa-setup' ? 'Authenticator verification code' : 'Authenticator code or backup code'}
                            <input className="mfa-code-input" type="text" inputMode={mode === 'mfa-setup' ? 'numeric' : 'text'} autoComplete="one-time-code" value={mfaCode} onChange={e => setMfaCode(e.target.value)} placeholder={mode === 'mfa-setup' ? 'Enter 6-digit code' : '6-digit code or backup code'} maxLength={32} required />
                        </label>
                    )}

                    {mode === 'mfa-backup' && (
                        <div className="mfa-setup-panel">
                            <p><strong>Store these codes somewhere private and offline.</strong> They will not be shown again.</p>
                            <div className="mfa-recovery-grid">{recoveryCodes.map(code => <code key={code}>{code}</code>)}</div>
                            <button type="button" className="button button-light mfa-copy-button" onClick={copyRecoveryCodes}>Copy backup codes</button>
                            <p className="mfa-helper">Each backup code is single-use. Do not share them with anyone.</p>
                        </div>
                    )}

                    {(mode === 'login' || mode === 'register' || mode === 'reset') && (
                        <label>
                            {mode === 'login' ? 'Password' : 'New password'}
                            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={mode === 'login' ? 'Enter your password' : 'Enter your new password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'login' ? 1 : 15} maxLength={128} required />
                        </label>
                    )}

                    {(mode === 'register' || mode === 'reset') && (
                        <label>
                            Confirm password
                            <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Confirm your password" autoComplete="new-password" minLength={15} maxLength={128} required />
                        </label>
                    )}

                    {error && <p className="login-error" role="alert">{error}</p>}
                    {success && <p className="login-success" role="status">{success}</p>}

                    {mode !== 'mfa-backup' && (
                        <button type="submit" className="button button-gold login-submit" disabled={loading}>
                            {loading ? 'Please wait…'
                                : mode === 'login' ? 'Sign in to NOVA'
                                    : mode === 'register' ? 'Create my account'
                                        : mode === 'forgot' ? 'Send reset link'
                                            : mode === 'reset' ? 'Save new password'
                                                : mode === 'mfa-setup' ? 'Enable two-factor security' : 'Verify and sign in'}
                        </button>
                    )}
                    {mode === 'mfa-backup' && (
                        <button type="button" className="button button-gold login-submit" onClick={() => pendingAdminAccount && onAuthenticated(pendingAdminAccount)}>I have saved my backup codes — continue</button>
                    )}
                </form>

                <div className="login-footer login-footer-actions">
                    {mode === 'login' && <>
                        <button type="button" className="text-button recovery-link" onClick={() => switchMode('forgot')}>Forgot password?</button>
                        <span>Don't have an account?</span>
                        <button type="button" className="text-button" onClick={() => switchMode('register')}>Create account</button>
                    </>}
                    {mode === 'register' && <>
                        <span>Already have an account?</span>
                        <button type="button" className="text-button" onClick={() => switchMode('login')}>Sign in</button>
                    </>}
                    {(mode === 'forgot' || mode === 'reset' || mode === 'mfa-verify' || mode === 'mfa-setup') && <>
                        <button type="button" className="text-button" onClick={() => switchMode('login')}>Back to sign in</button>
                    </>}
                    {mode === 'mfa-backup' && <span>Save your codes before continuing.</span>}
                </div>
            </section>
        </main>
    );
}

function AdminCustomersPanel() {
    const [customers, setCustomers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [query, setQuery] = useState('');

    async function loadCustomers() {
        setLoading(true);
        setError('');
        try {
            const response = await fetch(`${API_BASE_URL}/api/admin/customers`, {
                credentials: 'include'
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Unable to load customers.');
            setCustomers(Array.isArray(data.customers) ? data.customers : []);
        } catch (err) {
            setError(err.message || 'Unable to load customers.');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { loadCustomers(); }, []);

    const filtered = customers.filter(customer =>
        `${customer.name} ${customer.email}`.toLowerCase().includes(query.toLowerCase())
    );

    return (
        <section className="panel table-panel management-panel">
            <div className="panel-head">
                <div><h3>Registered customers</h3><p>Customer accounts created through NOVA registration.</p></div>
                <button className="button button-light" onClick={loadCustomers} disabled={loading}>
                    <RotateCcw size={15} /> Refresh
                </button>
            </div>
            <div className="management-toolbar">
                <div className="management-count"><Users size={18} /><strong>{customers.length}</strong><span>registered customers</span></div>
                <input
                    className="management-search"
                    value={query}
                    onChange={event => setQuery(event.target.value)}
                    placeholder="Search name or email..."
                    aria-label="Search customers"
                />
            </div>
            {error && <p className="login-error" role="alert">{error}</p>}
            {loading ? <p>Loading customers…</p> : filtered.length === 0 ? (
                <div className="empty-orders"><Users size={28} /><p>{customers.length ? 'No customers match your search.' : 'No customer accounts have registered yet.'}</p></div>
            ) : (
                <div className="table-scroll">
                    <table>
                        <thead><tr><th>Customer</th><th>Email address</th><th>Joined</th><th>Account</th></tr></thead>
                        <tbody>
                            {filtered.map(customer => (
                                <tr key={customer.id || customer.email}>
                                    <td><b>{customer.name || 'Customer'}</b></td>
                                    <td>{customer.email}</td>
                                    <td>{customer.createdAt ? new Date(customer.createdAt).toLocaleDateString('en-IN') : '—'}</td>
                                    <td><span className="management-active">Customer</span></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            <p className="management-note">Customer passwords are never returned to this page. This first version provides a secure customer directory; customer blocking and account editing are not enabled.</p>
        </section>
    );
}

function AdminTeamPanel({ currentAdmin }) {
    const [admins, setAdmins] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [busyEmail, setBusyEmail] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [draft, setDraft] = useState({ fullName: '', email: '', role: 'admin', password: '' });

    async function loadAdmins() {
        setLoading(true);
        setError('');
        try {
            const response = await fetch(`${API_BASE_URL}/api/admin/admins`, { credentials: 'include' });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Unable to load administrator accounts.');
            setAdmins(Array.isArray(data.admins) ? data.admins : []);
        } catch (err) {
            setError(err.message || 'Unable to load administrator accounts.');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { loadAdmins(); }, []);

    async function createAdmin(event) {
        event.preventDefault();
        setSaving(true);
        setError('');
        setSuccess('');
        try {
            const response = await fetch(`${API_BASE_URL}/api/admin/admins`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(draft)
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Unable to create administrator.');
            // The API returns the created account, so update this list locally.
            // Avoid a second Google Sheets read immediately after creation.
            if (data.admin) {
                setAdmins(current => [
                    data.admin,
                    ...current.filter(item => item.email !== data.admin.email)
                ]);
            }
            setSuccess(data.message || 'Administrator created.');
            setDraft({ fullName: '', email: '', role: 'admin', password: '' });
            setShowForm(false);
        } catch (err) {
            setError(err.message || 'Unable to create administrator.');
        } finally {
            setSaving(false);
        }
    }

    async function updateAdmin(admin, changes) {
        setBusyEmail(admin.email);
        setError('');
        setSuccess('');
        try {
            const response = await fetch(`${API_BASE_URL}/api/admin/admins/${encodeURIComponent(admin.email)}`, {
                method: 'PATCH',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(changes)
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Unable to update administrator.');
            setAdmins(current => current.map(item => item.email === admin.email ? { ...data.admin, mfaEnabled: data.admin.mfaEnabled ?? item.mfaEnabled } : item));
            setSuccess(data.message || 'Administrator updated.');
        } catch (err) {
            setError(err.message || 'Unable to update administrator.');
        } finally {
            setBusyEmail('');
        }
    }

    async function deleteAdmin(admin) {
        const email = String(admin?.email || '').trim().toLowerCase();
        if (!email || admin.role === 'owner' || email === String(currentAdmin?.email || '').trim().toLowerCase()) {
            setError('The owner account and your own account cannot be deleted here.');
            return;
        }

        const confirmed = window.confirm(
            `Permanently delete ${admin.fullName || email} (${email})?\n\n` +
            'This removes the administrator row from Google Sheets and revokes access on their next request. This action cannot be undone.'
        );
        if (!confirmed) return;

        setBusyEmail(email);
        setError('');
        setSuccess('');
        try {
            const response = await fetch(`${API_BASE_URL}/api/admin/admins/${encodeURIComponent(email)}`, {
                method: 'DELETE',
                credentials: 'include'
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Unable to delete administrator.');
            setAdmins(current => current.filter(item => item.email.toLowerCase() !== email));
            setSuccess(data.message || 'Administrator permanently deleted.');
        } catch (err) {
            setError(err.message || 'Unable to delete administrator.');
        } finally {
            setBusyEmail('');
        }
    }

    const ownerCount = admins.filter(admin => admin.role === 'owner' && admin.active).length;

    return (
        <section className="panel table-panel management-panel">
            <div className="panel-head">
                <div><h3>Administrator access</h3><p>Manage who can access the NOVA admin workspace.</p></div>
                <div className="management-head-actions">
                    <button className="button button-light" onClick={loadAdmins} disabled={loading}><RotateCcw size={15} /> Refresh</button>
                    <button className="button button-gold" onClick={() => { setShowForm(value => !value); setError(''); }}><UserPlus size={15} /> Add admin</button>
                </div>
            </div>
            <div className="management-count"><ShieldCheck size={18} /><strong>{admins.length}</strong><span>administrator accounts · {ownerCount} protected owner</span></div>
            {success && <p className="order-success" role="status">{success}</p>}
            {error && <p className="login-error" role="alert">{error}</p>}

            {showForm && (
                <form className="management-form" onSubmit={createAdmin}>
                    <div className="management-form-title">Create administrator account</div>
                    <label>Full name<input required minLength="2" maxLength="100" value={draft.fullName} onChange={event => setDraft({ ...draft, fullName: event.target.value })} /></label>
                    <label>Email address<input required type="email" maxLength="254" value={draft.email} onChange={event => setDraft({ ...draft, email: event.target.value })} /></label>
                    <label>Role<select value={draft.role} onChange={event => setDraft({ ...draft, role: event.target.value })}><option value="admin">Admin</option><option value="manager">Manager</option></select></label>
                    <label>Initial password<input required type="password" minLength="15" maxLength="128" autoComplete="new-password" value={draft.password} onChange={event => setDraft({ ...draft, password: event.target.value })} /><small>Use at least 15 characters. Share it privately; no invitation email is sent.</small></label>
                    <div className="management-form-actions">
                        <button type="button" className="button button-light" onClick={() => setShowForm(false)} disabled={saving}>Cancel</button>
                        <button type="submit" className="button button-dark" disabled={saving}>{saving ? 'Creating…' : 'Create admin'}</button>
                    </div>
                </form>
            )}

            {loading ? <p>Loading administrator accounts…</p> : admins.length === 0 ? <p>No administrator accounts found.</p> : (
                <div className="table-scroll">
                    <table>
                        <thead><tr><th>Team member</th><th>Email</th><th>Role</th><th>Status</th><th>Two-factor</th><th>Action</th></tr></thead>
                        <tbody>
                            {admins.map(admin => {
                                const isOwner = admin.role === 'owner';
                                const isSelf = admin.email === String(currentAdmin?.email || '').toLowerCase();
                                return (
                                    <tr key={admin.email}>
                                        <td><b>{admin.fullName || 'Team member'}</b>{isSelf && <small className="order-date">You</small>}</td>
                                        <td>{admin.email}</td>
                                        <td>{isOwner ? <span className="management-owner">Owner</span> : (
                                            <select className="order-status-select" value={admin.role} disabled={busyEmail === admin.email} onChange={event => updateAdmin(admin, { role: event.target.value })} aria-label={`Role for ${admin.email}`}>
                                                <option value="admin">Admin</option><option value="manager">Manager</option>
                                            </select>
                                        )}</td>
                                        <td><span className={admin.active ? 'management-active' : 'management-inactive'}>{admin.active ? 'Active' : 'Disabled'}</span></td>
                                        <td><span className={admin.mfaEnabled ? 'management-active' : 'management-inactive'}>{admin.mfaEnabled ? 'Enabled' : 'Setup required'}</span></td>
                                        <td>{isOwner ? <span className="management-note">Protected</span> : (
                                            <div className="management-row-actions">
                                                <button className="button button-light management-toggle" disabled={busyEmail === admin.email || isSelf} onClick={() => updateAdmin(admin, { active: !admin.active })}>
                                                    {busyEmail === admin.email ? 'Saving…' : admin.active ? 'Disable' : 'Activate'}
                                                </button>
                                                <button
                                                    type="button"
                                                    className="button button-light management-delete"
                                                    disabled={busyEmail === admin.email || isSelf}
                                                    onClick={() => deleteAdmin(admin)}
                                                    aria-label={`Permanently delete ${admin.email}`}
                                                    title={isSelf ? 'You cannot delete your own account' : 'Permanently delete administrator'}
                                                >
                                                    <Trash2 size={14} /> Delete
                                                </button>
                                            </div>
                                        )}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
            <p className="management-note">Only the owner can manage admin/manager accounts. All owner, admin and manager accounts must enroll an authenticator before accessing the admin workspace. Password hashes and authenticator secrets are never shown here.</p>
        </section>
    );
}


function AdminSecurityMonitoringPanel() {
    const [logs, setLogs] = useState([]);
    const [attempts, setAttempts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [query, setQuery] = useState('');
    const [eventFilter, setEventFilter] = useState('all');
    const [outcomeFilter, setOutcomeFilter] = useState('all');
    const [roleFilter, setRoleFilter] = useState('all');
    const [timeFilter, setTimeFilter] = useState('24h');

    async function loadMonitoring() {
        setLoading(true);
        setError('');
        try {
            const response = await fetch(`${API_BASE_URL}/api/admin/security-monitoring?limit=250&attemptLimit=500`, { credentials: 'include', cache: 'no-store' });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Unable to load security monitoring data.');
            setLogs(Array.isArray(data.logs) ? data.logs : []);
            setAttempts(Array.isArray(data.attempts) ? data.attempts : []);
        } catch (err) {
            setError(err.message || 'Unable to load security monitoring data.');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { loadMonitoring(); }, []);

    const now = Date.now();
    const cutoff = timeFilter === '24h' ? now - 24 * 60 * 60 * 1000
        : timeFilter === '7d' ? now - 7 * 24 * 60 * 60 * 1000
        : timeFilter === '30d' ? now - 30 * 24 * 60 * 60 * 1000 : 0;
    const inRange = item => {
        const timestamp = Date.parse(item.timestamp || '');
        return Number.isFinite(timestamp) && timestamp >= cutoff && timestamp <= now + 60_000;
    };
    const rangeLogs = logs.filter(inRange);
    const countEvent = event => rangeLogs.filter(log => log.event === event).length;
    const failedLogins = countEvent('auth.login.failed');
    const mfaFailures = countEvent('auth.mfa.failed');
    const suspiciousAlerts = countEvent('auth.suspicious_login.detected');
    const adminActions = rangeLogs.filter(log => String(log.event || '').startsWith('admin.')).length;

    // Reconstruct latest state per hashed account/network pair + phase. Only
    // short references are supplied by the backend; raw HMACs never reach UI.
    const latestAttemptByPair = new Map();
    [...attempts].slice().sort((a, b) => Date.parse(a.timestamp || 0) - Date.parse(b.timestamp || 0)).forEach(attempt => {
        latestAttemptByPair.set(`${attempt.keyRef}|${attempt.phase}`, attempt);
    });
    const activeBlocks = [...latestAttemptByPair.values()]
        .filter(item => item.eventType === 'block' && Date.parse(item.blockedUntil || '') > now)
        .sort((a, b) => Date.parse(a.blockedUntil) - Date.parse(b.blockedUntil));

    const eventGroup = event => {
        if (event.startsWith('auth.mfa')) return 'mfa';
        if (event.includes('suspicious_login')) return 'suspicious';
        if (event.startsWith('auth.')) return 'authentication';
        if (event.startsWith('admin.')) return 'admin';
        if (event.startsWith('catalog.')) return 'catalog';
        if (event.startsWith('order.')) return 'orders';
        return 'other';
    };
    const filtered = rangeLogs.filter(log => {
        const haystack = [log.event, log.actorEmail, log.actorRole, log.targetEmail, log.targetRole, log.outcome, log.summary].join(' ').toLowerCase();
        return (!query || haystack.includes(query.toLowerCase()))
            && (eventFilter === 'all' || eventGroup(String(log.event || '')) === eventFilter)
            && (outcomeFilter === 'all' || String(log.outcome || '').toLowerCase() === outcomeFilter)
            && (roleFilter === 'all' || [log.actorRole, log.targetRole].some(role => String(role || '').toLowerCase() === roleFilter));
    });

    const formatTime = value => value ? new Date(value).toLocaleString('en-IN') : '—';
    const timeLeft = value => {
        const ms = Date.parse(value || '') - Date.now();
        if (!Number.isFinite(ms) || ms <= 0) return 'Expired';
        const minutes = Math.ceil(ms / 60_000);
        return minutes < 60 ? `${minutes} min remaining` : `${Math.floor(minutes / 60)}h ${minutes % 60}m remaining`;
    };

    return (
        <section className="panel table-panel security-audit-panel security-monitoring-panel">
            <div className="panel-head">
                <div><h3>Security activity</h3><p>Owner-only overview of authentication, temporary blocks and privileged account actions.</p></div>
                <button className="button button-light" onClick={loadMonitoring} disabled={loading}><RotateCcw size={15} /> {loading ? 'Refreshing…' : 'Refresh'}</button>
            </div>

            {suspiciousAlerts > 0 && (
                <div className="security-monitor-alert"><ShieldAlert size={20} /><div><b>{suspiciousAlerts} suspicious sign-in alert{suspiciousAlerts === 1 ? '' : 's'} in this period</b><span>Repeated password or authenticator failures were detected. Review the activity and active blocks below.</span></div></div>
            )}

            <div className="security-monitor-cards">
                <div className="security-monitor-card"><span><KeyRound size={17}/> Failed logins</span><strong>{failedLogins}</strong><small>Selected time period</small></div>
                <div className="security-monitor-card"><span><ShieldAlert size={17}/> MFA failures</span><strong>{mfaFailures}</strong><small>Authenticator / recovery failures</small></div>
                <div className="security-monitor-card"><span><ShieldCheck size={17}/> Suspicious alerts</span><strong>{suspiciousAlerts}</strong><small>Detected sign-in patterns</small></div>
                <div className="security-monitor-card"><span><Activity size={17}/> Admin actions</span><strong>{adminActions}</strong><small>Account and permission changes</small></div>
                <div className="security-monitor-card"><span><LockKeyhole size={17}/> Active blocks</span><strong>{activeBlocks.length}</strong><small>Persistent temporary blocks</small></div>
            </div>

            {error && <p className="login-error" role="alert">{error}</p>}

            <div className="security-monitor-toolbar">
                <input className="management-search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search event, account or result…" aria-label="Search security activity" />
                <select value={timeFilter} onChange={event => setTimeFilter(event.target.value)} aria-label="Filter by time"><option value="24h">Last 24 hours</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="all">All loaded history</option></select>
                <select value={eventFilter} onChange={event => setEventFilter(event.target.value)} aria-label="Filter by event"><option value="all">All event types</option><option value="authentication">Authentication</option><option value="mfa">MFA</option><option value="suspicious">Suspicious activity</option><option value="admin">Admin actions</option><option value="catalog">Product actions</option><option value="orders">Order actions</option><option value="other">Other</option></select>
                <select value={outcomeFilter} onChange={event => setOutcomeFilter(event.target.value)} aria-label="Filter by result"><option value="all">All results</option><option value="success">Success</option><option value="denied">Denied</option><option value="alert">Alert</option><option value="mfa_pending">MFA pending</option><option value="mfa_setup_required">MFA setup required</option></select>
                <select value={roleFilter} onChange={event => setRoleFilter(event.target.value)} aria-label="Filter by role"><option value="all">All roles</option><option value="owner">Owner</option><option value="admin">Admin</option><option value="manager">Manager</option><option value="customer">Customer</option></select>
            </div>

            <section className="security-blocks-section">
                <div className="security-section-title"><div><h4>Active temporary blocks</h4><p>Current password and MFA throttles stored in Google Sheets.</p></div><span className="security-section-count">{activeBlocks.length} active</span></div>
                {activeBlocks.length === 0 ? <div className="security-empty-inline">No active temporary blocks.</div> : (
                    <div className="table-scroll"><table className="security-audit-table security-blocks-table"><thead><tr><th>Attempt group</th><th>Phase</th><th>Blocked until</th><th>Status</th></tr></thead><tbody>
                        {activeBlocks.map((block, index) => <tr key={`${block.keyRef}-${block.phase}-${index}`}><td className="audit-fingerprint">{block.keyRef}</td><td><span className="security-phase">{block.phase}</span></td><td>{formatTime(block.blockedUntil)}</td><td><span className="audit-result audit-result-warning">{timeLeft(block.blockedUntil)}</span></td></tr>)}
                    </tbody></table></div>
                )}
            </section>

            <div className="security-monitor-table-head"><div><h4>Recent security events</h4><p>Showing {filtered.length} of {rangeLogs.length} events in the selected period.</p></div><span className="management-count"><ShieldCheck size={17}/><strong>{rangeLogs.length}</strong><span>loaded events</span></span></div>
            {loading ? <p>Loading security activity…</p> : filtered.length === 0 ? (
                <div className="empty-orders"><ShieldCheck size={28} /><p>{rangeLogs.length ? 'No security events match these filters.' : 'No security events recorded in this period.'}</p></div>
            ) : (
                <div className="table-scroll"><table className="security-audit-table"><thead><tr><th>Time</th><th>Event</th><th>Actor</th><th>Target</th><th>Result</th><th>IP fingerprint</th></tr></thead><tbody>{filtered.map((log, index) => (
                    <tr key={`${log.timestamp}-${log.event}-${index}`}><td>{formatTime(log.timestamp)}</td><td><b>{log.event || '—'}</b><small>{log.summary || ''}</small></td><td>{log.actorEmail || '—'}<small>{log.actorRole || ''}</small></td><td>{log.targetEmail || '—'}<small>{log.targetRole || ''}</small></td><td><span className={log.outcome === 'success' ? 'audit-result audit-result-success' : 'audit-result audit-result-warning'}>{log.outcome || '—'}</span></td><td className="audit-fingerprint">{log.ipFingerprint || '—'}</td></tr>
                ))}</tbody></table></div>
            )}
            <p className="management-note">Only the store owner can view this dashboard. Passwords, reset tokens, authenticator secrets and recovery codes are never recorded. Attempt group references are shortened HMACs; raw IP addresses and full attempt hashes are not exposed. Summary counts are based on the latest 250 audit events loaded. Google Sheets logs are operational records, not tamper-proof forensic storage.</p>
        </section>
    );
}

function AdminDashboard({ products, account, onBack, onProductSaved, onProductDeleted }) {
    const [tab, setTab] = useState('Overview');
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
    useEffect(() => {
        if (!mobileSidebarOpen) return undefined;
        const previousOverflow = document.body.style.overflow;
        const closeOnEscape = event => {
            if (event.key === 'Escape') setMobileSidebarOpen(false);
        };
        document.body.style.overflow = 'hidden';
        window.addEventListener('keydown', closeOnEscape);
        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener('keydown', closeOnEscape);
        };
    }, [mobileSidebarOpen]);
    const [showForm, setShowForm] = useState(false);
    const [editingProductId, setEditingProductId] = useState(null);
    const [savingProduct, setSavingProduct] = useState(false);
    const [deletingProductId, setDeletingProductId] = useState(null);
    const [productError, setProductError] = useState('');
    const [productSuccess, setProductSuccess] = useState('');
    const [draft, setDraft] = useState({
        name: '',
        category: 'Electronics',
        price: '',
        stock: '',
        image: '',
        additionalImages: '',
        description: ''
    });

    function resetProductForm() {
        setDraft({ name: '', category: 'Electronics', price: '', stock: '', image: '', additionalImages: '', description: '' });
        setEditingProductId(null);
    }

    function startEditProduct(product) {
        setTab('Products');
        setShowForm(true);
        setEditingProductId(String(product.id));
        setDraft({
            name: String(product.name ?? ''),
            category: String(product.category ?? 'Electronics'),
            price: String(product.price ?? ''),
            stock: String(product.stock ?? 0),
            image: String(product.image ?? ''),
            additionalImages: (Array.isArray(product.images) ? product.images : []).filter(url => String(url) !== String(product.image ?? '')).join('\n'),
            description: String(product.description ?? '')
        });
        setProductError('');
        setProductSuccess('');
    }

    async function handleSaveProduct(e) {
        e.preventDefault();
        setProductError('');
        setProductSuccess('');
        setSavingProduct(true);

        const isEditing = Boolean(editingProductId);
        const endpoint = isEditing
            ? `${API_BASE_URL}/api/products/${encodeURIComponent(editingProductId)}`
            : `${API_BASE_URL}/api/products`;

        try {
            const response = await fetch(endpoint, {
                method: isEditing ? 'PUT' : 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: draft.name.trim(),
                    category: draft.category,
                    price: Number(draft.price),
                    stock: Number(draft.stock || 0),
                    image: draft.image.trim(),
                    images: [...new Set([draft.image.trim(), ...draft.additionalImages.split(/\r?\n/).map(url => url.trim())].filter(Boolean))].slice(0, 8),
                    description: draft.description.trim()
                })
            });

            let data = {};
            try { data = await response.json(); } catch { /* Use the fallback below. */ }
            if (!response.ok) {
                throw new Error(data.error || `Product could not be saved (HTTP ${response.status}).`);
            }
            if (!data.product) {
                throw new Error('The server did not return the saved product.');
            }

            onProductSaved(data.product);
            resetProductForm();
            setShowForm(false);
            setProductSuccess(data.message || (isEditing ? 'Product updated.' : 'Product created.'));
        } catch (error) {
            setProductError(error.message || 'Unable to save the product. Please try again.');
        } finally {
            setSavingProduct(false);
        }
    }

    async function handleDeleteProduct(product) {
        const confirmed = window.confirm(`Delete "${product.name}"? This will also remove it from the Products sheet.`);
        if (!confirmed) return;

        setProductError('');
        setProductSuccess('');
        setDeletingProductId(String(product.id));

        try {
            const response = await fetch(
                `${API_BASE_URL}/api/products/${encodeURIComponent(String(product.id))}`,
                { method: 'DELETE', credentials: 'include' }
            );
            let data = {};
            try { data = await response.json(); } catch { /* Use the fallback below. */ }
            if (!response.ok) {
                throw new Error(data.error || `Product could not be deleted (HTTP ${response.status}).`);
            }

            onProductDeleted(product.id);
            setProductSuccess(data.message || 'Product deleted successfully.');
        } catch (error) {
            setProductError(error.message || 'Unable to delete the product. Please try again.');
        } finally {
            setDeletingProductId(null);
        }
    }


    const nav = [
        ['Overview', LayoutDashboard],
        ['Products', Package],
        ['Categories', Tags],
        ['Orders', ClipboardList],
        ['Customers', Users],
        ...(account?.role === 'owner' ? [['Admins', ShieldCheck], ['Security monitoring', Activity]] : []),
        ['Settings', Settings]
    ];

    return (
        <div className={'admin-shell admin-workspace ' + (mobileSidebarOpen ? 'admin-sidebar-open' : '')}>
            <button
                type="button"
                className="admin-sidebar-backdrop"
                aria-label="Close admin navigation"
                tabIndex={mobileSidebarOpen ? 0 : -1}
                onClick={() => setMobileSidebarOpen(false)}
            />
            <aside className="admin-sidebar" aria-label="Admin navigation">
                <div className="admin-sidebar-head">
                    <button className="wordmark admin-logo" onClick={onBack}>
                        NOVA<span>.</span>
                    </button>
                    <button type="button" className="admin-sidebar-close icon-button" aria-label="Close navigation" onClick={() => setMobileSidebarOpen(false)}>
                        <X size={19} />
                    </button>
                </div>

                <div className="admin-label">WORKSPACE</div>

                {nav.map(([n, I]) => (
                    <button
                        key={n}
                        onClick={() => { setTab(n); setMobileSidebarOpen(false); }}
                        className={'admin-nav-item ' + (tab === n ? 'selected' : '')}
                    >
                        <I size={17} /> {n}
                    </button>
                ))}

                <div className="sidebar-bottom">
                    <div className="admin-profile">
                        <div className="avatar">N</div>
                        <div>
                            <b>{account?.fullName || 'Store Admin'}</b>
                            <span>{account?.role || 'Administrator'}</span>
                        </div>
                    </div>

                    <button className="admin-nav-item" onClick={onBack}>
                        <LogOut size={17} /> Back to storefront
                    </button>
                </div>
            </aside>

            <main className="admin-main">
                <header className="admin-top">
                    <button
                        type="button"
                        className="admin-menu-toggle icon-button"
                        aria-label="Open admin navigation"
                        aria-expanded={mobileSidebarOpen}
                        onClick={() => setMobileSidebarOpen(true)}
                    >
                        <Menu size={19} />
                    </button>
                    <div className="admin-top-title">
                        <span className="eyebrow muted">NOVA MARKET / ADMIN</span>
                        <h1>{tab}</h1>
                    </div>

                    <div className="admin-top-actions">
                        <button className="icon-button">
                            <Bell size={18} />
                        </button>
                        <div className="avatar small">N</div>
                    </div>
                </header>

                {tab === 'Overview' ? (
                    <>
                        <div className="welcome-strip">
                            <div>
                                <span className="eyebrow gold-text">
                                    THURSDAY, YOUR STORE AT A GLANCE
                                </span>
                                <h2>Good things are moving.</h2>
                                <p>Here’s what’s happening with your store today.</p>
                            </div>

                            <button
                                className="button button-gold"
                                onClick={() => {
                                    setTab('Products');
                                    setShowForm(true);
                                }}
                            >
                                <Plus size={16} /> Add product
                            </button>
                        </div>

                        <div className="stats-grid">
                            <Stat icon={TrendingUp} label="Gross sales" value="₹2,45,980" change="12.8%" />
                            <Stat icon={ClipboardList} label="Total orders" value="120" change="8.2%" />
                            <Stat icon={Users} label="Customers" value="52" change="16.4%" />
                            <Stat icon={Package} label="Active products" value={products.length} change="5.0%" />
                        </div>

                        <div className="admin-panels">
                            <section className="panel sales-panel">
                                <div className="panel-head">
                                    <div>
                                        <h3>Sales overview</h3>
                                        <p>Revenue across the last 7 months</p>
                                    </div>
                                    <select aria-label="Sales period">
                                        <option>Last 7 months</option>
                                        <option>Last 30 days</option>
                                    </select>
                                </div>

                                <div className="chart">
                                    <div className="chart-y">
                                        <span>₹60k</span>
                                        <span>₹40k</span>
                                        <span>₹20k</span>
                                        <span>₹0</span>
                                    </div>

                                    <svg viewBox="0 0 600 210" preserveAspectRatio="none" aria-label="Illustrative sales chart">
                                        <defs>
                                            <linearGradient id="area" x1="0" x2="0" y1="0" y2="1">
                                                <stop offset="0%" stopColor="#c6a15b" stopOpacity=".25" />
                                                <stop offset="100%" stopColor="#c6a15b" stopOpacity="0" />
                                            </linearGradient>
                                        </defs>

                                        <path
                                            d="M0 170 L85 142 L170 151 L255 100 L340 113 L425 70 L510 82 L600 25 L600 210 L0 210Z"
                                            fill="url(#area)"
                                        />
                                        <path
                                            d="M0 170 L85 142 L170 151 L255 100 L340 113 L425 70 L510 82 L600 25"
                                            fill="none"
                                            stroke="#b58b43"
                                            strokeWidth="3"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                        />
                                    </svg>

                                    <div className="chart-x">
                                        <span>Apr</span>
                                        <span>May</span>
                                        <span>Jun</span>
                                        <span>Jul</span>
                                        <span>Aug</span>
                                        <span>Sep</span>
                                        <span>Oct</span>
                                    </div>
                                </div>

                                <p className="demo-note">
                                    Illustrative dashboard data — replace with live store data when backend is connected.
                                </p>
                            </section>

                            <section className="panel recent-panel">
                                <div className="panel-head">
                                    <div>
                                        <h3>Recent orders</h3>
                                        <p>Latest customer activity</p>
                                    </div>
                                    <button className="text-button" onClick={() => setTab('Orders')}>
                                        View all <ArrowRight size={14} />
                                    </button>
                                </div>

                                {[
                                    ['#NM-1048', 'Priya S.', '₹2,999', 'Processing'],
                                    ['#NM-1047', 'Arjun P.', '₹3,499', 'Delivered'],
                                    ['#NM-1046', 'Meera K.', '₹1,499', 'Pending'],
                                    ['#NM-1045', 'Rohan D.', '₹4,499', 'Delivered']
                                ].map(o => (
                                    <div className="order-row" key={o[0]}>
                                        <div>
                                            <b>{o[0]}</b>
                                            <span>{o[1]}</span>
                                        </div>
                                        <strong>{o[2]}</strong>
                                        <span className={'status ' + o[3].toLowerCase()}>
                                            {o[3]}
                                        </span>
                                    </div>
                                ))}
                            </section>
                        </div>

                        <section className="panel table-panel">
                            <div className="panel-head">
                                <div>
                                    <h3>Products</h3>
                                    <p>Recently added to your catalogue</p>
                                </div>
                                <button className="text-button" onClick={() => setTab('Products')}>
                                    Manage products <ArrowRight size={14} />
                                </button>
                            </div>
                            <ProductTable products={products} onEdit={startEditProduct} onDelete={handleDeleteProduct} deletingProductId={deletingProductId} />
                        </section>
                    </>
                ) : tab === 'Orders' ? (
                    <AdminOrdersPanel />
                ) : tab === 'Customers' ? (
                    <AdminCustomersPanel />
                ) : tab === 'Admins' ? (
                    account?.role === 'owner' ? <AdminTeamPanel currentAdmin={account} /> : (
                        <section className="panel"><h3>Owner access required</h3><p>Only the store owner can manage administrator accounts.</p></section>
                    )
                ) : tab === 'Security monitoring' ? (
                    account?.role === 'owner' ? <AdminSecurityMonitoringPanel /> : (
                        <section className="panel"><h3>Owner access required</h3><p>Only the store owner can view security monitoring.</p></section>
                    )
                ) : tab === 'Products' ? (
                    <section className="panel table-panel">
                        <div className="panel-head">
                            <div>
                                <h3>Product catalogue</h3>
                                <p>Manage items available in your store.</p>
                            </div>
                            <button
                                className="button button-gold"
                                onClick={() => {
                                    setShowForm(!showForm);
                                    setProductError('');
                                    setProductSuccess('');
                                }}
                                disabled={savingProduct}
                            >
                                <Plus size={16} /> Add product
                            </button>
                        </div>

                        {productSuccess && (
                            <p role="status" style={{ color: '#39734c', fontSize: '14px' }}>
                                {productSuccess}
                            </p>
                        )}

                        {productError && !showForm && (
                            <p className="login-error" role="alert">{productError}</p>
                        )}

                        {showForm && (
                            <form className="product-form" onSubmit={handleSaveProduct}>
                                <div className="wide-field"><b>{editingProductId ? 'Edit product details' : 'Add a new product'}</b></div>
                                {productError && (
                                    <p className="login-error wide-field" role="alert">
                                        {productError}
                                    </p>
                                )}
                                <label>
                                    Product name
                                    <input
                                        required
                                        value={draft.name}
                                        onChange={e => setDraft({ ...draft, name: e.target.value })}
                                    />
                                </label>

                                <label>
                                    Category
                                    <select
                                        value={draft.category}
                                        onChange={e => setDraft({ ...draft, category: e.target.value })}
                                    >
                                        {categories.map(c => <option key={c.name}>{c.name}</option>)}
                                    </select>
                                </label>

                                <label>
                                    Price (₹)
                                    <input
                                        type="number"
                                        required
                                        min="1"
                                        value={draft.price}
                                        onChange={e => setDraft({ ...draft, price: e.target.value })}
                                    />
                                </label>

                                <label>
                                    Stock
                                    <input
                                        type="number"
                                        min="0"
                                        step="1"
                                        required
                                        value={draft.stock}
                                        onChange={e => setDraft({ ...draft, stock: e.target.value })}
                                    />
                                </label>

                                <label className="wide-field">
                                    Cover image URL
                                    <input
                                        type="url"
                                        placeholder="https://..."
                                        value={draft.image}
                                        onChange={e => setDraft({ ...draft, image: e.target.value })}
                                    />
                                    <small>This is the main photo shown on product cards. Use a direct HTTPS image URL.</small>
                                </label>
                                <label className="wide-field">
                                    Additional image URLs
                                    <textarea
                                        rows="4"
                                        maxLength="16000"
                                        value={draft.additionalImages}
                                        onChange={e => setDraft({ ...draft, additionalImages: e.target.value })}
                                        placeholder={'Paste one direct HTTPS image URL per line\nhttps://example.com/product-side.jpg\nhttps://example.com/product-detail.jpg'}
                                    />
                                    <small>Up to 7 additional photos. The cover photo plus additional photos can total 8 images. Each URL must open the image directly.</small>
                                </label>
                                <label className="wide-field">
                                    Description
                                    <textarea
                                        rows="3"
                                        maxLength="4000"
                                        value={draft.description}
                                        onChange={e => setDraft({ ...draft, description: e.target.value })}
                                        placeholder="Describe this product..."
                                    />
                                </label>

                                <div className="wide-field form-actions">
                                    <button
                                        type="button"
                                        className="button button-light"
                                        onClick={() => {
                                            setShowForm(false);
                                            setProductError('');
                                            resetProductForm();
                                        }}
                                        disabled={savingProduct}
                                    >
                                        Cancel
                                    </button>
                                    <button className="button button-dark" type="submit" disabled={savingProduct}>
                                        {savingProduct ? 'Saving...' : editingProductId ? 'Save changes' : 'Save product'}
                                    </button>
                                </div>
                            </form>
                        )}

                        <ProductTable products={products} onEdit={startEditProduct} onDelete={handleDeleteProduct} deletingProductId={deletingProductId} />
                    </section>
                ) : (
                    <section className="panel placeholder-panel">
                        <div className="placeholder-icon">
                            <CircleHelp size={25} />
                        </div>
                        <h2>{tab} management</h2>
                        <p>
                            This section is planned for the next implementation stage.
                            It will connect to the Node.js API after secure authentication
                            and Google Sheets/Drive configuration are complete.
                        </p>
                        <button className="button button-dark" onClick={() => setTab('Overview')}>
                            Back to overview
                        </button>
                    </section>
                )}

                <footer className="admin-footer">
                    NOVA MARKET ADMIN
                    <span>Connected to NOVA Market database · Reporting metrics may be illustrative</span>
                </footer>
            </main>
        </div>
    );
}

function Stat({ icon: Icon, label, value, change }) {
    return (
        <div className="stat-card">
            <div className="stat-top">
                <span>{label}</span>
                <Icon size={17} />
            </div>
            <strong>{value}</strong>
            <div className="stat-change">
                <TrendingUp size={13} /> {change} <span>vs last month</span>
            </div>
        </div>
    );
}

function ProductTable({ products, onEdit, onDelete, deletingProductId }) {
    return (
        <div className="table-scroll">
            <table>
                <thead>
                    <tr>
                        <th>Product</th>
                        <th>Category</th>
                        <th>Price</th>
                        <th>Stock</th>
                        <th>Status</th>
                        <th>Action</th>
                    </tr>
                </thead>

                <tbody>
                    {products.slice(0, 6).map(p => {
                        const stock = p.stock === undefined || p.stock === null || p.stock === ''
                            ? null
                            : Number(p.stock);
                        const lowStock = stock !== null && stock <= 5;

                        return (
                        <tr key={p.id}>
                            <td>
                                <div className="table-product">
                                    <img src={p.image || 'https://placehold.co/900x900?text=NOVA+Product'} alt="" />
                                    <b>{p.name}</b>
                                </div>
                            </td>
                            <td>{p.category}</td>
                            <td>{money(p.price)}</td>
                            <td>{stock === null ? '—' : stock}</td>
                            <td>
                                <span className={'status ' + (lowStock ? 'pending' : 'delivered')}>
                                    {stock === null ? 'Not set' : lowStock ? 'Low stock' : 'Active'}
                                </span>
                            </td>
                            <td>
                                <button
                                    className="table-action"
                                    title="Edit product"
                                    aria-label={`Edit ${p.name}`}
                                    onClick={() => onEdit?.(p)}
                                    disabled={Boolean(deletingProductId)}
                                >
                                    <Pencil size={15} />
                                </button>
                                <button
                                    className="table-action danger"
                                    title="Delete product"
                                    aria-label={`Delete ${p.name}`}
                                    onClick={() => onDelete?.(p)}
                                    disabled={String(deletingProductId) === String(p.id)}
                                >
                                    {String(deletingProductId) === String(p.id) ? '…' : <Trash2 size={15} />}
                                </button>
                            </td>
                        </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

function CustomerDashboard({ account, onBack, onLogout }) {
    const [orders, setOrders] = useState([]);
    const [ordersLoading, setOrdersLoading] = useState(true);
    const [ordersError, setOrdersError] = useState('');

    useEffect(() => {
        let cancelled = false;
        async function loadOrders() {
            setOrdersLoading(true);
            setOrdersError('');
            try {
                const response = await fetch(`${API_BASE_URL}/api/orders/me`, {
                    credentials: 'include'
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.error || 'Unable to load your orders.');
                if (!cancelled) setOrders(Array.isArray(data.orders) ? data.orders : []);
            } catch (error) {
                if (!cancelled) setOrdersError(error.message || 'Unable to load your orders.');
            } finally {
                if (!cancelled) setOrdersLoading(false);
            }
        }
        loadOrders();
        return () => { cancelled = true; };
    }, []);

    return (
        <div className="admin-shell customer-shell">
            <aside className="admin-sidebar">
                <button className="wordmark admin-logo" onClick={onBack}>NOVA<span>.</span></button>
                <div className="admin-label">MY ACCOUNT</div>
                <div className="sidebar-bottom">
                    <div className="admin-profile">
                        <div className="avatar">{(account?.fullName || 'C').charAt(0).toUpperCase()}</div>
                        <div><b>{account?.fullName || 'Customer'}</b><span>Customer account</span></div>
                    </div>
                    <button className="admin-nav-item" onClick={onLogout}><LogOut size={17} /> Sign out</button>
                </div>
            </aside>

            <main className="admin-main">
                <header className="admin-top">
                    <div><span className="eyebrow muted">NOVA MARKET / CUSTOMER</span><h1>My Account</h1></div>
                    <button className="button button-dark" onClick={onLogout}>Sign out <LogOut size={15} /></button>
                </header>

                <section className="welcome-strip">
                    <div>
                        <span className="eyebrow gold-text">WELCOME TO NOVA</span>
                        <h2>Hello, {account?.fullName || 'there'}.</h2>
                        <p>Your NOVA shopping experience starts here.</p>
                    </div>
                    <button className="button button-gold" onClick={onBack}>Continue shopping <ArrowRight size={16} /></button>
                </section>

                <section className="panel">
                    <span className="eyebrow gold-text">ACCOUNT DETAILS</span>
                    <h3>Personal information</h3>
                    <p><b>Name:</b> {account?.fullName}</p>
                    <p><b>Email:</b> {account?.email}</p>
                    <p><b>Account type:</b> Customer</p>
                </section>

                <section className="panel customer-orders-panel" style={{ marginTop: 18 }}>
                    <div className="panel-head"><div><h3>My orders</h3><p>Your order history and delivery progress.</p></div></div>
                    {ordersLoading ? <p>Loading your orders…</p> : ordersError ? <p className="login-error">{ordersError}</p> : orders.length === 0 ? (
                        <div className="empty-orders"><Package size={30} /><p>You haven't placed an order yet.</p><button className="text-button" onClick={onBack}>Explore products <ArrowRight size={14} /></button></div>
                    ) : (
                        <div className="customer-order-list">
                            {orders.map(order => (
                                <article className="customer-order-card" key={order.orderId}>
                                    <div className="customer-order-top">
                                        <div><b>{order.orderId}</b><small>{order.createdAt ? new Date(order.createdAt).toLocaleString('en-IN') : ''}</small></div>
                                        <span className="status delivered">{order.status}</span>
                                    </div>
                                    <div className="customer-order-items">
                                        {order.items.map(item => <span key={item.productId}>{item.name} × {item.quantity}</span>)}
                                    </div>
                                    <div className="customer-order-bottom"><span>{order.paymentMethod}</span><strong>{money(order.total)}</strong></div>
                                </article>
                            ))}
                        </div>
                    )}
                </section>
            </main>
        </div>
    );
}

function AdminOrdersPanel() {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [updatingId, setUpdatingId] = useState('');
    const [success, setSuccess] = useState('');

    async function loadOrders() {
        setLoading(true);
        setError('');
        try {
            const response = await fetch(`${API_BASE_URL}/api/admin/orders`, { credentials: 'include' });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Unable to load orders.');
            setOrders(Array.isArray(data.orders) ? data.orders : []);
        } catch (err) {
            setError(err.message || 'Unable to load orders.');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { loadOrders(); }, []);

    async function changeStatus(orderId, status) {
        setError('');
        setSuccess('');
        setUpdatingId(orderId);
        try {
            const response = await fetch(`${API_BASE_URL}/api/admin/orders/${encodeURIComponent(orderId)}/status`, {
                method: 'PATCH',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Unable to update order status.');
            setOrders(current => current.map(order => order.orderId === orderId ? data.order : order));
            setSuccess(`Order ${orderId} updated to ${status}.`);
        } catch (err) {
            setError(err.message || 'Unable to update order status.');
        } finally {
            setUpdatingId('');
        }
    }

    return (
        <section className="panel table-panel admin-orders-panel">
            <div className="panel-head">
                <div><h3>Customer orders</h3><p>Orders placed through NOVA checkout.</p></div>
                <button className="button button-light" onClick={loadOrders} disabled={loading}><RotateCcw size={15} /> Refresh</button>
            </div>
            {success && <p className="order-success" role="status">{success}</p>}
            {error && <p className="login-error" role="alert">{error}</p>}
            {loading ? <p>Loading orders…</p> : orders.length === 0 ? (
                <div className="empty-orders"><Package size={30} /><p>No customer orders have been placed yet.</p></div>
            ) : (
                <div className="table-scroll">
                    <table>
                        <thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Total</th><th>Payment</th><th>Status</th></tr></thead>
                        <tbody>
                            {orders.map(order => (
                                <tr key={order.orderId}>
                                    <td><b>{order.orderId}</b><small className="order-date">{order.createdAt ? new Date(order.createdAt).toLocaleDateString('en-IN') : ''}</small></td>
                                    <td>{order.customerName}<small className="order-date">{order.customerEmail}</small></td>
                                    <td><div className="admin-order-items">{order.items.map(item => <span key={item.productId}>{item.name} × {item.quantity}</span>)}</div></td>
                                    <td><b>{money(order.total)}</b></td>
                                    <td>{order.paymentMethod}</td>
                                    <td>
                                        <select className="order-status-select" aria-label={`Status for ${order.orderId}`} value={order.status} disabled={updatingId === order.orderId} onChange={event => changeStatus(order.orderId, event.target.value)}>
                                            {['Placed', 'Confirmed', 'Processing', 'Shipped', 'Delivered'].map(status => <option key={status} value={status}>{status}</option>)}
                                        </select>
                                        {updatingId === order.orderId && <small>Saving…</small>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}

function AboutPage({ onExplore, onAccount, onExploreCategory }) {
    const [enteringCategory, setEnteringCategory] = useState('');
    const categoryTimer = useRef(null);
    useEffect(() => {
        window.scrollTo(0, 0);
        const root = document.querySelector('.nova-about-page');
        if (!root) return undefined;

        const revealItems = root.querySelectorAll('[data-reveal]');
        let observer;
        if ('IntersectionObserver' in window) {
            observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('is-visible');
                        observer.unobserve(entry.target);
                    }
                });
            }, { threshold: 0.14, rootMargin: '0px 0px -35px 0px' });
            revealItems.forEach(item => observer.observe(item));
        } else {
            revealItems.forEach(item => item.classList.add('is-visible'));
        }

        const story = root.querySelector('.am-scroll-story');
        const storyMeter = story?.querySelector('.am-story-progress span');
        const stage = root.querySelector('.am-hero-stage');
        const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
        let scrollFrame = 0;
        let pointerFrame = 0;
        let pointerPoint = null;
        const clamp = value => Math.max(0, Math.min(1, value));

        // Scroll-driven scene: measure once per animation frame, not for every scroll event.
        const updateScrollScene = () => {
            if (scrollFrame) return;
            scrollFrame = window.requestAnimationFrame(() => {
                scrollFrame = 0;
                if (!story) return;
                const rect = story.getBoundingClientRect();
                const travel = Math.max(1, story.offsetHeight - window.innerHeight);
                const progress = clamp(-rect.top / travel);
                const chapter = Math.min(2, Math.floor(progress * 3));
                story.dataset.chapter = String(chapter);
                story.style.setProperty('--story-rotate', `${((progress - 0.5) * 28).toFixed(2)}deg`);
                const shiftX = (0.5 - progress) * 145;
                const shiftY = (progress - 0.5) * 72;
                story.style.setProperty('--story-shift-x', `${shiftX.toFixed(1)}px`);
                story.style.setProperty('--story-shift-y', `${shiftY.toFixed(1)}px`);
                story.style.setProperty('--story-shift-inverse-x', `${(-shiftX).toFixed(1)}px`);
                story.style.setProperty('--story-shift-inverse-y', `${(-shiftY).toFixed(1)}px`);
                if (storyMeter) storyMeter.style.transform = `scaleX(${progress.toFixed(4)})`;
            });
        };

        // Keep the 3D tilt local to the hero stage and throttle pointer work to one RAF.
        const onPointerMove = event => {
            if (!stage || !canHover) return;
            pointerPoint = { x: event.clientX, y: event.clientY };
            if (pointerFrame) return;
            pointerFrame = window.requestAnimationFrame(() => {
                pointerFrame = 0;
                if (!pointerPoint || !stage) return;
                const bounds = stage.getBoundingClientRect();
                const x = (pointerPoint.x - bounds.left) / Math.max(1, bounds.width) - 0.5;
                const y = (pointerPoint.y - bounds.top) / Math.max(1, bounds.height) - 0.5;
                stage.style.setProperty('--pointer-rotate-x', `${(-y * 3.5).toFixed(2)}deg`);
                stage.style.setProperty('--pointer-rotate-y', `${(x * 4.5).toFixed(2)}deg`);
            });
        };
        const onPointerLeave = () => {
            pointerPoint = null;
            if (pointerFrame) {
                window.cancelAnimationFrame(pointerFrame);
                pointerFrame = 0;
            }
            if (stage) {
                stage.style.setProperty('--pointer-rotate-x', '0deg');
                stage.style.setProperty('--pointer-rotate-y', '0deg');
            }
        };

        window.addEventListener('scroll', updateScrollScene, { passive: true });
        window.addEventListener('resize', updateScrollScene);
        if (stage && canHover) {
            stage.addEventListener('pointermove', onPointerMove, { passive: true });
            stage.addEventListener('pointerleave', onPointerLeave, { passive: true });
        }
        updateScrollScene();

        return () => {
            if (observer) observer.disconnect();
            if (scrollFrame) window.cancelAnimationFrame(scrollFrame);
            if (pointerFrame) window.cancelAnimationFrame(pointerFrame);
            window.removeEventListener('scroll', updateScrollScene);
            window.removeEventListener('resize', updateScrollScene);
            if (stage && canHover) {
                stage.removeEventListener('pointermove', onPointerMove);
                stage.removeEventListener('pointerleave', onPointerLeave);
            }
        };
    }, []);

    useEffect(() => () => {
        if (categoryTimer.current) window.clearTimeout(categoryTimer.current);
    }, []);

    const chooseStoryCategory = category => {
        if (categoryTimer.current) window.clearTimeout(categoryTimer.current);
        setEnteringCategory(category);
        categoryTimer.current = window.setTimeout(() => {
            onExploreCategory(category);
        }, 560);
    };

    const jumpTo = id => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

    return (
        <div className="nova-about-page nova-about-immersive">
            {enteringCategory && (
                <div className="am-category-transition" role="status" aria-live="polite">
                    <div className="am-category-transition-orbit" aria-hidden="true" />
                    <span>OPENING THE NOVA COLLECTION</span>
                    <h2>{enteringCategory}</h2>
                    <p>One good find leads to another.</p>
                    <div className="am-category-transition-line"><i /></div>
                </div>
            )}
            <header className="am-topbar">
                <button className="am-wordmark" onClick={() => jumpTo('about-top')} aria-label="Back to top of NOVA story">NOVA<span>.</span></button>
                <nav className="am-nav" aria-label="About NOVA navigation">
                    <button onClick={() => jumpTo('about-story')}>The idea</button>
                    <button onClick={() => jumpTo('about-universe')}>The universe</button>
                    <button onClick={() => jumpTo('about-values')}>Our values</button>
                </nav>
                <div className="am-top-actions">
                    <button className="am-account" onClick={onAccount}>Account</button>
                    <span className="am-top-note">SCROLL TO DISCOVER <span aria-hidden="true">↓</span></span>
                </div>
            </header>

            <main>
                <section className="am-hero" id="about-top">
                    <div className="am-hero-grain" />
                    <div className="am-hero-copy">
                        <span className="am-kicker"><i /> AN EVERYDAY MARKET, REIMAGINED</span>
                        <h1>GOOD FINDS.<br /><em>GOOD DAYS.</em></h1>
                        <p>NOVA brings the things you use, love and live with into one considered place. Explore across categories, discover your next favourite and make the everyday feel a little more yours.</p>
                        <div className="am-hero-actions">
                            <button className="am-button am-button-gold" onClick={() => jumpTo('about-story')}>Discover our story <ArrowRight size={16} /></button>
                            <button className="am-scroll-link" onClick={() => jumpTo('about-universe')}>See what is inside <span>↓</span></button>
                        </div>
                        <div className="am-hero-footnote"><span className="am-footnote-star">✳</span><span><b>Thoughtful finds for real life.</b><small>STYLE · TECH · HOME · EVERYDAY</small></span></div>
                    </div>

                    <div className="am-hero-stage" aria-label="Floating three-dimensional product cards">
                        <div className="am-stage-grid" />
                        <div className="am-hero-ring am-ring-one" />
                        <div className="am-hero-ring am-ring-two" />
                        <div className="am-hero-core"><span>N</span><small>THE NOVA EDITION</small></div>
                        <div className="am-hero-word" aria-hidden="true">NOVA</div>
                        <article className="am-product-panel am-panel-main">
                            <img src="https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=760&q=78" alt="Wireless headphones" loading="eager" decoding="async" />
                            <div><small>01 / TECHNOLOGY</small><b>Find your focus.</b></div>
                        </article>
                        <article className="am-product-panel am-panel-side">
                            <img src="https://images.unsplash.com/photo-1548036328-c9fa89d128fa?auto=format&fit=crop&w=520&q=76" alt="Everyday tote bag" decoding="async" />
                            <div><small>02 / STYLE</small></div>
                        </article>
                        <article className="am-product-panel am-panel-low">
                            <img src="https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=520&q=76" alt="A warm table lamp" decoding="async" />
                            <div><small>03 / LIVING</small></div>
                        </article>
                        <div className="am-orbit-label am-orbit-label-one">GOOD THINGS / GOOD ENERGY</div>
                        <div className="am-orbit-label am-orbit-label-two">A MARKET FOR EVERYDAY</div>
                        <div className="am-stage-index">01 <span>—</span> 04</div>
                    </div>
                    <div className="am-hero-scroll"><span /> SCROLL TO ENTER THE NOVA UNIVERSE</div>
                </section>

                <section className="am-intro-band" id="about-story">
                    <div className="am-intro-index" data-reveal>01 / THE IDEA</div>
                    <div className="am-intro-content" data-reveal>
                        <span className="am-light-kicker">THE NOVA POINT OF VIEW</span>
                        <h2>Life is made of<br /><em>little discoveries.</em></h2>
                        <p>One day calls for a new essential. Another calls for a small upgrade, a fresh idea or something that simply makes you smile. NOVA is built around all those everyday moments — bringing different worlds together so finding something good feels effortless.</p>
                    </div>
                    <div className="am-intro-mark" aria-hidden="true">N.</div>
                </section>

                <section className="am-scroll-story" aria-label="The NOVA story in three chapters" data-chapter="0">
                    <div className="am-story-sticky">
                        <div className="am-story-gridlines" />
                        <div className="am-story-topline"><span>02 / THE NOVA UNIVERSE</span><span>SCROLL TO SHIFT THE SCENE</span></div>
                        <div className="am-story-orbit am-story-orbit-a" />
                        <div className="am-story-orbit am-story-orbit-b" />
                        <div className="am-story-disc"><span>N</span></div>
                        <div className="am-story-stack">
                            <div className="am-stack-card am-stack-card-one">
                                <img src="https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=700&q=85" alt="Smart watch" loading="lazy" decoding="async" />
                                <span>TECH / TIME</span>
                            </div>
                            <div className="am-stack-card am-stack-card-two">
                                <img src="https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=700&q=85" alt="Everyday fashion" loading="lazy" decoding="async" />
                                <span>STYLE / YOU</span>
                            </div>
                            <div className="am-stack-card am-stack-card-three">
                                <img src="https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?auto=format&fit=crop&w=700&q=85" alt="Skincare products" loading="lazy" decoding="async" />
                                <span>CARE / DAILY</span>
                            </div>
                        </div>
                        <div className="am-story-copy">
                            <article className="am-story-chapter" data-chapter="0">
                                <span>CHAPTER 01 / ONE PLACE</span>
                                <h2>Many sides<br />of <em>everyday.</em></h2>
                                <p>From technology to style, home to self-care — explore different categories in one place.</p>
                            </article>
                            <article className="am-story-chapter" data-chapter="1">
                                <span>CHAPTER 02 / YOUR KIND OF FIND</span>
                                <h2>Not just things.<br /><em>Your things.</em></h2>
                                <p>Browse at your pace. Follow a need, a mood or a little curiosity. The next favourite might be one scroll away.</p>
                            </article>
                            <article className="am-story-chapter" data-chapter="2">
                                <span>CHAPTER 03 / EVERYDAY, ELEVATED</span>
                                <h2>Small finds.<br /><em>Fresh feeling.</em></h2>
                                <p>Useful pieces and thoughtful details can make ordinary routines feel a little more special.</p>
                            </article>
                        </div>
                        <div className="am-story-progress"><span /></div>
                        <div className="am-story-side-note">NOVA MARKET · MADE FOR EVERYDAY</div>
                    </div>
                </section>

                <section className="am-universe" id="about-universe">
                    <div className="am-section-heading" data-reveal>
                        <div><span className="am-light-kicker">03 / WHAT'S INSIDE</span><h2>A little bit of<br /><em>everything.</em></h2></div>
                        <p>Different interests. Different routines. One place to explore the things that belong in your everyday.</p>
                    </div>
                    <div className="am-universe-grid">
                        <button type="button" className="am-universe-card am-universe-tech" data-reveal onClick={() => chooseStoryCategory('Electronics')} aria-label="Explore Technology products">
                            <img src="https://images.unsplash.com/photo-1498049794561-7780e7231661?auto=format&fit=crop&w=1200&q=85" alt="Technology and electronics" loading="lazy" decoding="async" />
                            <span className="am-universe-card-content"><span>01 / CONNECT</span><strong>Technology</strong><b>Explore electronics <span aria-hidden="true">↗</span></b></span>
                            <span className="am-universe-card-index" aria-hidden="true">01</span>
                        </button>
                        <button type="button" className="am-universe-card am-universe-style" data-reveal onClick={() => chooseStoryCategory('Fashion')} aria-label="Explore Fashion products">
                            <img src="https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1000&q=85" alt="Fashion and style" loading="lazy" decoding="async" />
                            <span className="am-universe-card-content"><span>02 / EXPRESS</span><strong>Style</strong><b>Make it yours <span aria-hidden="true">↗</span></b></span>
                            <span className="am-universe-card-index" aria-hidden="true">02</span>
                        </button>
                        <button type="button" className="am-universe-card am-universe-home" data-reveal onClick={() => chooseStoryCategory('Home & Living')} aria-label="Explore Home and Living products">
                            <img src="https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=1000&q=85" alt="Home and living" loading="lazy" decoding="async" />
                            <span className="am-universe-card-content"><span>03 / UNWIND</span><strong>Home & living</strong><b>Find your space <span aria-hidden="true">↗</span></b></span>
                            <span className="am-universe-card-index" aria-hidden="true">03</span>
                        </button>
                        <button type="button" className="am-universe-card am-universe-care" data-reveal onClick={() => chooseStoryCategory('Beauty')} aria-label="Explore Beauty products">
                            <img src="https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?auto=format&fit=crop&w=1000&q=85" alt="Beauty and self care" loading="lazy" decoding="async" />
                            <span className="am-universe-card-content"><span>04 / RESET</span><strong>Beauty & care</strong><b>A moment for you <span aria-hidden="true">↗</span></b></span>
                            <span className="am-universe-card-index" aria-hidden="true">04</span>
                        </button>
                        <button type="button" className="am-universe-card am-universe-fitness" data-reveal onClick={() => chooseStoryCategory('Sports & Fitness')} aria-label="Explore Sports and Fitness products">
                            <img src="https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=1000&q=85" alt="Sports and fitness" loading="lazy" decoding="async" />
                            <span className="am-universe-card-content"><span>05 / MOVE</span><strong>Sports & fitness</strong><b>Find your momentum <span aria-hidden="true">↗</span></b></span>
                            <span className="am-universe-card-index" aria-hidden="true">05</span>
                        </button>
                        <button type="button" className="am-universe-card am-universe-toys" data-reveal onClick={() => chooseStoryCategory('Toys & Games')} aria-label="Explore Toys and Games products">
                            <img src="https://images.unsplash.com/photo-1559454403-b8fb88521f11?auto=format&fit=crop&w=1000&q=85" alt="Toys and games" loading="lazy" decoding="async" />
                            <span className="am-universe-card-content"><span>06 / PLAY</span><strong>Toys & games</strong><b>Make room for fun <span aria-hidden="true">↗</span></b></span>
                            <span className="am-universe-card-index" aria-hidden="true">06</span>
                        </button>
                    </div>
                    <div className="am-universe-marquee" aria-hidden="true"><span>DISCOVER · EXPLORE · MAKE IT YOURS · </span><span>DISCOVER · EXPLORE · MAKE IT YOURS · </span></div>
                </section>

                <section className="am-manifesto" id="about-values">
                    <div className="am-manifesto-glow" />
                    <span className="am-light-kicker" data-reveal>04 / WHAT WE BELIEVE</span>
                    <h2 data-reveal>LESS NOISE.<br /><em>MORE GOOD FINDS.</em></h2>
                    <p data-reveal>Keep what is useful. Enjoy what feels special. Make space for the little things that make a day.</p>
                    <div className="am-manifesto-orbit" aria-hidden="true"><span>NOVA</span></div>
                </section>

                <section className="am-values">
                    <div className="am-values-heading" data-reveal>
                        <span className="am-light-kicker">05 / THE NOVA STANDARD</span>
                        <h2>Good finds<br />with <em>good intent.</em></h2>
                        <p>Three simple ideas shape the way we want NOVA to feel.</p>
                    </div>
                    <div className="am-values-cards">
                        <article className="am-value-card" data-reveal><span>01</span><div className="am-value-glyph">✳</div><h3>Thoughtful finds</h3><p>A considered mix of products and categories for the many parts of daily life.</p><b>CURIOUS BY NATURE ↗</b></article>
                        <article className="am-value-card am-value-dark" data-reveal><span>02</span><div className="am-value-glyph">◎</div><h3>Easy discovery</h3><p>A clear, welcoming experience that helps you browse and find what feels right.</p><b>FIND YOUR FLOW ↗</b></article>
                        <article className="am-value-card am-value-gold" data-reveal><span>03</span><div className="am-value-glyph">✧</div><h3>Everyday value</h3><p>Useful picks and small upgrades that fit into real routines and real lives.</p><b>MADE FOR EVERYDAY ↗</b></article>
                    </div>
                </section>

                <section className="am-final" id="about-explore" data-reveal>
                    <div className="am-final-backdrop" aria-hidden="true">NOVA</div>
                    <span className="am-light-kicker">YOU HAVE SEEN OUR WORLD</span>
                    <h2>Now find your<br /><em>something good.</em></h2>
                    <p>Your story with NOVA starts here. Step inside and explore the market.</p>
                    <button className="am-button am-button-light am-explore-button" onClick={onExplore} data-reveal>
                        <span>Explore</span><ArrowRight size={17} />
                    </button>
                    <span className="am-explore-caption">ENTER THE NOVA MARKET <span aria-hidden="true">✳</span></span>
                </section>
            </main>

            <footer className="am-footer">
                <button className="am-wordmark" onClick={() => jumpTo('about-top')}>NOVA<span>.</span></button>
                <span>GOOD FINDS FOR REAL LIFE.</span>
                <button onClick={() => jumpTo('about-top')}>BACK TO TOP ↑</button>
            </footer>
        </div>
    );
}

function App() {
    const [products, setProducts] = useState(initialProducts);
    const [query, setQuery] = useState('');
    const [activeCategory, setActiveCategory] = useState('All');
    const [cart, setCart] = useState([]);
    const [cartOpen, setCartOpen] = useState(false);
    const [checkoutOpen, setCheckoutOpen] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [wishlistOpen, setWishlistOpen] = useState(false);
    const [favorites, setFavorites] = useState(() => {
        try {
            const saved = JSON.parse(window.localStorage.getItem('nova_market_wishlist') || '[]');
            return Array.isArray(saved) ? saved.map(String) : [];
        } catch {
            return [];
        }
    });
    const hasPasswordResetLink = new URLSearchParams(window.location.search).has('resetToken');
    const [view, setView] = useState(() => hasPasswordResetLink ? 'login' : getPublicEntryView());

    // IMPORTANT: This account state is required for login and logout.
    const [account, setAccount] = useState(null);
    const [authChecking, setAuthChecking] = useState(true);

    const [sort, setSort] = useState('featured');
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [priceRange, setPriceRange] = useState('all');
    const [minimumRating, setMinimumRating] = useState('all');
    const [inStockOnly, setInStockOnly] = useState(false);
    const [toast, setToast] = useState('');
    const [categoryArrival, setCategoryArrival] = useState(false);
    const [pendingCategoryScroll, setPendingCategoryScroll] = useState(false);

    // Keep the wishlist on this browser between visits. Product IDs are strings
    // so Google Sheets IDs and demo numeric IDs compare consistently.
    useEffect(() => {
        try {
            window.localStorage.setItem('nova_market_wishlist', JSON.stringify(favorites));
        } catch (error) {
            console.warn('Unable to save the NOVA wishlist locally:', error);
        }
    }, [favorites]);

    const toggleFavorite = productId => {
        const id = String(productId);
        const alreadySaved = favorites.includes(id);
        setFavorites(current => current.includes(id)
            ? current.filter(savedId => savedId !== id)
            : [...current, id]
        );
        setToast(alreadySaved ? 'Removed from your wishlist.' : 'Added to your wishlist.');
        window.setTimeout(() => setToast(''), 2200);
    };

    const wishlistProducts = products.filter(product => favorites.includes(String(product.id)));

    // Single source of truth for every category click across the site.
    const navigateToCategory = category => {
        setQuery('');
        setActiveCategory(category);
        setSort('featured');
        setPriceRange('all');
        setMinimumRating('all');
        setInStockOnly(false);
        setFiltersOpen(false);
        setSelectedProduct(null);
        setCartOpen(false);
        setCheckoutOpen(false);
        setCategoryArrival(true);
        setPendingCategoryScroll(true);
        setView('storefront');
    };

    // Every category entry point (story cards, storefront cards and top navigation)
    // lands on the filtered product list after React has committed the storefront.
    useEffect(() => {
        if (view !== 'storefront' || !pendingCategoryScroll) return undefined;
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        let secondFrame = 0;
        const firstFrame = window.requestAnimationFrame(() => {
            // A second frame avoids racing the storefront's first layout after a view change.
            secondFrame = window.requestAnimationFrame(() => {
                const target = document.getElementById('shop');
                if (target) {
                    target.scrollIntoView({
                        behavior: reducedMotion ? 'auto' : 'smooth',
                        block: 'start'
                    });
                }
                setPendingCategoryScroll(false);
            });
        });
        return () => {
            window.cancelAnimationFrame(firstFrame);
            if (secondFrame) window.cancelAnimationFrame(secondFrame);
        };
    }, [view, pendingCategoryScroll]);

    useEffect(() => {
        if (!categoryArrival) return undefined;
        const timer = window.setTimeout(() => setCategoryArrival(false), 1750);
        return () => window.clearTimeout(timer);
    }, [categoryArrival]);

    // Reveal storefront surfaces only as they enter view. This uses one observer,
    // not a per-frame scroll listener, to keep the 3D storefront responsive.
    useEffect(() => {
        if (view !== 'storefront') return undefined;
        const root = document.querySelector('.nova-storefront-3d');
        if (!root) return undefined;
        const targets = Array.from(root.querySelectorAll('[data-store-reveal]'));
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reducedMotion || !('IntersectionObserver' in window)) {
            targets.forEach(target => target.classList.add('is-store-visible'));
            return undefined;
        }
        root.classList.add('has-store-reveal');
        const observer = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                entry.target.classList.add('is-store-visible');
                observer.unobserve(entry.target);
            });
        }, { threshold: 0.12, rootMargin: '0px 0px -35px 0px' });
        targets.forEach((target, index) => {
            target.style.setProperty('--store-reveal-delay', `${(index % 4) * 65}ms`);
            observer.observe(target);
        });
        return () => {
            observer.disconnect();
            root.classList.remove('has-store-reveal');
        };
    }, [view, products.length, activeCategory]);

    // Load public products from the backend.
    useEffect(() => {
        fetch(`${API_BASE_URL}/api/products`)
            .then(response => response.ok ? response.json() : null)
            .then(data => {
                if (Array.isArray(data) && data.length) {
                    setProducts(data);
                }
            })
            .catch(() => { });
    }, []);

    // Restore a valid login session when the page is refreshed.
    useEffect(() => {
        let cancelled = false;

        async function restoreSession() {
            try {
                const response = await fetch(
                    `${API_BASE_URL}/api/auth/me`,
                    { credentials: 'include' }
                );

                if (!response.ok) return;

                const data = await response.json();

                if (
                    !hasPasswordResetLink &&
                    data?.ok &&
                    (data.accountType === 'admin' ||
                        data.accountType === 'customer')
                ) {
                    if (!cancelled) {
                        setAccount({
                            ...data.account,
                            accountType: data.accountType
                        });
                        setView(data.accountType);
                    }
                }
            } catch (error) {
                console.error('Session restoration failed:', error);
            } finally {
                if (!cancelled) {
                    setAuthChecking(false);
                }
            }
        }

        restoreSession();

        return () => {
            cancelled = true;
        };
    }, []);

    const filtered = useMemo(
        () => products
            .filter(p => {
                const matchesCategory = activeCategory === 'All'
                    ? true
                    : activeCategory === 'Offers'
                        ? Number(p.oldPrice) > Number(p.price)
                        : p.category === activeCategory;
                const searchableText = `${p.name || ''} ${p.category || ''} ${p.description || ''} ${p.tag || ''}`.toLowerCase();
                const matchesSearch = scoreProductSearch(p, query) >= 0;
                const price = Number(p.price) || 0;
                const rating = Number(p.rating) || 0;
                const stock = Number(p.stock ?? 0);
                const matchesPrice = priceRange === 'all'
                    ? true
                    : priceRange === 'under-1000' ? price < 1000
                        : priceRange === '1000-2500' ? price >= 1000 && price <= 2500
                            : priceRange === '2500-5000' ? price > 2500 && price <= 5000
                                : priceRange === '5000-plus' ? price > 5000 : true;
                const matchesRating = minimumRating === 'all'
                    ? true
                    : rating >= Number(minimumRating);
                const matchesStock = !inStockOnly || (Number.isFinite(stock) && stock > 0);

                return matchesCategory && matchesSearch && matchesPrice && matchesRating && matchesStock;
            })
            .sort((a, b) =>
                sort === 'price-low' ? Number(a.price) - Number(b.price) :
                    sort === 'price-high' ? Number(b.price) - Number(a.price) :
                        sort === 'rating' ? Number(b.rating) - Number(a.rating) :
                            sort === 'reviews' ? Number(b.reviews) - Number(a.reviews) : 0
            ),
        [products, activeCategory, query, sort, priceRange, minimumRating, inStockOnly]
    );

    const activeShoppingFilterCount = Number(priceRange !== 'all') +
        Number(minimumRating !== 'all') + Number(inStockOnly);

    function clearShoppingFilters() {
        setQuery('');
        setActiveCategory('All');
        setSort('featured');
        setPriceRange('all');
        setMinimumRating('all');
        setInStockOnly(false);
        setFiltersOpen(false);
    }

    const addToCart = p => {
        setCart(old => {
            const found = old.find(x => x.id === p.id);

            return found
                ? old.map(x => x.id === p.id ? { ...x, qty: x.qty + 1 } : x)
                : [...old, { ...p, qty: 1 }];
        });

        setToast(`${p.name} added to your bag`);
        setTimeout(() => setToast(''), 2200);
    };

    const changeQty = (id, delta) => {
        setCart(old =>
            old
                .map(p => p.id === id ? { ...p, qty: p.qty + delta } : p)
                .filter(p => p.qty > 0)
        );
    };

    async function handlePlaceOrder(shippingAddress) {
        if (!account || account.accountType !== 'customer') {
            throw new Error('Please sign in with your customer account before checkout.');
        }

        const response = await fetch(`${API_BASE_URL}/api/orders`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                items: cart.map(item => ({ productId: String(item.id), quantity: item.qty })),
                shippingAddress
            })
        });

        let data = {};
        try { data = await response.json(); } catch { /* Use the fallback below. */ }
        if (!response.ok) {
            throw new Error(data.error || `Order could not be placed (HTTP ${response.status}).`);
        }

        setCart([]);
        setCheckoutOpen(false);
        setCartOpen(false);

        // Reload the public catalogue so newly reduced stock is reflected on the storefront.
        try {
            const productsResponse = await fetch(`${API_BASE_URL}/api/products`);
            if (productsResponse.ok) {
                const latestProducts = await productsResponse.json();
                if (Array.isArray(latestProducts)) setProducts(latestProducts);
            }
        } catch (error) {
            console.error('Product refresh after checkout failed:', error);
        }

        setToast(`Order ${data.order?.orderId || ''} placed successfully.`);
        setTimeout(() => setToast(''), 4500);
    }

    const handleLogout = async () => {
        try {
            await fetch(`${API_BASE_URL}/api/auth/logout`, {
                method: 'POST',
                credentials: 'include'
            });
        } catch (error) {
            console.error('Logout failed:', error);
        } finally {
            setAccount(null);
            setView(getPublicEntryView());
        }
    };

    // The server enforces the 30-minute idle timeout and 8-hour absolute
    // lifetime. Meaningful interactions refresh /api/auth/me at most every
    // five minutes. There is deliberately no client-only logout timer: browser
    // tabs share cookies, so an idle tab must not revoke another active tab.
    useEffect(() => {
        if (!account?.email) return undefined;

        const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;
        let lastHeartbeatAt = Date.now();
        let heartbeatInFlight = false;
        let expired = false;

        const expireLocalSession = () => {
            if (expired) return;
            expired = true;
            setAccount(null);
            setView(getPublicEntryView());
            setToast('Your NOVA session expired. Please sign in again.');
        };

        const refreshSession = async () => {
            if (heartbeatInFlight || Date.now() - lastHeartbeatAt < HEARTBEAT_INTERVAL_MS) return;
            heartbeatInFlight = true;
            try {
                const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
                    credentials: 'include',
                    cache: 'no-store'
                });
                const data = await response.json().catch(() => null);
                // /api/auth/me returns HTTP 200 with { ok:false } when the
                // browser has no session cookie, so check the payload too.
                if (!response.ok || !data?.ok || data.accountType !== account.accountType) {
                    expireLocalSession();
                    return;
                }
                lastHeartbeatAt = Date.now();
            } catch (error) {
                console.warn('Session activity refresh failed:', error);
                // Retry soon on the next user action after a transient network issue.
                lastHeartbeatAt = Date.now() - HEARTBEAT_INTERVAL_MS + 30_000;
            } finally {
                heartbeatInFlight = false;
            }
        };

        const onActivity = () => {
            if (document.visibilityState === 'hidden') return;
            refreshSession();
        };
        const events = ['pointerdown', 'keydown', 'touchstart', 'wheel'];
        events.forEach(eventName => window.addEventListener(eventName, onActivity, { passive: true }));
        document.addEventListener('visibilitychange', onActivity);

        return () => {
            events.forEach(eventName => window.removeEventListener(eventName, onActivity));
            document.removeEventListener('visibilitychange', onActivity);
        };
    }, [account?.email, account?.accountType]);

    // Do not display protected pages until session restoration is complete.
    if (authChecking) {
        return (
            <main className="login-screen">
                <section className="login-card">
                    <div className="login-logo">NOVA<span>.</span></div>
                    <p className="login-subtitle">Checking your session...</p>
                </section>
            </main>
        );
    }

    if (view === 'about') {
        return (
            <AboutPage
                onExplore={() => {
                    try {
                        window.localStorage.setItem('nova_market_intro_explored', 'true');
                    } catch (error) {
                        console.warn('Unable to remember the NOVA introduction:', error);
                    }
                    setView('storefront');
                    window.scrollTo({ top: 0, behavior: 'instant' });
                }}
                onAccount={() => setView(account ? account.accountType : 'login')}
                onExploreCategory={category => {
                    try {
                        window.localStorage.setItem('nova_market_intro_explored', 'true');
                    } catch (error) {
                        console.warn('Unable to remember the NOVA introduction:', error);
                    }
                    navigateToCategory(category);
                }}
            />
        );
    }

    if (view === 'login') {
        return (
            <LoginPage
                onBack={() => setView(getPublicEntryView())}
                onAuthenticated={data => {
                    setAccount({
                        ...data.account,
                        accountType: data.accountType
                    });
                    setView(data.accountType);
                }}
            />
        );
    }

    if (view === 'admin') {
        return (
            <AdminDashboard
                products={products}
                account={account}
                onBack={handleLogout}
                onProductSaved={savedProduct => {
                    setProducts(current => [
                        savedProduct,
                        ...current.filter(product => String(product.id) !== String(savedProduct.id))
                    ]);
                }}
                onProductDeleted={deletedId => {
                    setProducts(current => current.filter(product => String(product.id) !== String(deletedId)));
                }}
            />
        );
    }

    if (view === 'customer') {
        return (
            <CustomerDashboard
                account={account}
                onBack={() => setView('storefront')}
                onLogout={handleLogout}
            />
        );
    }

    return (
        <div className={`nova-storefront-3d${categoryArrival ? ' category-arrival' : ''}`}>
            <Header
                query={query}
                setQuery={setQuery}
                products={products}
                onSelectProduct={product => setSelectedProduct(product)}
                onSearchSubmit={() => {
                    setActiveCategory('All');
                    setFiltersOpen(false);
                    window.setTimeout(() => document.getElementById('shop')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
                }}
                cartCount={cart.reduce((s, p) => s + p.qty, 0)}
                wishlistCount={wishlistProducts.length}
                onWishlist={() => setWishlistOpen(true)}
                onCart={() => setCartOpen(true)}
                onAccount={() => {
                    if (account) {
                        setView(account.accountType);
                    } else {
                        setView('login');
                    }
                }}
                onAbout={() => setView('about')}
                activeCategory={activeCategory}
                setActiveCategory={setActiveCategory}
                onCategorySelect={navigateToCategory}
            />

            <main>
                <section className="hero">
                    <div className="hero-copy" data-store-reveal>
                        <div className="hero-kicker">
                            <span /> THE NOVA EDITION <span />
                        </div>

                        <h1>For every<br />part of <em>your life.</em></h1>

                        <p>
                            Thoughtful finds. Everyday icons. A better way to shop
                            everything you love — all in one place.
                        </p>

                        <div className="hero-actions">
                            <button
                                className="button button-gold"
                                onClick={() => navigateToCategory('All')}
                            >
                                Explore the collection <ArrowRight size={16} />
                            </button>

                            <button
                                className="text-button hero-link"
                                onClick={() => navigateToCategory('All')}
                            >
                                Discover NOVA <span>↗</span>
                            </button>
                        </div>

                        <div className="hero-proof">
                            <div className="proof-avatars">
                                <span>D</span><span>M</span><span>A</span><span>+</span>
                            </div>
                            <div>
                                <b>Loved by everyday explorers</b>
                                <span>Curated for quality, chosen for you</span>
                            </div>
                        </div>
                    </div>

                    <div className="hero-art" data-store-reveal>
                        <div className="hero-orbit orbit-one" />
                        <div className="hero-orbit orbit-two" />
                        <div className="hero-glow" />

                        <img
                            src="https://images.unsplash.com/photo-1498049794561-7780e7231661?auto=format&fit=crop&w=1400&q=90"
                            alt="A curated collection of modern technology and everyday essentials"
                        />

                        <div className="hero-art-label">
                            <span className="eyebrow">A LITTLE OF EVERYTHING</span>
                            <b>Made for your everyday.</b>
                        </div>

                        <div className="hero-number">01 <span>/ 04</span></div>
                    </div>

                    <div className="hero-side-note">
                        GOOD FINDS, GOOD FEELING <span>✳</span>
                    </div>
                </section>

                <section className="benefit-bar">
                    <div>
                        <Truck />
                        <span><b>Complimentary delivery</b><small>On orders above ₹999</small></span>
                    </div>
                    <div>
                        <RotateCcw />
                        <span><b>Easy returns</b><small>7-day return policy</small></span>
                    </div>
                    <div>
                        <ShieldCheck />
                        <span><b>Secure checkout</b><small>Your details stay protected</small></span>
                    </div>
                    <div>
                        <Headphones />
                        <span><b>Here to help</b><small>Friendly customer support</small></span>
                    </div>
                </section>

                <section className="section category-section">
                    <div className="section-heading" data-store-reveal>
                        <div>
                            <span className="eyebrow gold-text">FIND YOUR SOMETHING</span>
                            <h2>Shop by <em>category.</em></h2>
                            <p>A world of good things, in one place.</p>
                        </div>

                        <button
                            className="outline-button"
                            onClick={() => navigateToCategory('All')}
                        >
                            Explore all <ArrowRight size={15} />
                        </button>
                    </div>

                    <div className="category-grid">
                        {categories.map((c, i) => (
                            <button
                                data-store-reveal
                                className="category-card"
                                key={c.name}
                                onClick={() => navigateToCategory(c.name)}
                            >
                                <img src={c.image} alt="" />
                                <span className="category-shade" />
                                <span className="category-index">0{i + 1}</span>
                                <span className="category-name">
                                    {c.name}<ArrowRight size={15} />
                                </span>
                            </button>
                        ))}
                    </div>
                </section>

                <section className="section product-section" id="shop">
                    <div className="section-heading" data-store-reveal>
                        <div>
                            <span className="eyebrow gold-text">THE GOOD STUFF</span>
                            <h2>
                                {activeCategory === 'All' ? 'A few of our' :
                                    activeCategory === 'Offers' ? 'Offers worth' : 'The best in'}
                                {' '}
                                <em>
                                    {activeCategory === 'All' ? 'favourites.' :
                                        activeCategory === 'Offers' ? 'a look.' :
                                            activeCategory.toLowerCase() + '.'}
                                </em>
                            </h2>
                            <p>Considered picks for work, weekends and everything between.</p>
                        </div>

                        <div className="product-tools discovery-tools">
                            <button
                                type="button"
                                className={`discovery-filter-toggle ${filtersOpen ? 'is-active' : ''}`}
                                onClick={() => setFiltersOpen(open => !open)}
                                aria-expanded={filtersOpen}
                                aria-controls="shopping-discovery-filters"
                            >
                                <SlidersHorizontal size={15} />
                                Filters
                                {activeShoppingFilterCount > 0 && <span className="discovery-filter-count">{activeShoppingFilterCount}</span>}
                                <ChevronDown size={14} className={filtersOpen ? 'is-rotated' : ''} />
                            </button>
                            <label className="sort-select">
                                <span className="discovery-sort-label">Sort</span>
                                <select
                                    value={sort}
                                    onChange={e => setSort(e.target.value)}
                                    aria-label="Sort products"
                                >
                                    <option value="featured">Featured</option>
                                    <option value="price-low">Price: low to high</option>
                                    <option value="price-high">Price: high to low</option>
                                    <option value="rating">Top rated</option>
                                    <option value="reviews">Most reviewed</option>
                                </select>
                                <ChevronDown size={14} />
                            </label>
                        </div>
                    </div>

                    {filtersOpen && (
                        <div className="discovery-filters" id="shopping-discovery-filters">
                            <label className="discovery-filter-field">
                                <span>Price range</span>
                                <select value={priceRange} onChange={event => setPriceRange(event.target.value)}>
                                    <option value="all">Any price</option>
                                    <option value="under-1000">Under ₹1,000</option>
                                    <option value="1000-2500">₹1,000 – ₹2,500</option>
                                    <option value="2500-5000">₹2,501 – ₹5,000</option>
                                    <option value="5000-plus">Above ₹5,000</option>
                                </select>
                            </label>
                            <label className="discovery-filter-field">
                                <span>Minimum rating</span>
                                <select value={minimumRating} onChange={event => setMinimumRating(event.target.value)}>
                                    <option value="all">Any rating</option>
                                    <option value="3">3 stars & above</option>
                                    <option value="4">4 stars & above</option>
                                    <option value="4.5">4.5 stars & above</option>
                                </select>
                            </label>
                            <label className="discovery-stock-option">
                                <input type="checkbox" checked={inStockOnly} onChange={event => setInStockOnly(event.target.checked)} />
                                <span>In-stock products only</span>
                            </label>
                            <button type="button" className="discovery-clear-button" onClick={clearShoppingFilters}>
                                Clear all filters
                            </button>
                        </div>
                    )}

                    <div className="discovery-results-meta">
                        <span><strong>{filtered.length}</strong> {filtered.length === 1 ? 'product' : 'products'} found</span>
                        {(query || activeShoppingFilterCount > 0 || activeCategory !== 'All') && (
                            <button type="button" onClick={clearShoppingFilters}>Clear search & filters</button>
                        )}
                    </div>
                    {query && <p className="results-note">Showing matches for “{query}” across product names, categories, tags and descriptions.</p>}

                    <div className="products-grid">
                        {filtered.map(p => (
                            <ProductCard
                                key={p.id}
                                product={p}
                                onAdd={addToCart}
                                onOpen={setSelectedProduct}
                                favorite={favorites.includes(String(p.id))}
                                onFavorite={toggleFavorite}
                            />
                        ))}
                    </div>

                    {filtered.length === 0 && (
                        <div className="no-results">
                            <Search size={28} />
                            <h3>No finds just yet</h3>
                            <p>Try a different search or explore all products.</p>
                            <button
                                className="button button-dark"
                                onClick={() => {
                                    setQuery('');
                                    setActiveCategory('All');
                                }}
                            >
                                Clear filters
                            </button>
                        </div>
                    )}

                    <div className="center-action">
                        <button
                            className="outline-button"
                            onClick={() => navigateToCategory('All')}
                        >
                            View all products <ArrowRight size={15} />
                        </button>
                    </div>
                </section>

                <section className="editorial-banners">
                    <article className="editorial-card tech-card" data-store-reveal>
                        <img
                            src="https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=1200&q=85"
                            alt=""
                        />
                        <div className="editorial-overlay" />
                        <div className="editorial-content">
                            <span className="eyebrow">THE SMARTER SIDE OF LIFE</span>
                            <h2>Upgrade your<br /><em>everyday.</em></h2>
                            <button
                                className="button button-gold"
                                onClick={() => navigateToCategory('Electronics')}
                            >
                                Shop electronics <ArrowRight size={15} />
                            </button>
                        </div>
                    </article>

                    <article className="editorial-card style-card" data-store-reveal>
                        <img
                            src="https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1200&q=85"
                            alt=""
                        />
                        <div className="editorial-overlay" />
                        <div className="editorial-content">
                            <span className="eyebrow">YOUR STYLE, YOUR STORY</span>
                            <h2>Wear your<br /><em>own thing.</em></h2>
                            <button
                                className="button button-light"
                                onClick={() => navigateToCategory('Fashion')}
                            >
                                Explore fashion <ArrowRight size={15} />
                            </button>
                        </div>
                    </article>
                </section>

                <section className="newsletter" data-store-reveal>
                    <div>
                        <span className="eyebrow gold-text">A NOTE FROM NOVA</span>
                        <h2>Good things are <em>worth sharing.</em></h2>
                        <p>New finds, thoughtful edits and little perks. Only the good stuff.</p>
                    </div>

                    <form
                        onSubmit={e => {
                            e.preventDefault();
                            setToast('Thanks for your interest! Newsletter signup will be connected in a later stage.');
                            setTimeout(() => setToast(''), 3200);
                        }}
                    >
                        <label className="newsletter-input">
                            <input type="email" required placeholder="Your email address" />
                            <button type="submit" aria-label="Subscribe">
                                <ArrowRight />
                            </button>
                        </label>
                        <small>
                            By subscribing, you agree to receive NOVA updates. Unsubscribe anytime.
                        </small>
                    </form>
                </section>
            </main>

            <footer className="site-footer">
                <div className="footer-main">
                    <div className="footer-brand">
                        <button
                            className="wordmark"
                            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                        >
                            NOVA<span>.</span>
                        </button>
                        <p>Good finds for real life.<br />A little more thoughtful, every day.</p>

                        <div className="social-links">
                            <a href="#instagram">ig</a>
                            <a href="#pinterest">p</a>
                            <a href="#youtube">▶</a>
                        </div>
                    </div>

                    <div className="footer-col">
                        <b>Explore</b>
                        <button onClick={() => navigateToCategory('All')}>All products</button>
                        {categories.slice(0, 4).map(c => (
                            <button key={c.name} onClick={() => navigateToCategory(c.name)}>
                                {c.name}
                            </button>
                        ))}
                    </div>

                    <div className="footer-col">
                        <b>Need a hand?</b>
                        <a href="#contact">Contact us</a>
                        <a href="#shipping">Shipping & delivery</a>
                        <a href="#returns">Returns & exchanges</a>
                        <a href="#faq">FAQs</a>
                    </div>

                    <div className="footer-col">
                        <b>The details</b>
                        <button onClick={() => setView('about')}>Our story</button>
                        <a href="#privacy">Privacy policy</a>
                        <a href="#terms">Terms of service</a>
                    </div>
                </div>

                <div className="footer-bottom">
                    <span>© 2026 NOVA MARKET. MADE FOR EVERYDAY.</span>
                    <span>Thoughtful finds. Fair prices. Good energy.</span>
                    <span className="payment-types">UPI · VISA · COD</span>
                </div>
            </footer>

            {checkoutOpen && (
                <CheckoutModal
                    cart={cart}
                    account={account}
                    onClose={() => setCheckoutOpen(false)}
                    onPlaceOrder={handlePlaceOrder}
                />
            )}

            {cartOpen && (
                <CartDrawer
                    cart={cart}
                    onClose={() => setCartOpen(false)}
                    onChangeQty={changeQty}
                    onCheckout={() => {
                        setCartOpen(false);
                        if (!account) {
                            setView('login');
                            return;
                        }
                        if (account.accountType !== 'customer') {
                            setToast('Please sign out of the admin account and sign in as a customer to place an order.');
                            setTimeout(() => setToast(''), 4000);
                            return;
                        }
                        setCheckoutOpen(true);
                    }}
                />
            )}
            {wishlistOpen && (
                <WishlistDrawer
                    products={wishlistProducts}
                    onClose={() => setWishlistOpen(false)}
                    onRemove={toggleFavorite}
                    onAdd={product => {
                        addToCart(product);
                        setWishlistOpen(false);
                    }}
                />
            )}

            {selectedProduct && (
                <ProductModal
                    product={selectedProduct}
                    onClose={() => setSelectedProduct(null)}
                    onAdd={addToCart}
                    isFavorite={favorites.includes(String(selectedProduct.id))}
                    onFavorite={toggleFavorite}
                />
            )}

            {toast && (
                <div className="toast">
                    <span>✓</span>{toast}
                </div>
            )}
        </div>
    );
}

createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);