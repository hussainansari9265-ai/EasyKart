const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();

// --- SECURITY & MIDDLEWARES ---
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);
app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: 'Too many requests. Please try again later.' },
});
app.use('/api/', apiLimiter);

const JWT_SECRET = process.env.JWT_SECRET || 'easykart_jwt_secret_token_key_2026';
const MONGODB_URI = process.env.MONGODB_URI || '';
const DB_NAME = 'easykart_store';

// --- MONGODB CONNECTION CACHING ---
let cachedClient = null;
let cachedDb = null;

async function getDatabase() {
  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI is not set in environment variables.');
  }
  if (cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }
  const client = new MongoClient(MONGODB_URI, { maxPoolSize: 10 });
  await client.connect();
  const db = client.db(DB_NAME);

  cachedClient = client;
  cachedDb = db;

  // Auto-seed sample catalog if products collection is empty
  await autoSeedCatalog(db);
  return { client, db };
}

// --- ORDER NUMBER GENERATOR (#1001, #1002, ...) ---
async function getNextOrderNumber(db) {
  try {
    // First order will be 1001 (counter starts at 1000 and is incremented before use)
    await db
      .collection('counters')
      .updateOne({ _id: 'orderId' }, { $setOnInsert: { seq: 1000 } }, { upsert: true });
  } catch (e) {
    // Ignore duplicate key errors from concurrent first requests
  }
  const counter = await db
    .collection('counters')
    .findOneAndUpdate({ _id: 'orderId' }, { $inc: { seq: 1 } }, { returnDocument: 'after' });
  return counter.seq;
}

// --- SAMPLE DATA SEEDER ---
async function autoSeedCatalog(db) {
  try {
    const productsCount = await db.collection('products').countDocuments();
    if (productsCount === 0) {
      const sampleProducts = [
        {
          name: 'Wireless ANC Headphones Pro',
          category: 'Electronics',
          description: 'Active Noise Cancellation with 40h playtime and rich studio bass acoustics.',
          price: 2499,
          discountPrice: 1499,
          image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=700&q=80',
          stock: 35,
          rating: 4.8,
          badge: 'BESTSELLER',
          featured: true,
          createdAt: new Date(),
        },
        {
          name: 'Aura Pulse Smart Watch',
          category: 'Watches',
          description: 'AMOLED display, 24/7 SpO2 and Heart Rate tracking with waterproof alloy body.',
          price: 3999,
          discountPrice: 2299,
          image: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=700&q=80',
          stock: 22,
          rating: 4.7,
          badge: 'NEW',
          featured: true,
          createdAt: new Date(),
        },
        {
          name: "Men's Casual Indigo Knit Tee",
          category: "Men's Clothing",
          description: 'Ultra-soft combed organic cotton with relaxed clay-tone aesthetics.',
          price: 999,
          discountPrice: 599,
          image: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=700&q=80',
          stock: 60,
          rating: 4.6,
          badge: 'TRENDING',
          featured: true,
          createdAt: new Date(),
        },
        {
          name: 'Urban Luxe Vegan Handbag',
          category: "Women's Clothing",
          description: 'Contemporary structured silhouette with dual compartments and gold-tone accents.',
          price: 1899,
          discountPrice: 999,
          image: 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=700&q=80',
          stock: 18,
          rating: 4.9,
          badge: 'BESTSELLER',
          featured: true,
          createdAt: new Date(),
        },
        {
          name: 'CloudStride Pro Running Shoes',
          category: 'Shoes',
          description: 'Responsive foam cushioning designed for marathon comfort and daily sprints.',
          price: 2999,
          discountPrice: 1799,
          image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=700&q=80',
          stock: 45,
          rating: 4.8,
          badge: 'LIMITED',
          featured: true,
          createdAt: new Date(),
        },
        {
          name: 'BassSphere 360 Bluetooth Speaker',
          category: 'Electronics',
          description: 'Immersive omnidirectional sound with RGB ambient clay ring glow.',
          price: 2199,
          discountPrice: 1299,
          image: 'https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=700&q=80',
          stock: 28,
          rating: 4.5,
          badge: 'DEAL',
          featured: true,
          createdAt: new Date(),
        },
        {
          name: 'Polarized Aviator Sunglasses',
          category: 'Accessories',
          description: 'UV400 scratch-resistant TAC lenses housed in lightweight metal alloy frames.',
          price: 1199,
          discountPrice: 499,
          image: 'https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=700&q=80',
          stock: 50,
          rating: 4.4,
          badge: 'HOT',
          featured: true,
          createdAt: new Date(),
        },
        {
          name: 'Nomad Expandable Laptop Backpack',
          category: 'Accessories',
          description: 'Water-repellent 25L shell with dedicated 16-inch padded compartment and USB pass.',
          price: 1999,
          discountPrice: 899,
          image: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=700&q=80',
          stock: 30,
          rating: 4.7,
          badge: 'POPULAR',
          featured: true,
          createdAt: new Date(),
        },
        {
          name: 'RetroRGB Mechanical Keyboard',
          category: 'Electronics',
          description: 'Hot-swappable linear switches with clay-sculpted keycaps and sound dampening.',
          price: 2799,
          discountPrice: 1599,
          image: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=700&q=80',
          stock: 20,
          rating: 4.9,
          badge: 'NEW',
          featured: true,
          createdAt: new Date(),
        },
        {
          name: 'NovaGlow Smart Touch Lamp',
          category: 'Home & Living',
          description: 'Dimmable warm to cool LED illumination with stepless touch control and phone base.',
          price: 1499,
          discountPrice: 799,
          image: 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=700&q=80',
          stock: 40,
          rating: 4.6,
          badge: 'DEAL',
          featured: true,
          createdAt: new Date(),
        },
        {
          name: 'Heritage Classic Leather Watch',
          category: 'Watches',
          description: 'Japanese quartz movement with hand-stitched saddle brown genuine leather strap.',
          price: 2199,
          discountPrice: 1199,
          image: 'https://images.unsplash.com/photo-1524805444758-089113d48a6d?w=700&q=80',
          stock: 19,
          rating: 4.8,
          badge: 'BESTSELLER',
          featured: true,
          createdAt: new Date(),
        },
        {
          name: 'SilentGlide Ergonomic Mouse',
          category: 'Electronics',
          description: 'Rechargeable wireless ergonomic mouse with silent clicks and tri-mode Bluetooth.',
          price: 1299,
          discountPrice: 699,
          image: 'https://images.unsplash.com/photo-1615663245857-ac93bb7c39e7?w=700&q=80',
          stock: 55,
          rating: 4.7,
          badge: 'HOT',
          featured: true,
          createdAt: new Date(),
        },
      ];
      await db.collection('products').insertMany(sampleProducts);
    }

    const settingsCount = await db.collection('settings').countDocuments();
    if (settingsCount === 0) {
      await db.collection('settings').insertOne({
        storeName: 'EasyKart',
        tagline: 'Discover More. Shop Better.',
        phone: '+91 98765 43210',
        email: 'support@easykart.example',
        address: 'Main Market, New Delhi, India',
        freeShippingThreshold: 999,
        shippingFee: 99,
        promoBanner: 'Festive Clay Sale: Flat 40% OFF with code EASYKART40',
        currency: '₹',
        updatedAt: new Date(),
      });
    }
  } catch (err) {
    console.error('Error during auto-seed:', err.message);
  }
}

// --- AUTH TOKEN HELPER ---
function authenticateUser(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Please login to continue.' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired session. Please log in again.' });
  }
}

// ==================== REST APIS ====================

// 1. Get Store Info & Settings
app.get('/api/store-info', async (req, res) => {
  try {
    const { db } = await getDatabase();
    let settings = await db.collection('settings').findOne({});
    if (!settings) {
      settings = {
        storeName: 'EasyKart',
        tagline: 'Discover More. Shop Better.',
        phone: '+91 98765 43210',
        email: 'support@easykart.example',
        address: 'Main Market, New Delhi, India',
        freeShippingThreshold: 999,
        shippingFee: 99,
        promoBanner: 'Festive Clay Sale: Flat 40% OFF with code EASYKART40',
        currency: '₹',
      };
    }
    res.json({ success: true, settings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Products List (with category, search, sort)
app.get('/api/products', async (req, res) => {
  try {
    const { db } = await getDatabase();
    const { category, search, sort, featured } = req.query;
    const query = {};

    if (category && category !== 'All') {
      query.category = category;
    }
    if (search && search.trim() !== '') {
      query.$or = [
        { name: { $regex: search.trim(), $options: 'i' } },
        { description: { $regex: search.trim(), $options: 'i' } },
        { category: { $regex: search.trim(), $options: 'i' } },
      ];
    }
    if (featured === 'true') {
      query.featured = true;
    }

    let sortOptions = { createdAt: -1 };
    if (sort === 'price-low') sortOptions = { discountPrice: 1 };
    if (sort === 'price-high') sortOptions = { discountPrice: -1 };
    if (sort === 'rating') sortOptions = { rating: -1 };

    const products = await db.collection('products').find(query).sort(sortOptions).toArray();
    res.json({ success: true, products });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Single Product Details
app.get('/api/products/:id', async (req, res) => {
  try {
    const { db } = await getDatabase();
    const product = await db.collection('products').findOne({ _id: new ObjectId(req.params.id) });
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json({ success: true, product });
  } catch (err) {
    res.status(500).json({ error: 'Invalid product ID' });
  }
});

// 4. Customer Registration
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;
    if (!name || !email || !password || !phone) {
      return res.status(400).json({ error: 'All fields are required.' });
    }
    const { db } = await getDatabase();
    const existing = await db.collection('users').findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(400).json({ error: 'Email is already registered. Please log in.' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await db.collection('users').insertOne({
      name,
      email: email.toLowerCase(),
      phone,
      password: hashedPassword,
      wishlist: [],
      address: null,
      createdAt: new Date(),
    });
    const token = jwt.sign({ id: result.insertedId, email: email.toLowerCase(), name }, JWT_SECRET, {
      expiresIn: '7d',
    });
    res.status(201).json({
      success: true,
      message: 'Registration successful!',
      token,
      user: { id: result.insertedId, name, email, phone },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Customer Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }
    const { db } = await getDatabase();
    const user = await db.collection('users').findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    const token = jwt.sign({ id: user._id, email: user.email, name: user.name }, JWT_SECRET, {
      expiresIn: '7d',
    });
    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        address: user.address,
        wishlist: user.wishlist || [],
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Customer Profile & Wishlist Sync
app.get('/api/auth/me', authenticateUser, async (req, res) => {
  try {
    const { db } = await getDatabase();
    const user = await db.collection('users').findOne({ _id: new ObjectId(req.user.id) });
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        address: user.address,
        wishlist: user.wishlist || [],
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Toggle Wishlist
app.post('/api/wishlist/toggle', authenticateUser, async (req, res) => {
  try {
    const { productId } = req.body;
    const { db } = await getDatabase();
    const user = await db.collection('users').findOne({ _id: new ObjectId(req.user.id) });
    let wishlist = user.wishlist || [];
    if (wishlist.includes(productId)) {
      wishlist = wishlist.filter((id) => id !== productId);
    } else {
      wishlist.push(productId);
    }
    await db.collection('users').updateOne({ _id: new ObjectId(req.user.id) }, { $set: { wishlist } });
    res.json({ success: true, wishlist });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 8. Place Order
app.post('/api/orders/place', async (req, res) => {
  try {
    const { customer, shippingAddress, items, paymentMethod } = req.body;
    if (!customer || !shippingAddress || !items || !items.length) {
      return res.status(400).json({ error: 'Incomplete order payload.' });
    }
    const { db } = await getDatabase();
    const settings = (await db.collection('settings').findOne({})) || {
      freeShippingThreshold: 999,
      shippingFee: 99,
    };

    let subtotal = 0;
    const processedItems = [];

    for (const it of items) {
      let prod = null;
      try {
        prod = await db.collection('products').findOne({ _id: new ObjectId(it.productId) });
      } catch (e) {
        prod = null;
      }
      const price = prod ? prod.discountPrice : it.price;
      const title = prod ? prod.name : it.name;
      const img = prod ? prod.image : it.image;
      const quantity = Math.max(1, parseInt(it.quantity) || 1);

      subtotal += price * quantity;
      processedItems.push({
        productId: it.productId,
        name: title,
        price,
        quantity,
        image: img,
      });

      // Update product stock safely
      if (prod && prod.stock >= quantity) {
        await db
          .collection('products')
          .updateOne({ _id: new ObjectId(it.productId) }, { $inc: { stock: -quantity } });
      }
    }

    const shippingCharge = subtotal >= settings.freeShippingThreshold ? 0 : settings.shippingFee;
    const totalAmount = subtotal + shippingCharge;
    const orderNumber = await getNextOrderNumber(db);
    const orderId = '#' + orderNumber;

    const newOrder = {
      orderId,
      orderNumber,
      customer: {
        name: customer.name.trim(),
        phone: customer.phone.trim(),
        email: customer.email.trim().toLowerCase(),
      },
      shippingAddress: {
        address: shippingAddress.address,
        city: shippingAddress.city,
        state: shippingAddress.state,
        pincode: shippingAddress.pincode,
      },
      items: processedItems,
      subtotal,
      shippingCharge,
      totalAmount,
      paymentMethod: paymentMethod || 'Cash on Delivery',
      paymentStatus: paymentMethod === 'UPI (Demo)' ? 'Demo Verified' : 'Pending Payment',
      orderStatus: 'Confirmed',
      createdAt: new Date(),
    };

    await db.collection('orders').insertOne(newOrder);

    // If customer provided address, optionally persist to user record
    if (customer.email) {
      await db
        .collection('users')
        .updateOne(
          { email: customer.email.toLowerCase() },
          { $set: { address: shippingAddress, phone: customer.phone } }
        );
    }

    res.status(201).json({
      success: true,
      message: 'Order placed successfully!',
      orderId,
      order: newOrder,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 9. Track Order by ID and Phone
app.get('/api/orders/track', async (req, res) => {
  try {
    const { orderId, phone } = req.query;
    if (!orderId || !phone) {
      return res.status(400).json({ error: 'Order ID and Phone Number are required.' });
    }
    let normalizedOrderId = orderId.trim().toUpperCase();
    if (!normalizedOrderId.startsWith('#')) {
      normalizedOrderId = '#' + normalizedOrderId;
    }
    const { db } = await getDatabase();
    const order = await db.collection('orders').findOne({
      orderId: normalizedOrderId,
      'customer.phone': phone.trim(),
    });
    if (!order) {
      return res.status(404).json({ error: 'No matching order found. Please verify details.' });
    }
    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 10. Customer Order History
app.get('/api/orders/my-orders', authenticateUser, async (req, res) => {
  try {
    const { db } = await getDatabase();
    const orders = await db
      .collection('orders')
      .find({ 'customer.email': req.user.email })
      .sort({ createdAt: -1 })
      .toArray();
    res.json({ success: true, orders });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== FRONTEND UI SERVING ====================
app.get('*', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>EasyKart | Discover More. Shop Better.</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary: #7957E8;
      --primary-hover: #6845db;
      --secondary: #FF8178;
      --accent: #72C9F5;
      --bg: #F5F2FF;
      --card-bg: #FFFFFF;
      --text: #24213B;
      --text-muted: #6C668D;
      --success: #38B982;
      --border-clay: rgba(121, 87, 232, 0.08);
      --clay-shadow-out: 12px 14px 28px rgba(121, 87, 232, 0.12), -10px -10px 24px #FFFFFF;
      --clay-shadow-in: inset 3px 3px 6px rgba(255, 255, 255, 0.8), inset -3px -3px 6px rgba(121, 87, 232, 0.12);
      --clay-card-shadow: 16px 18px 36px rgba(121, 87, 232, 0.11), -14px -14px 30px #FFFFFF, inset 2px 2px 4px rgba(255, 255, 255, 0.9), inset -2px -2px 4px rgba(121, 87, 232, 0.06);
      --clay-btn-shadow: 6px 8px 18px rgba(121, 87, 232, 0.32), inset 2px 2px 4px rgba(255, 255, 255, 0.5), inset -2px -2px 4px rgba(0, 0, 0, 0.12);
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      font-family: 'Plus Jakarta Sans', sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    body {
      background-color: var(--bg);
      color: var(--text);
      overflow-x: hidden;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    /* Clay Utility Styles */
    .clay-card {
      background: var(--card-bg);
      border-radius: 28px;
      box-shadow: var(--clay-card-shadow);
      border: 1px solid rgba(255, 255, 255, 0.7);
      transition: transform 0.28s ease, box-shadow 0.28s ease;
    }
    .clay-card:hover {
      transform: translateY(-4px);
      box-shadow: 18px 22px 42px rgba(121, 87, 232, 0.16), -14px -14px 32px #FFFFFF;
    }
    .clay-btn {
      background: var(--primary);
      color: #FFFFFF;
      border: none;
      border-radius: 50px;
      padding: 12px 24px;
      font-size: 0.95rem;
      font-weight: 700;
      cursor: pointer;
      box-shadow: var(--clay-btn-shadow);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      transition: all 0.2s ease;
      text-decoration: none;
    }
    .clay-btn:hover {
      background: var(--primary-hover);
      transform: translateY(-2px);
    }
    .clay-btn:active {
      transform: scale(0.97);
      box-shadow: inset 3px 3px 6px rgba(0,0,0,0.25);
    }
    .clay-btn-secondary {
      background: var(--secondary);
      box-shadow: 6px 8px 18px rgba(255, 129, 120, 0.35), inset 2px 2px 4px rgba(255,255,255,0.6);
    }
    .clay-btn-secondary:hover {
      background: #f76e65;
    }
    .clay-btn-outline {
      background: #FFFFFF;
      color: var(--primary);
      box-shadow: var(--clay-shadow-out);
    }
    .clay-btn-outline:hover {
      background: #F9F7FF;
      color: var(--primary-hover);
    }
    .clay-badge {
      display: inline-block;
      padding: 5px 12px;
      border-radius: 50px;
      font-size: 0.72rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      box-shadow: 3px 3px 8px rgba(0,0,0,0.06), inset 1px 1px 2px rgba(255,255,255,0.8);
    }
    .badge-bestseller { background: #FFE8E6; color: #FF4D3D; }
    .badge-new { background: #E6F8F0; color: #189862; }
    .badge-deal { background: #FFF4DC; color: #C47900; }
    .badge-trending { background: #EAE4FF; color: #6236E2; }
    
    .clay-input {
      width: 100%;
      background: #FAF8FF;
      border: 1px solid rgba(121, 87, 232, 0.15);
      border-radius: 18px;
      padding: 12px 18px;
      font-size: 0.95rem;
      color: var(--text);
      outline: none;
      box-shadow: inset 3px 3px 6px rgba(121, 87, 232, 0.08), inset -3px -3px 6px #FFFFFF;
      transition: all 0.2s ease;
    }
    .clay-input:focus {
      border-color: var(--primary);
      box-shadow: 0 0 0 3px rgba(121, 87, 232, 0.2), inset 2px 2px 4px rgba(121, 87, 232, 0.06);
    }
    /* Announcement Banner */
    .announcement-bar {
      background: linear-gradient(90deg, #7957E8 0%, #FF8178 100%);
      color: #fff;
      font-size: 0.85rem;
      font-weight: 600;
      text-align: center;
      padding: 8px 16px;
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 12px;
    }
    /* Top Header */
    header {
      position: sticky;
      top: 0;
      z-index: 99;
      background: rgba(245, 242, 255, 0.92);
      backdrop-filter: blur(14px);
      border-bottom: 1px solid rgba(121, 87, 232, 0.08);
      padding: 14px 24px;
    }
    .nav-container {
      max-width: 1320px;
      margin: 0 auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 20px;
    }
    .logo-box {
      display: flex;
      align-items: center;
      gap: 10px;
      text-decoration: none;
    }
    .logo-badge {
      width: 44px;
      height: 44px;
      border-radius: 16px;
      background: linear-gradient(135deg, var(--primary), var(--secondary));
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      font-size: 1.4rem;
      font-weight: 800;
      box-shadow: var(--clay-btn-shadow);
    }
    .logo-text h1 {
      font-size: 1.35rem;
      font-weight: 800;
      color: var(--text);
      letter-spacing: -0.5px;
      line-height: 1;
    }
    .logo-text p {
      font-size: 0.68rem;
      color: var(--text-muted);
      font-weight: 700;
      letter-spacing: 1px;
      text-transform: uppercase;
      margin-top: 2px;
    }
    .nav-links {
      display: flex;
      align-items: center;
      list-style: none;
      gap: 24px;
    }
    .nav-links a {
      text-decoration: none;
      color: var(--text);
      font-weight: 600;
      font-size: 0.9rem;
      transition: color 0.2s;
    }
    .nav-links a:hover {
      color: var(--primary);
    }
    .nav-actions {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .icon-clay-btn {
      position: relative;
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: #FFFFFF;
      border: none;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: var(--clay-shadow-out);
      transition: transform 0.2s;
      color: var(--text);
      font-size: 1.1rem;
    }
    .icon-clay-btn:hover {
      transform: translateY(-2px);
    }
    .icon-badge {
      position: absolute;
      top: -3px;
      right: -3px;
      background: var(--secondary);
      color: #fff;
      font-size: 0.68rem;
      font-weight: 800;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 2px 2px 6px rgba(255, 129, 120, 0.4);
    }
    .mobile-menu-btn {
      display: none;
      background: #fff;
      border: none;
      font-size: 1.3rem;
      padding: 8px 12px;
      border-radius: 12px;
      cursor: pointer;
      box-shadow: var(--clay-shadow-out);
    }

    /* Hero Section */
    .hero-section {
      max-width: 1320px;
      margin: 24px auto;
      padding: 0 20px;
    }
    .hero-clay-banner {
      background: linear-gradient(135deg, #FFFFFF 0%, #FAF7FF 50%, #ECE6FF 100%);
      border-radius: 36px;
      padding: 60px 48px;
      display: grid;
      grid-template-columns: 1.2fr 0.8fr;
      align-items: center;
      gap: 40px;
      box-shadow: var(--clay-card-shadow);
      position: relative;
      overflow: hidden;
    }
    .hero-badge-pill {
      background: #EAE4FF;
      color: var(--primary);
      padding: 6px 16px;
      border-radius: 50px;
      font-size: 0.8rem;
      font-weight: 700;
      display: inline-block;
      margin-bottom: 16px;
    }
    .hero-clay-banner h2 {
      font-size: 3.1rem;
      font-weight: 800;
      line-height: 1.15;
      letter-spacing: -1px;
      color: var(--text);
      margin-bottom: 18px;
    }
    .hero-clay-banner h2 span {
      background: linear-gradient(135deg, var(--primary), var(--secondary));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .hero-clay-banner p {
      font-size: 1.05rem;
      color: var(--text-muted);
      line-height: 1.6;
      margin-bottom: 28px;
      max-width: 520px;
    }
    .hero-btns {
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
    }
    .hero-art-col {
      position: relative;
      display: flex;
      justify-content: center;
      align-items: center;
    }
    .hero-main-card {
      width: 100%;
      max-width: 380px;
      border-radius: 32px;
      background: #FFFFFF;
      padding: 16px;
      box-shadow: 20px 24px 44px rgba(121, 87, 232, 0.18), -12px -12px 30px #FFFFFF;
      transform: rotate(2deg);
      transition: transform 0.4s ease;
    }
    .hero-main-card:hover {
      transform: rotate(0deg) scale(1.02);
    }
    .hero-main-card img {
      width: 100%;
      height: 280px;
      object-fit: cover;
      border-radius: 24px;
    }
    .floating-clay-tag {
      position: absolute;
      background: #FFFFFF;
      padding: 12px 20px;
      border-radius: 20px;
      box-shadow: 10px 14px 28px rgba(0,0,0,0.1), -8px -8px 20px #FFFFFF;
      display: flex;
      align-items: center;
      gap: 12px;
      animation: floatTag 4s ease-in-out infinite alternate;
    }
    .tag-top-left { top: 10px; left: -20px; }
    .tag-bottom-right { bottom: 0px; right: -10px; animation-delay: 2s; }
    @keyframes floatTag {
      0% { transform: translateY(0); }
      100% { transform: translateY(-10px); }
    }

    /* Category Section */
    .section-wrap {
      max-width: 1320px;
      margin: 40px auto;
      padding: 0 20px;
    }
    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      margin-bottom: 24px;
    }
    .section-title h3 {
      font-size: 1.8rem;
      font-weight: 800;
      color: var(--text);
      letter-spacing: -0.5px;
    }
    .section-title p {
      font-size: 0.9rem;
      color: var(--text-muted);
      margin-top: 4px;
    }
    .category-scroll-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
      gap: 16px;
    }
    .category-clay-item {
      background: #FFFFFF;
      border-radius: 22px;
      padding: 18px 10px;
      text-align: center;
      cursor: pointer;
      box-shadow: var(--clay-card-shadow);
      transition: all 0.22s ease;
      text-decoration: none;
      color: var(--text);
      display: flex;
      flex-direction: column;
      align-items: center;
      border: 2px solid transparent;
    }
    .category-clay-item:hover, .category-clay-item.active {
      transform: translateY(-4px);
      border-color: var(--primary);
      background: #FAF8FF;
    }
    .category-icon-circle {
      width: 58px;
      height: 58px;
      border-radius: 50%;
      background: linear-gradient(135deg, #F5F2FF, #ECE6FF);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.6rem;
      margin-bottom: 10px;
      box-shadow: inset 2px 2px 4px #FFFFFF, inset -2px -2px 4px rgba(121, 87, 232, 0.15);
    }
    .category-name {
      font-size: 0.82rem;
      font-weight: 700;
    }

    /* Filter & Search Bar */
    .filter-bar-clay {
      background: #FFFFFF;
      border-radius: 24px;
      padding: 16px 20px;
      box-shadow: var(--clay-card-shadow);
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      margin-bottom: 30px;
    }
    .search-input-wrap {
      flex: 1;
      min-width: 260px;
      position: relative;
    }
    .sort-group {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .sort-select {
      background: #FAF8FF;
      border: 1px solid rgba(121, 87, 232, 0.15);
      border-radius: 16px;
      padding: 10px 16px;
      font-size: 0.88rem;
      font-weight: 600;
      color: var(--text);
      outline: none;
      cursor: pointer;
    }

    /* Product Grid */
    .products-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(270px, 1fr));
      gap: 24px;
    }
    .product-card {
      background: #FFFFFF;
      border-radius: 26px;
      padding: 16px;
      box-shadow: var(--clay-card-shadow);
      display: flex;
      flex-direction: column;
      position: relative;
      transition: all 0.25s ease;
    }
    .product-card:hover {
      transform: translateY(-5px);
    }
    .product-img-box {
      width: 100%;
      height: 220px;
      border-radius: 20px;
      overflow: hidden;
      position: relative;
      background: #F8F6FF;
    }
    .product-img-box img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      transition: transform 0.35s ease;
    }
    .product-card:hover .product-img-box img {
      transform: scale(1.05);
    }
    .product-badge-corner {
      position: absolute;
      top: 10px;
      left: 10px;
      z-index: 2;
    }
    .wishlist-heart-btn {
      position: absolute;
      top: 10px;
      right: 10px;
      background: rgba(255, 255, 255, 0.9);
      backdrop-filter: blur(8px);
      width: 36px;
      height: 36px;
      border-radius: 50%;
      border: none;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      font-size: 1.1rem;
      box-shadow: 2px 4px 10px rgba(0,0,0,0.08);
      transition: transform 0.2s;
      z-index: 2;
    }
    .wishlist-heart-btn.active {
      color: #FF4D3D;
    }
    .product-details {
      padding: 14px 4px 6px;
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .product-cat {
      font-size: 0.75rem;
      font-weight: 700;
      color: var(--primary);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .product-title {
      font-size: 1rem;
      font-weight: 700;
      color: var(--text);
      margin: 4px 0 6px;
      line-height: 1.3;
      cursor: pointer;
    }
    .product-rating {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 0.8rem;
      font-weight: 700;
      color: #FFA41C;
      margin-bottom: 12px;
    }
    .price-action-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: auto;
    }
    .price-box {
      display: flex;
      flex-direction: column;
    }
    .discount-price {
      font-size: 1.25rem;
      font-weight: 800;
      color: var(--text);
    }
    .original-price {
      font-size: 0.82rem;
      color: var(--text-muted);
      text-decoration: line-through;
    }
    .add-cart-clay-btn {
      background: var(--primary);
      color: #fff;
      border: none;
      padding: 9px 18px;
      border-radius: 50px;
      font-size: 0.85rem;
      font-weight: 700;
      cursor: pointer;
      box-shadow: var(--clay-btn-shadow);
      display: flex;
      align-items: center;
      gap: 6px;
      transition: all 0.2s ease;
    }
    .add-cart-clay-btn:hover {
      background: var(--primary-hover);
      transform: translateY(-2px);
    }

    /* Advantages Section */
    .perks-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 20px;
      margin: 40px auto;
    }
    .perk-card {
      background: #FFFFFF;
      border-radius: 24px;
      padding: 24px;
      box-shadow: var(--clay-card-shadow);
      display: flex;
      align-items: center;
      gap: 18px;
    }
    .perk-icon-clay {
      width: 56px;
      height: 56px;
      border-radius: 20px;
      background: #F5F2FF;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.6rem;
      box-shadow: inset 2px 2px 5px rgba(255,255,255,0.9), inset -2px -2px 5px rgba(121, 87, 232, 0.15);
      flex-shrink: 0;
    }
    .perk-text h4 {
      font-size: 0.98rem;
      font-weight: 800;
      color: var(--text);
    }
    .perk-text p {
      font-size: 0.8rem;
      color: var(--text-muted);
      margin-top: 2px;
    }

    /* Testimonials */
    .testimonial-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 20px;
    }
    .testimonial-card {
      background: #FFFFFF;
      border-radius: 26px;
      padding: 26px;
      box-shadow: var(--clay-card-shadow);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .review-user-row {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-top: 18px;
    }
    .review-avatar {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: linear-gradient(135deg, var(--accent), var(--primary));
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      font-weight: 800;
      font-size: 1rem;
    }

    /* Newsletter Section */
    .newsletter-clay {
      background: linear-gradient(135deg, #7957E8 0%, #6236E2 100%);
      border-radius: 34px;
      padding: 50px 30px;
      text-align: center;
      color: #fff;
      box-shadow: 18px 24px 44px rgba(121, 87, 232, 0.35);
      margin: 40px auto;
    }
    .newsletter-clay h3 {
      font-size: 2.2rem;
      font-weight: 800;
      margin-bottom: 8px;
    }
    .newsletter-form-row {
      max-width: 500px;
      margin: 24px auto 0;
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
    }
    .newsletter-form-row input {
      flex: 1;
      min-width: 240px;
      background: #fff;
      border-radius: 50px;
      padding: 14px 22px;
      border: none;
      font-size: 0.95rem;
      outline: none;
    }

    /* Footer */
    footer {
      background: #FFFFFF;
      border-top: 1px solid rgba(121, 87, 232, 0.08);
      margin-top: auto;
      padding: 50px 20px 24px;
    }
    .footer-container {
      max-width: 1320px;
      margin: 0 auto;
      display: grid;
      grid-template-columns: 2fr 1fr 1fr 1fr;
      gap: 40px;
    }
    .footer-col h5 {
      font-size: 1rem;
      font-weight: 800;
      color: var(--text);
      margin-bottom: 16px;
    }
    .footer-col ul {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .footer-col ul a {
      text-decoration: none;
      color: var(--text-muted);
      font-size: 0.88rem;
      transition: color 0.2s;
    }
    .footer-col ul a:hover {
      color: var(--primary);
    }
    .footer-bottom {
      max-width: 1320px;
      margin: 36px auto 0;
      padding-top: 20px;
      border-top: 1px solid rgba(121, 87, 232, 0.08);
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
      font-size: 0.82rem;
      color: var(--text-muted);
    }

    /* Modal & Slide Over Drawers */
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(36, 33, 59, 0.45);
      backdrop-filter: blur(6px);
      z-index: 1000;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }
    .modal-overlay.open {
      display: flex;
    }
    .modal-window {
      background: #FFFFFF;
      border-radius: 32px;
      max-width: 580px;
      width: 100%;
      padding: 32px;
      box-shadow: 20px 30px 60px rgba(0,0,0,0.25);
      max-height: 90vh;
      overflow-y: auto;
      position: relative;
    }
    .modal-close-btn {
      position: absolute;
      top: 20px;
      right: 20px;
      background: #FAF8FF;
      border: none;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      font-size: 1.2rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    /* Cart Drawer */
    .cart-drawer-overlay {
      position: fixed;
      inset: 0;
      background: rgba(36, 33, 59, 0.4);
      backdrop-filter: blur(4px);
      z-index: 1001;
      display: none;
      justify-content: flex-end;
    }
    .cart-drawer-overlay.open {
      display: flex;
    }
    .cart-drawer {
      width: 100%;
      max-width: 440px;
      background: #FFFFFF;
      height: 100%;
      display: flex;
      flex-direction: column;
      box-shadow: -10px 0 40px rgba(0,0,0,0.15);
      animation: slideInRight 0.3s ease;
    }
    @keyframes slideInRight {
      from { transform: translateX(100%); }
      to { transform: translateX(0); }
    }
    .cart-header {
      padding: 20px;
      border-bottom: 1px solid rgba(121, 87, 232, 0.08);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .cart-body {
      flex: 1;
      overflow-y: auto;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .cart-item-row {
      display: flex;
      gap: 14px;
      align-items: center;
      padding: 10px;
      border-radius: 18px;
      background: #FAF8FF;
      border: 1px solid rgba(121, 87, 232, 0.05);
    }
    .cart-item-row img {
      width: 60px;
      height: 60px;
      border-radius: 14px;
      object-fit: cover;
    }
    .cart-item-info {
      flex: 1;
    }
    .cart-qty-ctrls {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 6px;
    }
    .qty-btn {
      width: 26px;
      height: 26px;
      border-radius: 8px;
      background: #FFFFFF;
      border: none;
      font-weight: 800;
      cursor: pointer;
      box-shadow: 2px 2px 5px rgba(0,0,0,0.1);
    }
    .cart-footer {
      padding: 20px;
      border-top: 1px solid rgba(121, 87, 232, 0.08);
      background: #FAF9FF;
    }
    .summary-line {
      display: flex;
      justify-content: space-between;
      font-size: 0.9rem;
      color: var(--text-muted);
      margin-bottom: 6px;
    }
    .summary-total {
      display: flex;
      justify-content: space-between;
      font-size: 1.2rem;
      font-weight: 800;
      color: var(--text);
      margin: 12px 0 18px;
    }

    /* Toast Notification */
    .toast-msg {
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: #24213B;
      color: #FFFFFF;
      padding: 14px 24px;
      border-radius: 50px;
      font-weight: 600;
      font-size: 0.9rem;
      box-shadow: 0 10px 30px rgba(0,0,0,0.25);
      z-index: 2000;
      display: none;
      align-items: center;
      gap: 10px;
    }
    .toast-msg.show {
      display: flex;
      animation: popToast 0.3s ease;
    }
    @keyframes popToast {
      from { transform: translateY(20px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }

    /* Responsive */
    @media (max-width: 992px) {
      .hero-clay-banner {
        grid-template-columns: 1fr;
        padding: 40px 24px;
      }
      .hero-clay-banner h2 {
        font-size: 2.3rem;
      }
      .hero-art-col {
        order: -1;
      }
      .footer-container {
        grid-template-columns: 1fr 1fr;
      }
    }
    @media (max-width: 768px) {
      .nav-links {
        display: none;
      }
      .mobile-menu-btn {
        display: block;
      }
      .footer-container {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>

  <!-- Announcement Bar -->
  <div class="announcement-bar" id="promoBanner">
    <span>✨ Festive Clay Sale: Flat 40% OFF with code <strong>EASYKART40</strong></span>
    <span>•</span>
    <span>⚡ Free Express Delivery on orders above ₹999</span>
  </div>

  <!-- Main Navigation -->
  <header>
    <div class="nav-container">
      <a href="/" class="logo-box">
        <div class="logo-badge">E</div>
        <div class="logo-text">
          <h1>EasyKart</h1>
          <p>Discover More. Shop Better.</p>
        </div>
      </a>

      <ul class="nav-links">
        <li><a href="#shopSection">Shop</a></li>
        <li><a href="#categorySection">Categories</a></li>
        <li><a href="#dealsSection">Deals</a></li>
        <li><a href="#reviewsSection">Reviews</a></li>
        <li><a href="javascript:void(0)" onclick="openTrackModal()">Track Order</a></li>
        <li><a href="/admin" target="_blank" style="color:var(--primary); font-weight:700;">Admin Panel ↗</a></li>
      </ul>

      <div class="nav-actions">
        <button class="icon-clay-btn" onclick="openWishlistModal()" title="Wishlist">
          ♥
          <span class="icon-badge" id="wishlistCount">0</span>
        </button>

        <button class="icon-clay-btn" onclick="toggleCartDrawer(true)" title="Shopping Cart">
          🛍️
          <span class="icon-badge" id="cartCount">0</span>
        </button>

        <button class="icon-clay-btn" onclick="openAccountModal()" title="My Account">
          👤
        </button>

        <button class="mobile-menu-btn" onclick="toggleMobileMenu()">
          ☰
        </button>
      </div>
    </div>
  </header>

  <!-- Hero Section -->
  <section class="hero-section">
    <div class="hero-clay-banner">
      <div class="hero-text-col">
        <span class="hero-badge-pill">✨ The 2026 Collection Is Live</span>
        <h2>Everything You Love,<br><span>Just One Click Away.</span></h2>
        <p>Explore amazing products, discover new trends, and enjoy a smarter shopping experience crafted with soft clay aesthetics.</p>
        <div class="hero-btns">
          <a href="#shopSection" class="clay-btn">Shop Now →</a>
          <a href="#categorySection" class="clay-btn clay-btn-outline">Explore Categories</a>
        </div>
      </div>
      <div class="hero-art-col">
        <div class="floating-clay-tag tag-top-left">
          <span>🎧</span>
          <div>
            <strong style="font-size:0.82rem; display:block;">ANC Pro Sound</strong>
            <span style="font-size:0.75rem; color:var(--text-muted);">₹1,499 only</span>
          </div>
        </div>
        <div class="hero-main-card">
          <img src="https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=700&q=80" alt="Headphones">
        </div>
        <div class="floating-clay-tag tag-bottom-right">
          <span>⭐</span>
          <div>
            <strong style="font-size:0.82rem; display:block;">4.9 Rating</strong>
            <span style="font-size:0.75rem; color:var(--text-muted);">Trusted by 10k+</span>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- Category Section -->
  <section class="section-wrap" id="categorySection">
    <div class="section-header">
      <div class="section-title">
        <h3>Explore Categories</h3>
        <p>Hand-curated collections designed for your everyday lifestyle</p>
      </div>
    </div>
    <div class="category-scroll-grid" id="categoryGrid">
      <div class="category-clay-item active" onclick="selectCategory('All', this)">
        <div class="category-icon-circle">🛍️</div>
        <span class="category-name">All Items</span>
      </div>
      <div class="category-clay-item" onclick="selectCategory('Electronics', this)">
        <div class="category-icon-circle">⚡</div>
        <span class="category-name">Electronics</span>
      </div>
      <div class="category-clay-item" onclick="selectCategory('Men\'s Clothing', this)">
        <div class="category-icon-circle">👕</div>
        <span class="category-name">Men's</span>
      </div>
      <div class="category-clay-item" onclick="selectCategory('Women\'s Clothing', this)">
        <div class="category-icon-circle">👗</div>
        <span class="category-name">Women's</span>
      </div>
      <div class="category-clay-item" onclick="selectCategory('Shoes', this)">
        <div class="category-icon-circle">👟</div>
        <span class="category-name">Shoes</span>
      </div>
      <div class="category-clay-item" onclick="selectCategory('Watches', this)">
        <div class="category-icon-circle">⌚</div>
        <span class="category-name">Watches</span>
      </div>
      <div class="category-clay-item" onclick="selectCategory('Beauty & Care', this)">
        <div class="category-icon-circle">✨</div>
        <span class="category-name">Beauty</span>
      </div>
      <div class="category-clay-item" onclick="selectCategory('Home & Living', this)">
        <div class="category-icon-circle">🛋️</div>
        <span class="category-name">Home</span>
      </div>
      <div class="category-clay-item" onclick="selectCategory('Accessories', this)">
        <div class="category-icon-circle">🎒</div>
        <span class="category-name">Accessories</span>
      </div>
    </div>
  </section>

  <!-- Filter & Catalog Section -->
  <section class="section-wrap" id="shopSection">
    <div class="section-header">
      <div class="section-title">
        <h3 id="catalogHeader">Featured Products</h3>
        <p>Premium quality items at discounted direct-to-consumer prices</p>
      </div>
    </div>

    <!-- Filter Bar -->
    <div class="filter-bar-clay">
      <div class="search-input-wrap">
        <input type="text" id="searchInput" class="clay-input" placeholder="🔍 Search headphones, watches, t-shirts..." oninput="handleSearch(this.value)">
      </div>
      <div class="sort-group">
        <label style="font-size:0.85rem; font-weight:700; color:var(--text-muted);">Sort By:</label>
        <select class="sort-select" id="sortSelect" onchange="handleSort(this.value)">
          <option value="newest">Featured & Newest</option>
          <option value="price-low">Price: Low to High</option>
          <option value="price-high">Price: High to Low</option>
          <option value="rating">Highest Rated</option>
        </select>
      </div>
    </div>

    <!-- Product Grid -->
    <div class="products-grid" id="productGrid">
      <p style="grid-column: 1/-1; text-align:center; padding: 40px; color: var(--text-muted);">Loading products from MongoDB Atlas...</p>
    </div>
  </section>

  <!-- Brand Advantages / Perks -->
  <section class="section-wrap">
    <div class="perks-grid">
      <div class="perk-card">
        <div class="perk-icon-clay">🚚</div>
        <div class="perk-text">
          <h4>Free Express Shipping</h4>
          <p>Orders above ₹999 ship free</p>
        </div>
      </div>
      <div class="perk-card">
        <div class="perk-icon-clay">🔄</div>
        <div class="perk-text">
          <h4>7-Day Easy Returns</h4>
          <p>Zero questions asked refunds</p>
        </div>
      </div>
      <div class="perk-card">
        <div class="perk-icon-clay">🛡️</div>
        <div class="perk-text">
          <h4>100% Genuine Items</h4>
          <p>Verified manufacturer warranty</p>
        </div>
      </div>
      <div class="perk-card">
        <div class="perk-icon-clay">💬</div>
        <div class="perk-text">
          <h4>24/7 Dedicated Care</h4>
          <p>WhatsApp & phone helpline</p>
        </div>
      </div>
    </div>
  </section>

  <!-- Testimonials -->
  <section class="section-wrap" id="reviewsSection">
    <div class="section-header">
      <div class="section-title">
        <h3>Customer Love</h3>
        <p>See why over 25,000 shoppers across India adore EasyKart</p>
      </div>
    </div>
    <div class="testimonial-grid">
      <div class="testimonial-card">
        <div>
          <div style="color:#FFA41C; margin-bottom:8px;">★★★★★</div>
          <p style="font-size:0.92rem; line-height:1.6; color:var(--text);">"The ANC Headphones sound incredible for this price point. Packaging was buttery smooth and arrived in Delhi within 48 hours!"</p>
        </div>
        <div class="review-user-row">
          <div class="review-avatar">AK</div>
          <div>
            <strong style="font-size:0.9rem;">Aarav Kapoor</strong>
            <span style="font-size:0.75rem; color:var(--text-muted); display:block;">Verified Buyer • New Delhi</span>
          </div>
        </div>
      </div>
      <div class="testimonial-card">
        <div>
          <div style="color:#FFA41C; margin-bottom:8px;">★★★★★</div>
          <p style="font-size:0.92rem; line-height:1.6; color:var(--text);">"Obsessed with the clay design aesthetic! I ordered the vegan handbag and sunglasses. Quality feels ultra-luxurious."</p>
        </div>
        <div class="review-user-row">
          <div class="review-avatar" style="background:linear-gradient(135deg, #FF8178, #7957E8);">PR</div>
          <div>
            <strong style="font-size:0.9rem;">Pooja Rao</strong>
            <span style="font-size:0.75rem; color:var(--text-muted); display:block;">Verified Buyer • Bengaluru</span>
          </div>
        </div>
      </div>
      <div class="testimonial-card">
        <div>
          <div style="color:#FFA41C; margin-bottom:8px;">★★★★★</div>
          <p style="font-size:0.92rem; line-height:1.6; color:var(--text);">"Order tracking using just order ID and phone number was seamless. Cash on delivery was super convenient."</p>
        </div>
        <div class="review-user-row">
          <div class="review-avatar" style="background:linear-gradient(135deg, #38B982, #72C9F5);">VM</div>
          <div>
            <strong style="font-size:0.9rem;">Vikram Malhotra</strong>
            <span style="font-size:0.75rem; color:var(--text-muted); display:block;">Verified Buyer • Mumbai</span>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- Newsletter -->
  <section class="section-wrap" id="dealsSection">
    <div class="newsletter-clay">
      <span style="background:rgba(255,255,255,0.2); padding:4px 14px; border-radius:50px; font-size:0.8rem; font-weight:700;">🎁 ₹200 OFF YOUR FIRST ORDER</span>
      <h3 style="margin-top:14px;">Subscribe to Secret Clay Drops</h3>
      <p style="max-width:500px; margin:0 auto; opacity:0.9; font-size:0.95rem;">Join 50,000+ members and receive exclusive weekend promo codes & early bird access.</p>
      <form class="newsletter-form-row" onsubmit="handleNewsletter(event)">
        <input type="email" id="nlEmail" placeholder="Enter your email address" required>
        <button type="submit" class="clay-btn clay-btn-secondary">Get Invite ✨</button>
      </form>
    </div>
  </section>

  <!-- Footer -->
  <footer>
    <div class="footer-container">
      <div class="footer-col">
        <div class="logo-box" style="margin-bottom:14px;">
          <div class="logo-badge">E</div>
          <div class="logo-text">
            <h1>EasyKart</h1>
            <p>Discover More. Shop Better.</p>
          </div>
        </div>
        <p style="font-size:0.88rem; color:var(--text-muted); line-height:1.6; max-width:320px;">
          Premium claymorphic retail destination bringing hand-selected electronics, lifestyle, and fashion directly to you across India.
        </p>
        <p style="margin-top:12px; font-size:0.85rem; font-weight:600; color:var(--text);">
          📍 Main Market, New Delhi, India<br>
          📞 +91 98765 43210<br>
          ✉️ support@easykart.example
        </p>
      </div>
      <div class="footer-col">
        <h5>Quick Links</h5>
        <ul>
          <li><a href="#shopSection">Shop Catalog</a></li>
          <li><a href="#categorySection">Categories</a></li>
          <li><a href="javascript:void(0)" onclick="openTrackModal()">Track Order</a></li>
          <li><a href="/admin" target="_blank">Admin Portal</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <h5>Customer Help</h5>
        <ul>
          <li><a href="javascript:void(0)" onclick="showToast('Returns portal active 24/7')">Easy Returns</a></li>
          <li><a href="javascript:void(0)" onclick="showToast('Free shipping applies above ₹999')">Shipping Rates</a></li>
          <li><a href="javascript:void(0)" onclick="showToast('Secure SSL encrypted checkout')">Payment Security</a></li>
          <li><a href="javascript:void(0)" onclick="showToast('Support: +91 98765 43210')">Contact Support</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <h5>Payment & Trust</h5>
        <p style="font-size:0.85rem; color:var(--text-muted); line-height:1.6;">
          • Cash on Delivery (COD)<br>
          • UPI Instant (GPay / PhonePe / Paytm)<br>
          • 100% Secure Checkout Guarantee
        </p>
      </div>
    </div>
    <div class="footer-bottom">
      <p>© 2026 EasyKart. All rights reserved. Made with Claymorphic Design.</p>
      <p>Currency: Indian Rupees (₹) | Country: India</p>
    </div>
  </footer>

  <!-- CART SLIDE-OVER DRAWER -->
  <div class="cart-drawer-overlay" id="cartOverlay" onclick="handleDrawerClick(event)">
    <div class="cart-drawer">
      <div class="cart-header">
        <h3 style="font-size:1.2rem; font-weight:800;">Shopping Bag</h3>
        <button onclick="toggleCartDrawer(false)" style="background:none; border:none; font-size:1.4rem; cursor:pointer;">✕</button>
      </div>
      <div class="cart-body" id="cartItemsList">
        <!-- Rendered via JS -->
      </div>
      <div class="cart-footer">
        <div class="summary-line">
          <span>Subtotal</span>
          <span id="cartSubtotal">₹0</span>
        </div>
        <div class="summary-line">
          <span>Shipping Charges</span>
          <span id="cartShipping">₹0</span>
        </div>
        <div class="summary-total">
          <span>Total</span>
          <span id="cartTotal">₹0</span>
        </div>
        <button class="clay-btn" style="width:100%;" onclick="openCheckoutModal()">Proceed to Checkout →</button>
      </div>
    </div>
  </div>

  <!-- CHECKOUT MODAL -->
  <div class="modal-overlay" id="checkoutModal">
    <div class="modal-window">
      <button class="modal-close-btn" onclick="closeModal('checkoutModal')">✕</button>
      <h3 style="font-size:1.4rem; font-weight:800; margin-bottom:6px;">Finalize Your Order</h3>
      <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:20px;">Enter your delivery address and choose payment method.</p>

      <form id="checkoutForm" onsubmit="handlePlaceOrder(event)">
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">
          <div>
            <label style="font-size:0.75rem; font-weight:700;">Full Name *</label>
            <input type="text" id="custName" class="clay-input" required placeholder="Aarav Sharma">
          </div>
          <div>
            <label style="font-size:0.75rem; font-weight:700;">Mobile Number (for tracking) *</label>
            <input type="tel" id="custPhone" class="clay-input" required placeholder="9876543210">
          </div>
        </div>

        <div style="margin-bottom:12px;">
          <label style="font-size:0.75rem; font-weight:700;">Email Address *</label>
          <input type="email" id="custEmail" class="clay-input" required placeholder="aarav@example.com">
        </div>

        <div style="margin-bottom:12px;">
          <label style="font-size:0.75rem; font-weight:700;">Complete Street Address *</label>
          <textarea id="custAddress" class="clay-input" rows="2" required placeholder="House No., Street, Landmark"></textarea>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; margin-bottom:16px;">
          <div>
            <label style="font-size:0.75rem; font-weight:700;">City *</label>
            <input type="text" id="custCity" class="clay-input" required placeholder="New Delhi">
          </div>
          <div>
            <label style="font-size:0.75rem; font-weight:700;">State *</label>
            <input type="text" id="custState" class="clay-input" required placeholder="Delhi">
          </div>
          <div>
            <label style="font-size:0.75rem; font-weight:700;">PIN Code *</label>
            <input type="text" id="custPin" class="clay-input" required placeholder="110001">
          </div>
        </div>

        <div style="margin-bottom:20px;">
          <label style="font-size:0.85rem; font-weight:800; display:block; margin-bottom:8px;">Choose Payment Mode</label>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
            <label style="background:#FAF8FF; border:1px solid rgba(121,87,232,0.15); border-radius:18px; padding:12px; display:flex; align-items:center; gap:8px; cursor:pointer;">
              <input type="radio" name="paymentOption" value="Cash on Delivery" checked onchange="toggleUpiDemo(false)">
              <span style="font-size:0.85rem; font-weight:700;">💵 Cash on Delivery</span>
            </label>
            <label style="background:#FAF8FF; border:1px solid rgba(121,87,232,0.15); border-radius:18px; padding:12px; display:flex; align-items:center; gap:8px; cursor:pointer;">
              <input type="radio" name="paymentOption" value="UPI (Demo)" onchange="toggleUpiDemo(true)">
              <span style="font-size:0.85rem; font-weight:700;">⚡ Instant UPI (Demo)</span>
            </label>
          </div>
        </div>

        <div id="upiDemoBox" style="display:none; background:#EAE4FF; border-radius:18px; padding:14px; margin-bottom:18px; font-size:0.85rem;">
          <p style="font-weight:700; color:var(--primary); margin-bottom:4px;">UPI Payment Simulation</p>
          <p style="color:var(--text-muted); font-size:0.78rem;">UPI ID: <strong>easykart@demo</strong> (Demo-only simulation — no real currency charged).</p>
        </div>

        <div style="background:#FAF8FF; border-radius:18px; padding:14px; margin-bottom:20px; font-size:0.9rem;">
          <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
            <span>Order Total:</span>
            <strong id="checkoutTotalAmount" style="font-size:1.1rem; color:var(--text);">₹0</strong>
          </div>
        </div>

        <button type="submit" class="clay-btn" style="width:100%;" id="placeOrderSubmitBtn">Confirm & Place Order ✨</button>
      </form>
    </div>
  </div>

  <!-- ORDER SUCCESS CONFIRMATION MODAL -->
  <div class="modal-overlay" id="orderSuccessModal">
    <div class="modal-window" style="text-align:center;">
      <div style="width:72px; height:72px; border-radius:50%; background:#E6F8F0; color:var(--success); font-size:2.2rem; display:flex; align-items:center; justify-content:center; margin:0 auto 16px;">
        ✓
      </div>
      <h3 style="font-size:1.6rem; font-weight:800; color:var(--text);">Order Confirmed!</h3>
      <p style="font-size:0.9rem; color:var(--text-muted); margin:8px 0 16px;">Thank you for shopping with EasyKart.</p>
      
      <div style="background:#FAF8FF; border-radius:20px; padding:16px; margin-bottom:24px; text-align:left;">
        <p style="font-size:0.85rem; margin-bottom:6px;"><strong>Order ID:</strong> <span id="confirmedOrderId" style="color:var(--primary); font-weight:800;">-</span></p>
        <p style="font-size:0.85rem; margin-bottom:6px;"><strong>Recipient:</strong> <span id="confirmedCustomerName">-</span></p>
        <p style="font-size:0.85rem; margin-bottom:6px;"><strong>Total Amount:</strong> <span id="confirmedAmount">-</span></p>
        <p style="font-size:0.85rem;"><strong>Payment Method:</strong> <span id="confirmedPayment">-</span></p>
      </div>

      <div style="display:flex; gap:12px;">
        <button class="clay-btn" style="flex:1;" onclick="openTrackFromSuccess()">Track Order</button>
        <button class="clay-btn clay-btn-outline" style="flex:1;" onclick="closeModal('orderSuccessModal')">Continue Shopping</button>
      </div>
    </div>
  </div>

  <!-- ORDER TRACKING MODAL -->
  <div class="modal-overlay" id="trackModal">
    <div class="modal-window">
      <button class="modal-close-btn" onclick="closeModal('trackModal')">✕</button>
      <h3 style="font-size:1.4rem; font-weight:800; margin-bottom:6px;">Track Your Order</h3>
      <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:18px;">Check live order status using your Order ID and Phone Number.</p>

      <form onsubmit="handleTrackOrder(event)" style="display:flex; flex-direction:column; gap:12px;">
        <div>
          <label style="font-size:0.75rem; font-weight:700;">Order ID (e.g. #1001) *</label>
          <input type="text" id="trackOrderIdInput" class="clay-input" required placeholder="#1001">
        </div>
        <div>
          <label style="font-size:0.75rem; font-weight:700;">Registered Mobile Number *</label>
          <input type="tel" id="trackPhoneInput" class="clay-input" required placeholder="9876543210">
        </div>
        <button type="submit" class="clay-btn" style="margin-top:6px;">Fetch Live Status 🔍</button>
      </form>

      <div id="trackResultBox" style="display:none; margin-top:24px; border-top:1px solid rgba(121,87,232,0.1); padding-top:20px;">
        <!-- Injected status details -->
      </div>
    </div>
  </div>

  <!-- CUSTOMER ACCOUNT / AUTH MODAL -->
  <div class="modal-overlay" id="accountModal">
    <div class="modal-window">
      <button class="modal-close-btn" onclick="closeModal('accountModal')">✕</button>
      
      <div id="authTabs" style="display:flex; gap:12px; margin-bottom:20px;">
        <button id="tabLoginBtn" class="clay-btn" style="flex:1;" onclick="switchAuthTab('login')">Sign In</button>
        <button id="tabRegisterBtn" class="clay-btn clay-btn-outline" style="flex:1;" onclick="switchAuthTab('register')">Register</button>
      </div>

      <!-- Login Form -->
      <div id="loginFormWrap">
        <h3 style="font-size:1.3rem; font-weight:800; margin-bottom:4px;">Welcome Back</h3>
        <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:18px;">Sign in to view orders, saved addresses, and wishlist.</p>
        <form onsubmit="handleCustomerLogin(event)" style="display:flex; flex-direction:column; gap:12px;">
          <div>
            <label style="font-size:0.75rem; font-weight:700;">Email Address</label>
            <input type="email" id="loginEmail" class="clay-input" required placeholder="name@example.com">
          </div>
          <div>
            <label style="font-size:0.75rem; font-weight:700;">Password</label>
            <input type="password" id="loginPass" class="clay-input" required placeholder="••••••••">
          </div>
          <button type="submit" class="clay-btn" style="margin-top:8px;">Sign In →</button>
        </form>
      </div>

      <!-- Register Form -->
      <div id="registerFormWrap" style="display:none;">
        <h3 style="font-size:1.3rem; font-weight:800; margin-bottom:4px;">Create an Account</h3>
        <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:18px;">Join EasyKart for exclusive member privileges.</p>
        <form onsubmit="handleCustomerRegister(event)" style="display:flex; flex-direction:column; gap:12px;">
          <div>
            <label style="font-size:0.75rem; font-weight:700;">Full Name</label>
            <input type="text" id="regName" class="clay-input" required placeholder="Aarav Sharma">
          </div>
          <div>
            <label style="font-size:0.75rem; font-weight:700;">Phone Number</label>
            <input type="tel" id="regPhone" class="clay-input" required placeholder="9876543210">
          </div>
          <div>
            <label style="font-size:0.75rem; font-weight:700;">Email Address</label>
            <input type="email" id="regEmail" class="clay-input" required placeholder="name@example.com">
          </div>
          <div>
            <label style="font-size:0.75rem; font-weight:700;">Password</label>
            <input type="password" id="regPass" class="clay-input" required placeholder="••••••••">
          </div>
          <button type="submit" class="clay-btn" style="margin-top:8px;">Create My Account ✨</button>
        </form>
      </div>

      <!-- Logged-in Profile View -->
      <div id="profileViewWrap" style="display:none;">
        <div style="display:flex; align-items:center; gap:16px; margin-bottom:20px;">
          <div style="width:58px; height:58px; border-radius:50%; background:var(--primary); color:#fff; display:flex; align-items:center; justify-content:center; font-size:1.5rem; font-weight:800;">
            👤
          </div>
          <div>
            <h3 id="profileName" style="font-size:1.2rem; font-weight:800;">User Name</h3>
            <p id="profileEmail" style="font-size:0.82rem; color:var(--text-muted);">user@example.com</p>
          </div>
        </div>

        <h4 style="font-size:0.95rem; font-weight:800; margin:18px 0 8px;">My Recent Orders</h4>
        <div id="profileOrdersList" style="max-height:220px; overflow-y:auto; display:flex; flex-direction:column; gap:8px;">
          <p style="font-size:0.82rem; color:var(--text-muted);">Loading past orders...</p>
        </div>

        <button class="clay-btn clay-btn-outline" style="width:100%; margin-top:20px;" onclick="handleCustomerLogout()">Sign Out</button>
      </div>

    </div>
  </div>

  <!-- WISHLIST MODAL -->
  <div class="modal-overlay" id="wishlistModal">
    <div class="modal-window">
      <button class="modal-close-btn" onclick="closeModal('wishlistModal')">✕</button>
      <h3 style="font-size:1.3rem; font-weight:800; margin-bottom:4px;">My Wishlist</h3>
      <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:16px;">Saved favorites you can easily add to cart.</p>
      <div id="wishlistItemsList" style="display:flex; flex-direction:column; gap:12px; max-height:400px; overflow-y:auto;">
        <!-- Injected -->
      </div>
    </div>
  </div>

  <!-- TOAST NOTIFICATION -->
  <div class="toast-msg" id="toastBox">Notification message</div>

  <!-- APPLICATION JAVASCRIPT -->
  <script>
    // State
    let products = [];
    let cart = [];
    let wishlist = [];
    let activeCategory = 'All';
    let searchQuery = '';
    let currentSort = 'newest';
    let currentUser = null;
    let storeSettings = {
      freeShippingThreshold: 999,
      shippingFee: 99,
      currency: '₹'
    };

    // Initialize App
    window.addEventListener('DOMContentLoaded', async () => {
      loadCartFromStorage();
      loadUserFromStorage();
      await fetchStoreInfo();
      await fetchProducts();
    });

    async function fetchStoreInfo() {
      try {
        const res = await fetch('/api/store-info');
        const data = await res.json();
        if (data.settings) {
          storeSettings = data.settings;
          if (data.settings.promoBanner) {
            document.getElementById('promoBanner').innerHTML = '<span>✨ ' + data.settings.promoBanner + '</span>';
          }
        }
      } catch (e) {
        console.error('Settings load err:', e);
      }
    }

    async function fetchProducts() {
      try {
        let url = '/api/products?';
        if (activeCategory !== 'All') url += '&category=' + encodeURIComponent(activeCategory);
        if (searchQuery) url += '&search=' + encodeURIComponent(searchQuery);
        if (currentSort) url += '&sort=' + encodeURIComponent(currentSort);

        const res = await fetch(url);
        const data = await res.json();
        if (data.success) {
          products = data.products;
          renderProductGrid(products);
        }
      } catch (e) {
        document.getElementById('productGrid').innerHTML = '<p style="grid-column:1/-1; text-align:center; padding:30px; color:#FF4D3D;">Failed to load products. Check MongoDB connection.</p>';
      }
    }

    function renderProductGrid(items) {
      const grid = document.getElementById('productGrid');
      if (!items || items.length === 0) {
        grid.innerHTML = '<p style="grid-column:1/-1; text-align:center; padding:40px; color:var(--text-muted);">No products match your query.</p>';
        return;
      }
      grid.innerHTML = items.map(p => {
        const isWished = wishlist.includes(p._id);
        const discountPct = Math.round(((p.price - p.discountPrice) / p.price) * 100);
        return \`
          <div class="product-card">
            <div class="product-img-box">
              <span class="clay-badge badge-\${(p.badge || 'new').toLowerCase()} product-badge-corner">\${p.badge || 'NEW'}</span>
              <button class="wishlist-heart-btn \${isWished ? 'active' : ''}" onclick="toggleWishlistItem('\${p._id}')" title="Wishlist">♥</button>
              <img src="\${p.image}" alt="\${p.name}" loading="lazy">
            </div>
            <div class="product-details">
              <div>
                <span class="product-cat">\${p.category}</span>
                <h4 class="product-title" onclick="quickViewProduct('\${p._id}')">\${p.name}</h4>
                <div class="product-rating">
                  <span>★</span>
                  <span>\${p.rating}</span>
                  <span style="color:var(--text-muted); font-size:0.75rem;">(\${p.stock} in stock)</span>
                </div>
              </div>
              <div class="price-action-row">
                <div class="price-box">
                  <span class="discount-price">₹\${p.discountPrice.toLocaleString('en-IN')}</span>
                  <span class="original-price">₹\${p.price.toLocaleString('en-IN')} (\${discountPct}% off)</span>
                </div>
                <button class="add-cart-clay-btn" onclick="addToCart('\${p._id}')">
                  <span>+</span> Add
                </button>
              </div>
            </div>
          </div>
        \`;
      }).join('');
    }

    // Category Selection
    function selectCategory(cat, el) {
      activeCategory = cat;
      document.querySelectorAll('.category-clay-item').forEach(c => c.classList.remove('active'));
      if (el) el.classList.add('active');
      document.getElementById('catalogHeader').innerText = cat === 'All' ? 'Featured Products' : cat + ' Collection';
      fetchProducts();
    }

    // Search and Sort
    let searchTimeout = null;
    function handleSearch(val) {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        searchQuery = val;
        fetchProducts();
      }, 350);
    }

    function handleSort(val) {
      currentSort = val;
      fetchProducts();
    }

    // Cart Management
    function loadCartFromStorage() {
      try {
        const saved = localStorage.getItem('easykart_cart');
        if (saved) cart = JSON.parse(saved);
      } catch (e) {
        cart = [];
      }
      updateCartUI();
    }

    function saveCartToStorage() {
      localStorage.setItem('easykart_cart', JSON.stringify(cart));
      updateCartUI();
    }

    function addToCart(productId) {
      const prod = products.find(p => p._id === productId);
      if (!prod) return;
      const existing = cart.find(i => i.productId === productId);
      if (existing) {
        existing.quantity += 1;
      } else {
        cart.push({
          productId: prod._id,
          name: prod.name,
          price: prod.discountPrice,
          image: prod.image,
          quantity: 1
        });
      }
      saveCartToStorage();
      showToast('Added ' + prod.name + ' to bag! 🛍️');
    }

    function updateCartQty(productId, delta) {
      const item = cart.find(i => i.productId === productId);
      if (!item) return;
      item.quantity += delta;
      if (item.quantity <= 0) {
        cart = cart.filter(i => i.productId !== productId);
      }
      saveCartToStorage();
    }

    function updateCartUI() {
      const countEl = document.getElementById('cartCount');
      const totalCount = cart.reduce((sum, i) => sum + i.quantity, 0);
      countEl.innerText = totalCount;

      const listEl = document.getElementById('cartItemsList');
      if (cart.length === 0) {
        listEl.innerHTML = '<div style="text-align:center; padding:50px 10px; color:var(--text-muted);"><p style="font-size:2rem; margin-bottom:8px;">🛍️</p><p>Your shopping bag is empty.</p></div>';
      } else {
        listEl.innerHTML = cart.map(i => \`
          <div class="cart-item-row">
            <img src="\${i.image}" alt="\${i.name}">
            <div class="cart-item-info">
              <strong style="font-size:0.88rem; display:block; color:var(--text);">\${i.name}</strong>
              <span style="font-size:0.82rem; color:var(--primary); font-weight:700;">₹\${i.price.toLocaleString('en-IN')}</span>
              <div class="cart-qty-ctrls">
                <button class="qty-btn" onclick="updateCartQty('\${i.productId}', -1)">-</button>
                <span style="font-size:0.85rem; font-weight:700;">\${i.quantity}</span>
                <button class="qty-btn" onclick="updateCartQty('\${i.productId}', 1)">+</button>
              </div>
            </div>
            <button onclick="removeCartItem('\${i.productId}')" style="background:none; border:none; color:var(--text-muted); cursor:pointer; font-size:1.1rem;">🗑️</button>
          </div>
        \`).join('');
      }

      const subtotal = cart.reduce((sum, i) => sum + (i.price * i.quantity), 0);
      const shipping = subtotal === 0 || subtotal >= (storeSettings.freeShippingThreshold || 999) ? 0 : (storeSettings.shippingFee || 99);
      const total = subtotal + shipping;

      document.getElementById('cartSubtotal').innerText = '₹' + subtotal.toLocaleString('en-IN');
      document.getElementById('cartShipping').innerText = shipping === 0 ? 'FREE' : '₹' + shipping;
      document.getElementById('cartTotal').innerText = '₹' + total.toLocaleString('en-IN');
      document.getElementById('checkoutTotalAmount').innerText = '₹' + total.toLocaleString('en-IN');
    }

    function removeCartItem(productId) {
      cart = cart.filter(i => i.productId !== productId);
      saveCartToStorage();
    }

    function toggleCartDrawer(open) {
      const drawer = document.getElementById('cartOverlay');
      if (open) drawer.classList.add('open');
      else drawer.classList.remove('open');
    }

    function handleDrawerClick(e) {
      if (e.target.id === 'cartOverlay') toggleCartDrawer(false);
    }

    // Checkout Flow
    function openCheckoutModal() {
      if (cart.length === 0) {
        showToast('Your cart is empty! Add products first.');
        return;
      }
      toggleCartDrawer(false);
      if (currentUser) {
        document.getElementById('custName').value = currentUser.name || '';
        document.getElementById('custEmail').value = currentUser.email || '';
        document.getElementById('custPhone').value = currentUser.phone || '';
        if (currentUser.address) {
          document.getElementById('custAddress').value = currentUser.address.address || '';
          document.getElementById('custCity').value = currentUser.address.city || '';
          document.getElementById('custState').value = currentUser.address.state || '';
          document.getElementById('custPin').value = currentUser.address.pincode || '';
        }
      }
      openModal('checkoutModal');
    }

    function toggleUpiDemo(show) {
      document.getElementById('upiDemoBox').style.display = show ? 'block' : 'none';
    }

    async function handlePlaceOrder(e) {
      e.preventDefault();
      const submitBtn = document.getElementById('placeOrderSubmitBtn');
      submitBtn.disabled = true;
      submitBtn.innerText = 'Securing Your Order...';

      const paymentMethod = document.querySelector('input[name="paymentOption"]:checked').value;
      const orderPayload = {
        customer: {
          name: document.getElementById('custName').value,
          phone: document.getElementById('custPhone').value,
          email: document.getElementById('custEmail').value
        },
        shippingAddress: {
          address: document.getElementById('custAddress').value,
          city: document.getElementById('custCity').value,
          state: document.getElementById('custState').value,
          pincode: document.getElementById('custPin').value
        },
        items: cart,
        paymentMethod
      };

      try {
        const res = await fetch('/api/orders/place', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(orderPayload)
        });
        const data = await res.json();
        if (data.success) {
          closeModal('checkoutModal');
          document.getElementById('confirmedOrderId').innerText = data.orderId;
          document.getElementById('confirmedCustomerName').innerText = data.order.customer.name;
          document.getElementById('confirmedAmount').innerText = '₹' + data.order.totalAmount.toLocaleString('en-IN');
          document.getElementById('confirmedPayment').innerText = data.order.paymentMethod;
          openModal('orderSuccessModal');

          // Reset Cart
          cart = [];
          saveCartToStorage();
        } else {
          showToast(data.error || 'Failed to place order.');
        }
      } catch (err) {
        showToast('Server error while placing order.');
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = 'Confirm & Place Order ✨';
      }
    }

    // Order Tracking
    function openTrackModal() {
      openModal('trackModal');
    }

    function openTrackFromSuccess() {
      const orderId = document.getElementById('confirmedOrderId').innerText;
      const phone = document.getElementById('custPhone').value;
      closeModal('orderSuccessModal');
      document.getElementById('trackOrderIdInput').value = orderId;
      document.getElementById('trackPhoneInput').value = phone;
      openModal('trackModal');
    }

    async function handleTrackOrder(e) {
      e.preventDefault();
      const orderId = document.getElementById('trackOrderIdInput').value.trim();
      const phone = document.getElementById('trackPhoneInput').value.trim();
      const resultBox = document.getElementById('trackResultBox');

      try {
        const res = await fetch('/api/orders/track?orderId=' + encodeURIComponent(orderId) + '&phone=' + encodeURIComponent(phone));
        const data = await res.json();
        if (data.success) {
          const ord = data.order;
          resultBox.style.display = 'block';
          resultBox.innerHTML = \`
            <div style="background:#FAF8FF; border-radius:20px; padding:18px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <strong style="color:var(--primary); font-size:1.1rem;">\${ord.orderId}</strong>
                <span class="clay-badge badge-deal">\${ord.orderStatus}</span>
              </div>
              <p style="font-size:0.85rem; margin-bottom:4px;"><strong>Customer:</strong> \${ord.customer.name} (\${ord.customer.phone})</p>
              <p style="font-size:0.85rem; margin-bottom:4px;"><strong>Delivery To:</strong> \${ord.shippingAddress.address}, \${ord.shippingAddress.city}</p>
              <p style="font-size:0.85rem; margin-bottom:12px;"><strong>Order Total:</strong> ₹\${ord.totalAmount.toLocaleString('en-IN')}</p>
              
              <div style="border-top:1px dashed rgba(121,87,232,0.2); padding-top:10px;">
                <p style="font-size:0.75rem; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Items Ordered:</p>
                \${ord.items.map(it => \`
                  <div style="display:flex; justify-content:space-between; font-size:0.82rem; margin-top:4px;">
                    <span>\${it.name} (x\${it.quantity})</span>
                    <strong>₹\${(it.price * it.quantity).toLocaleString('en-IN')}</strong>
                  </div>
                \`).join('')}
              </div>
            </div>
          \`;
        } else {
          resultBox.style.display = 'block';
          resultBox.innerHTML = '<p style="color:#FF4D3D; font-size:0.88rem; text-align:center;">' + (data.error || 'No matching order found.') + '</p>';
        }
      } catch (err) {
        showToast('Tracking inquiry failed.');
      }
    }

    // Wishlist Toggle
    async function toggleWishlistItem(productId) {
      if (!currentUser) {
        openAccountModal();
        showToast('Please sign in to save items to your wishlist.');
        return;
      }
      try {
        const token = localStorage.getItem('easykart_token');
        const res = await fetch('/api/wishlist/toggle', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
          },
          body: JSON.stringify({ productId })
        });
        const data = await res.json();
        if (data.success) {
          wishlist = data.wishlist;
          document.getElementById('wishlistCount').innerText = wishlist.length;
          renderProductGrid(products);
          showToast('Wishlist updated ♥');
        }
      } catch (e) {
        showToast('Wishlist update failed.');
      }
    }

    function openWishlistModal() {
      const container = document.getElementById('wishlistItemsList');
      if (wishlist.length === 0) {
        container.innerHTML = '<p style="text-align:center; padding:30px; color:var(--text-muted);">Your wishlist is empty.</p>';
      } else {
        const items = products.filter(p => wishlist.includes(p._id));
        container.innerHTML = items.map(p => \`
          <div style="display:flex; align-items:center; gap:12px; background:#FAF8FF; padding:10px; border-radius:18px;">
            <img src="\${p.image}" style="width:50px; height:50px; border-radius:12px; object-fit:cover;">
            <div style="flex:1;">
              <strong style="font-size:0.85rem; display:block;">\${p.name}</strong>
              <span style="font-size:0.8rem; color:var(--primary); font-weight:700;">₹\${p.discountPrice.toLocaleString('en-IN')}</span>
            </div>
            <button class="clay-btn" style="padding:6px 14px; font-size:0.75rem;" onclick="addToCart('\${p._id}')">Add</button>
          </div>
        \`).join('');
      }
      openModal('wishlistModal');
    }

    // Customer Authentication
    function loadUserFromStorage() {
      const token = localStorage.getItem('easykart_token');
      const userStr = localStorage.getItem('easykart_user');
      if (token && userStr) {
        try {
          currentUser = JSON.parse(userStr);
          wishlist = currentUser.wishlist || [];
          document.getElementById('wishlistCount').innerText = wishlist.length;
        } catch (e) {
          currentUser = null;
        }
      }
    }

    function openAccountModal() {
      if (currentUser) {
        document.getElementById('authTabs').style.display = 'none';
        document.getElementById('loginFormWrap').style.display = 'none';
        document.getElementById('registerFormWrap').style.display = 'none';
        document.getElementById('profileViewWrap').style.display = 'block';
        document.getElementById('profileName').innerText = currentUser.name;
        document.getElementById('profileEmail').innerText = currentUser.email;
        loadMyOrders();
      } else {
        document.getElementById('authTabs').style.display = 'flex';
        document.getElementById('profileViewWrap').style.display = 'none';
        switchAuthTab('login');
      }
      openModal('accountModal');
    }

    function switchAuthTab(tab) {
      if (tab === 'login') {
        document.getElementById('loginFormWrap').style.display = 'block';
        document.getElementById('registerFormWrap').style.display = 'none';
        document.getElementById('tabLoginBtn').className = 'clay-btn';
        document.getElementById('tabRegisterBtn').className = 'clay-btn clay-btn-outline';
      } else {
        document.getElementById('loginFormWrap').style.display = 'none';
        document.getElementById('registerFormWrap').style.display = 'block';
        document.getElementById('tabRegisterBtn').className = 'clay-btn';
        document.getElementById('tabLoginBtn').className = 'clay-btn clay-btn-outline';
      }
    }

    async function handleCustomerLogin(e) {
      e.preventDefault();
      const email = document.getElementById('loginEmail').value;
      const password = document.getElementById('loginPass').value;
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (data.success) {
          localStorage.setItem('easykart_token', data.token);
          localStorage.setItem('easykart_user', JSON.stringify(data.user));
          currentUser = data.user;
          wishlist = data.user.wishlist || [];
          document.getElementById('wishlistCount').innerText = wishlist.length;
          closeModal('accountModal');
          showToast('Welcome back, ' + currentUser.name + '! 👋');
        } else {
          showToast(data.error || 'Login failed.');
        }
      } catch (err) {
        showToast('Login error.');
      }
    }

    async function handleCustomerRegister(e) {
      e.preventDefault();
      const name = document.getElementById('regName').value;
      const phone = document.getElementById('regPhone').value;
      const email = document.getElementById('regEmail').value;
      const password = document.getElementById('regPass').value;
      try {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, phone, email, password })
        });
        const data = await res.json();
        if (data.success) {
          localStorage.setItem('easykart_token', data.token);
          localStorage.setItem('easykart_user', JSON.stringify(data.user));
          currentUser = data.user;
          closeModal('accountModal');
          showToast('Account created successfully! ✨');
        } else {
          showToast(data.error || 'Registration failed.');
        }
      } catch (err) {
        showToast('Registration error.');
      }
    }

    function handleCustomerLogout() {
      localStorage.removeItem('easykart_token');
      localStorage.removeItem('easykart_user');
      currentUser = null;
      wishlist = [];
      document.getElementById('wishlistCount').innerText = '0';
      closeModal('accountModal');
      showToast('Signed out successfully.');
    }

    async function loadMyOrders() {
      const list = document.getElementById('profileOrdersList');
      try {
        const token = localStorage.getItem('easykart_token');
        const res = await fetch('/api/orders/my-orders', {
          headers: { 'Authorization': 'Bearer ' + token }
        });
        const data = await res.json();
        if (data.success && data.orders.length) {
          list.innerHTML = data.orders.map(o => \`
            <div style="background:#FAF8FF; border-radius:14px; padding:10px; font-size:0.8rem;">
              <div style="display:flex; justify-content:space-between;">
                <strong>\${o.orderId}</strong>
                <span style="color:var(--primary); font-weight:700;">\${o.orderStatus}</span>
              </div>
              <p style="color:var(--text-muted); margin-top:2px;">₹\${o.totalAmount.toLocaleString('en-IN')} • \${o.items.length} items</p>
            </div>
          \`).join('');
        } else {
          list.innerHTML = '<p style="font-size:0.82rem; color:var(--text-muted);">No orders placed yet.</p>';
        }
      } catch (e) {
        list.innerHTML = '<p style="font-size:0.82rem; color:var(--text-muted);">Could not fetch orders.</p>';
      }
    }

    // Modal Helpers
    function openModal(id) {
      document.getElementById(id).classList.add('open');
    }
    function closeModal(id) {
      document.getElementById(id).classList.remove('open');
    }
    function showToast(msg) {
      const box = document.getElementById('toastBox');
      box.innerText = msg;
      box.classList.add('show');
      setTimeout(() => box.classList.remove('show'), 3500);
    }
    function handleNewsletter(e) {
      e.preventDefault();
      document.getElementById('nlEmail').value = '';
      showToast('🎉 You are on the VIP Clay Drops list!');
    }
    function toggleMobileMenu() {
      const links = document.querySelector('.nav-links');
      if (links.style.display === 'flex') links.style.display = 'none';
      else {
        links.style.display = 'flex';
        links.style.flexDirection = 'column';
        links.style.position = 'absolute';
        links.style.top = '74px';
        links.style.left = '0';
        links.style.width = '100%';
        links.style.background = '#FFFFFF';
        links.style.padding = '20px';
        links.style.boxShadow = '0 10px 30px rgba(0,0,0,0.1)';
      }
    }
  </script>
</body>
</html>`);
});

// Port listening for local development
const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`EasyKart customer storefront running at http://localhost:${PORT}`);
  });
}

module.exports = app;