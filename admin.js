const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();

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

const JWT_SECRET = process.env.JWT_SECRET || 'easykart_jwt_secret_token_key_2026';
const MONGODB_URI = process.env.MONGODB_URI || '';
const DB_NAME = 'easykart_store';

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'easykart2026';

let cachedClient = null;
let cachedDb = null;

async function getDatabase() {
  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI environment variable is missing.');
  }
  if (cachedDb) return { client: cachedClient, db: cachedDb };
  const client = new MongoClient(MONGODB_URI, { maxPoolSize: 10 });
  await client.connect();
  const db = client.db(DB_NAME);
  cachedClient = client;
  cachedDb = db;
  return { client, db };
}

// Middleware: Authenticate Admin
function requireAdminAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1] || req.cookies?.admin_token;
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized. Admin credentials required.' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded.isAdmin) throw new Error('Not an admin');
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired admin token.' });
  }
}

// ==================== ADMIN API ROUTES ====================

// Admin Login
app.post(['/api/admin/login', '/admin/login'], (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    const token = jwt.sign({ username, isAdmin: true }, JWT_SECRET, { expiresIn: '2d' });
    res.cookie('admin_token', token, { httpOnly: true, maxAge: 2 * 24 * 3600 * 1000 });
    return res.json({ success: true, token, username });
  }
  return res.status(401).json({ error: 'Invalid admin username or password.' });
});

// Admin Stats
app.get(['/api/admin/stats', '/admin/api/stats'], requireAdminAuth, async (req, res) => {
  try {
    const { db } = await getDatabase();
    const totalOrders = await db.collection('orders').countDocuments();
    const totalProducts = await db.collection('products').countDocuments();
    const totalCustomers = await db.collection('users').countDocuments();
    const pendingOrders = await db.collection('orders').countDocuments({ orderStatus: 'Confirmed' });
    const deliveredOrders = await db.collection('orders').countDocuments({ orderStatus: 'Delivered' });

    const revenueResult = await db
      .collection('orders')
      .aggregate([{ $group: { _id: null, total: { $sum: '$totalAmount' } } }])
      .toArray();

    const totalRevenue = revenueResult.length ? revenueResult[0].total : 0;
    const recentOrders = await db.collection('orders').find().sort({ createdAt: -1 }).limit(6).toArray();

    res.json({
      success: true,
      stats: {
        totalRevenue,
        totalOrders,
        totalProducts,
        totalCustomers,
        pendingOrders,
        deliveredOrders,
      },
      recentOrders,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin Products CRUD
app.get(['/api/admin/products', '/admin/api/products'], requireAdminAuth, async (req, res) => {
  try {
    const { db } = await getDatabase();
    const products = await db.collection('products').find().sort({ createdAt: -1 }).toArray();
    res.json({ success: true, products });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post(['/api/admin/products', '/admin/api/products'], requireAdminAuth, async (req, res) => {
  try {
    const { name, category, description, price, discountPrice, image, stock, badge, featured } =
      req.body;
    if (!name || !price || !category) {
      return res.status(400).json({ error: 'Name, Category, and Price are required.' });
    }
    const { db } = await getDatabase();
    const newProduct = {
      name: name.trim(),
      category: category.trim(),
      description: description ? description.trim() : '',
      price: parseFloat(price),
      discountPrice: discountPrice ? parseFloat(discountPrice) : parseFloat(price),
      image: image || 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=700&q=80',
      stock: parseInt(stock) || 10,
      badge: badge || 'NEW',
      rating: 4.8,
      featured: featured === true || featured === 'true',
      createdAt: new Date(),
    };
    const result = await db.collection('products').insertOne(newProduct);
    res.status(201).json({ success: true, insertedId: result.insertedId, product: newProduct });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put(['/api/admin/products/:id', '/admin/api/products/:id'], requireAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, category, description, price, discountPrice, image, stock, badge, featured } =
      req.body;
    const { db } = await getDatabase();
    await db.collection('products').updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          name: name.trim(),
          category: category.trim(),
          description: description?.trim(),
          price: parseFloat(price),
          discountPrice: parseFloat(discountPrice),
          image,
          stock: parseInt(stock),
          badge,
          featured: featured === true || featured === 'true',
          updatedAt: new Date(),
        },
      }
    );
    res.json({ success: true, message: 'Product updated successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete(
  ['/api/admin/products/:id', '/admin/api/products/:id'],
  requireAdminAuth,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { db } = await getDatabase();
      await db.collection('products').deleteOne({ _id: new ObjectId(id) });
      res.json({ success: true, message: 'Product deleted.' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// Admin Orders
app.get(['/api/admin/orders', '/admin/api/orders'], requireAdminAuth, async (req, res) => {
  try {
    const { db } = await getDatabase();
    const orders = await db.collection('orders').find().sort({ createdAt: -1 }).toArray();
    res.json({ success: true, orders });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch(
  ['/api/admin/orders/:id/status', '/admin/api/orders/:id/status'],
  requireAdminAuth,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { orderStatus } = req.body;
      const { db } = await getDatabase();
      await db
        .collection('orders')
        .updateOne({ _id: new ObjectId(id) }, { $set: { orderStatus, updatedAt: new Date() } });
      res.json({ success: true, message: 'Order status updated.' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// Admin Customers Directory
app.get(['/api/admin/customers', '/admin/api/customers'], requireAdminAuth, async (req, res) => {
  try {
    const { db } = await getDatabase();
    const customers = await db
      .collection('users')
      .find({}, { projection: { password: 0 } })
      .sort({ createdAt: -1 })
      .toArray();
    res.json({ success: true, customers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin Store Settings
app.get(['/api/admin/settings', '/admin/api/settings'], requireAdminAuth, async (req, res) => {
  try {
    const { db } = await getDatabase();
    const settings = await db.collection('settings').findOne({});
    res.json({ success: true, settings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put(['/api/admin/settings', '/admin/api/settings'], requireAdminAuth, async (req, res) => {
  try {
    const { storeName, phone, email, address, freeShippingThreshold, shippingFee, promoBanner } =
      req.body;
    const { db } = await getDatabase();
    await db.collection('settings').updateOne(
      {},
      {
        $set: {
          storeName,
          phone,
          email,
          address,
          freeShippingThreshold: parseFloat(freeShippingThreshold),
          shippingFee: parseFloat(shippingFee),
          promoBanner,
          updatedAt: new Date(),
        },
      },
      { upsert: true }
    );
    res.json({ success: true, message: 'Store settings saved.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== ADMIN DASHBOARD UI ====================
app.get('*', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>EasyKart — Admin Command Center</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary: #7957E8;
      --primary-dark: #6236E2;
      --secondary: #FF8178;
      --accent: #72C9F5;
      --bg: #F5F2FF;
      --card-bg: #FFFFFF;
      --text: #24213B;
      --text-muted: #6C668D;
      --success: #38B982;
      --clay-card-shadow: 14px 16px 32px rgba(121, 87, 232, 0.1), -10px -10px 24px #FFFFFF;
      --clay-btn-shadow: 6px 8px 18px rgba(121, 87, 232, 0.3), inset 2px 2px 4px rgba(255,255,255,0.4);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Plus Jakarta Sans', sans-serif; }
    body { background-color: var(--bg); color: var(--text); min-height: 100vh; display: flex; flex-direction: column; }
    
    .clay-card {
      background: var(--card-bg);
      border-radius: 24px;
      box-shadow: var(--clay-card-shadow);
      border: 1px solid rgba(255, 255, 255, 0.8);
      padding: 24px;
    }
    .clay-btn {
      background: var(--primary);
      color: #fff;
      border: none;
      border-radius: 50px;
      padding: 10px 20px;
      font-size: 0.88rem;
      font-weight: 700;
      cursor: pointer;
      box-shadow: var(--clay-btn-shadow);
      transition: all 0.2s ease;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .clay-btn:hover { background: var(--primary-dark); transform: translateY(-2px); }
    .clay-btn-secondary { background: var(--secondary); box-shadow: 6px 8px 18px rgba(255,129,120,0.3); }
    .clay-btn-outline { background: #FFFFFF; color: var(--text); box-shadow: 4px 6px 14px rgba(0,0,0,0.06); }
    
    .clay-input {
      width: 100%;
      background: #FAF8FF;
      border: 1px solid rgba(121, 87, 232, 0.15);
      border-radius: 16px;
      padding: 11px 16px;
      font-size: 0.9rem;
      color: var(--text);
      outline: none;
      box-shadow: inset 2px 2px 5px rgba(121, 87, 232, 0.08);
    }
    .clay-badge {
      padding: 4px 10px;
      border-radius: 50px;
      font-size: 0.72rem;
      font-weight: 800;
      text-transform: uppercase;
      display: inline-block;
    }
    .badge-confirmed { background: #EAE4FF; color: var(--primary); }
    .badge-processing { background: #FFF4DC; color: #C47900; }
    .badge-shipped { background: #E6F3FA; color: #0284C7; }
    .badge-delivered { background: #E6F8F0; color: #189862; }
    .badge-cancelled { background: #FFE8E6; color: #FF4D3D; }

    /* Admin Navigation */
    header {
      background: #FFFFFF;
      padding: 14px 28px;
      border-bottom: 1px solid rgba(121, 87, 232, 0.08);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .admin-brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .brand-icon {
      width: 40px;
      height: 40px;
      border-radius: 12px;
      background: linear-gradient(135deg, var(--primary), var(--secondary));
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
    }
    .admin-container {
      max-width: 1380px;
      margin: 24px auto;
      padding: 0 20px;
      flex: 1;
      width: 100%;
    }
    .nav-tabs {
      display: flex;
      gap: 12px;
      margin-bottom: 24px;
      flex-wrap: wrap;
    }
    .nav-tab-btn {
      padding: 10px 22px;
      border-radius: 50px;
      border: none;
      background: #FFFFFF;
      font-size: 0.88rem;
      font-weight: 700;
      color: var(--text-muted);
      cursor: pointer;
      box-shadow: 4px 6px 14px rgba(0,0,0,0.05);
      transition: all 0.2s;
    }
    .nav-tab-btn.active {
      background: var(--primary);
      color: #fff;
      box-shadow: var(--clay-btn-shadow);
    }

    /* Metric Cards */
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }
    .metric-card {
      background: #FFFFFF;
      border-radius: 22px;
      padding: 22px;
      box-shadow: var(--clay-card-shadow);
      display: flex;
      flex-direction: column;
    }
    .metric-label {
      font-size: 0.8rem;
      font-weight: 700;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .metric-val {
      font-size: 1.8rem;
      font-weight: 800;
      color: var(--text);
      margin-top: 6px;
    }

    /* Table Styles */
    .table-responsive {
      overflow-x: auto;
      margin-top: 16px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
    }
    th {
      padding: 12px 16px;
      font-size: 0.78rem;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-muted);
      border-bottom: 2px solid #F5F2FF;
    }
    td {
      padding: 14px 16px;
      font-size: 0.88rem;
      border-bottom: 1px solid #FAF8FF;
      vertical-align: middle;
    }
    tr:hover td {
      background: #FAF8FF;
    }

    /* Modal */
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(36, 33, 59, 0.45);
      backdrop-filter: blur(4px);
      z-index: 1000;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }
    .modal-overlay.open { display: flex; }
    .modal-window {
      background: #FFFFFF;
      border-radius: 28px;
      max-width: 580px;
      width: 100%;
      padding: 28px;
      box-shadow: 20px 30px 60px rgba(0,0,0,0.2);
      max-height: 90vh;
      overflow-y: auto;
    }

    /* Login Box */
    .admin-login-wrap {
      max-width: 400px;
      margin: 80px auto;
      background: #FFFFFF;
      border-radius: 28px;
      padding: 36px 30px;
      box-shadow: var(--clay-card-shadow);
      text-align: center;
    }

    /* Toast */
    .toast-box {
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: #24213B;
      color: #fff;
      padding: 12px 24px;
      border-radius: 50px;
      font-size: 0.88rem;
      font-weight: 600;
      display: none;
      z-index: 2000;
    }
    .toast-box.show { display: block; }
  </style>
</head>
<body>

  <!-- ADMIN LOGIN VIEW -->
  <div id="loginScreen" style="display:none;">
    <div class="admin-login-wrap">
      <div style="width:54px; height:54px; border-radius:18px; background:linear-gradient(135deg, var(--primary), var(--secondary)); color:#fff; display:flex; align-items:center; justify-content:center; font-size:1.6rem; font-weight:800; margin:0 auto 16px;">
        E
      </div>
      <h2 style="font-size:1.4rem; font-weight:800; margin-bottom:4px;">Admin Portal</h2>
      <p style="font-size:0.82rem; color:var(--text-muted); margin-bottom:24px;">EasyKart Command Center</p>
      
      <form onsubmit="handleAdminLogin(event)" style="display:flex; flex-direction:column; gap:14px; text-align:left;">
        <div>
          <label style="font-size:0.75rem; font-weight:700;">Admin Username</label>
          <input type="text" id="adminUser" class="clay-input" required placeholder="admin">
        </div>
        <div>
          <label style="font-size:0.75rem; font-weight:700;">Secret Password</label>
          <input type="password" id="adminPass" class="clay-input" required placeholder="••••••••">
        </div>
        <button type="submit" class="clay-btn" style="margin-top:8px; justify-content:center;">Authenticate 🔐</button>
      </form>
    </div>
  </div>

  <!-- AUTHENTICATED DASHBOARD VIEW -->
  <div id="dashboardScreen" style="display:none;">
    <header>
      <div class="admin-brand">
        <div class="brand-icon">E</div>
        <div>
          <h2 style="font-size:1.15rem; font-weight:800;">EasyKart Admin</h2>
          <span style="font-size:0.72rem; color:var(--text-muted); font-weight:700;">Live MongoDB Dashboard</span>
        </div>
      </div>
      <div style="display:flex; align-items:center; gap:12px;">
        <a href="/" target="_blank" class="clay-btn clay-btn-outline" style="text-decoration:none;">View Customer Store ↗</a>
        <button class="clay-btn clay-btn-secondary" onclick="handleAdminLogout()">Logout</button>
      </div>
    </header>

    <div class="admin-container">
      <!-- Tabs Navigation -->
      <div class="nav-tabs">
        <button class="nav-tab-btn active" onclick="switchTab('overview')">📊 Overview</button>
        <button class="nav-tab-btn" onclick="switchTab('products')">📦 Products</button>
        <button class="nav-tab-btn" onclick="switchTab('orders')">🛒 Orders</button>
        <button class="nav-tab-btn" onclick="switchTab('customers')">👥 Customers</button>
        <button class="nav-tab-btn" onclick="switchTab('settings')">⚙️ Settings</button>
      </div>

      <!-- TAB 1: OVERVIEW -->
      <div id="tabOverview">
        <div class="metrics-grid">
          <div class="metric-card">
            <span class="metric-label">Total Revenue</span>
            <span class="metric-val" id="statRevenue">₹0</span>
          </div>
          <div class="metric-card">
            <span class="metric-label">Total Orders</span>
            <span class="metric-val" id="statOrders">0</span>
          </div>
          <div class="metric-card">
            <span class="metric-label">Total Products</span>
            <span class="metric-val" id="statProducts">0</span>
          </div>
          <div class="metric-card">
            <span class="metric-label">Registered Customers</span>
            <span class="metric-val" id="statCustomers">0</span>
          </div>
          <div class="metric-card">
            <span class="metric-label">Pending / Confirmed</span>
            <span class="metric-val" id="statPending" style="color:#C47900;">0</span>
          </div>
          <div class="metric-card">
            <span class="metric-label">Delivered Orders</span>
            <span class="metric-val" id="statDelivered" style="color:var(--success);">0</span>
          </div>
        </div>

        <div class="clay-card">
          <h3 style="font-size:1.1rem; font-weight:800; margin-bottom:12px;">Recent Orders</h3>
          <div class="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Customer</th>
                  <th>Items</th>
                  <th>Total</th>
                  <th>Payment</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody id="recentOrdersTbody">
                <tr><td colspan="6" style="text-align:center; padding:20px;">Loading overview...</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- TAB 2: PRODUCTS MANAGEMENT -->
      <div id="tabProducts" style="display:none;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:18px;">
          <h3 style="font-size:1.2rem; font-weight:800;">Catalog Inventory</h3>
          <button class="clay-btn" onclick="openProductModal()">+ Add New Product</button>
        </div>
        <div class="clay-card">
          <div class="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>Image</th>
                  <th>Title</th>
                  <th>Category</th>
                  <th>Price</th>
                  <th>Stock</th>
                  <th>Badge</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody id="productsTableBody">
                <!-- Injected via JS -->
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- TAB 3: ORDERS MANAGEMENT -->
      <div id="tabOrders" style="display:none;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:18px;">
          <h3 style="font-size:1.2rem; font-weight:800;">All Customer Orders</h3>
          <button class="clay-btn clay-btn-outline" onclick="loadAdminOrders()">Refresh Orders 🔄</button>
        </div>
        <div class="clay-card">
          <div class="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Date</th>
                  <th>Customer</th>
                  <th>Shipping Address</th>
                  <th>Items</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Update Status</th>
                </tr>
              </thead>
              <tbody id="ordersTableBody">
                <!-- Injected via JS -->
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- TAB 4: CUSTOMERS DIRECTORY -->
      <div id="tabCustomers" style="display:none;">
        <div style="margin-bottom:18px;">
          <h3 style="font-size:1.2rem; font-weight:800;">Registered Customers</h3>
        </div>
        <div class="clay-card">
          <div class="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>Customer Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Address</th>
                  <th>Member Since</th>
                </tr>
              </thead>
              <tbody id="customersTableBody">
                <!-- Injected via JS -->
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- TAB 5: STORE SETTINGS -->
      <div id="tabSettings" style="display:none;">
        <div class="clay-card" style="max-width:700px;">
          <h3 style="font-size:1.2rem; font-weight:800; margin-bottom:18px;">Store Settings & Rules</h3>
          <form onsubmit="handleSaveSettings(event)" style="display:flex; flex-direction:column; gap:14px;">
            <div>
              <label style="font-size:0.75rem; font-weight:700;">Store Name</label>
              <input type="text" id="setStoreName" class="clay-input" required>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
              <div>
                <label style="font-size:0.75rem; font-weight:700;">Helpline Phone</label>
                <input type="text" id="setPhone" class="clay-input" required>
              </div>
              <div>
                <label style="font-size:0.75rem; font-weight:700;">Support Email</label>
                <input type="email" id="setEmail" class="clay-input" required>
              </div>
            </div>
            <div>
              <label style="font-size:0.75rem; font-weight:700;">Headquarters Address</label>
              <input type="text" id="setAddress" class="clay-input" required>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
              <div>
                <label style="font-size:0.75rem; font-weight:700;">Free Shipping Above (₹)</label>
                <input type="number" id="setFreeShip" class="clay-input" required>
              </div>
              <div>
                <label style="font-size:0.75rem; font-weight:700;">Flat Shipping Charge (₹)</label>
                <input type="number" id="setShipFee" class="clay-input" required>
              </div>
            </div>
            <div>
              <label style="font-size:0.75rem; font-weight:700;">Homepage Promo Banner Text</label>
              <input type="text" id="setPromo" class="clay-input" required>
            </div>
            <button type="submit" class="clay-btn" style="margin-top:10px;">Save Configuration 💾</button>
          </form>
        </div>
      </div>
    </div>
  </div>

  <!-- ADD / EDIT PRODUCT MODAL -->
  <div class="modal-overlay" id="productModal">
    <div class="modal-window">
      <h3 id="productModalTitle" style="font-size:1.3rem; font-weight:800; margin-bottom:16px;">Add New Product</h3>
      <form onsubmit="handleSaveProduct(event)" style="display:flex; flex-direction:column; gap:12px;">
        <input type="hidden" id="prodEditId">
        <div>
          <label style="font-size:0.75rem; font-weight:700;">Product Title *</label>
          <input type="text" id="prodName" class="clay-input" required placeholder="e.g. Wireless ANC Headphones">
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          <div>
            <label style="font-size:0.75rem; font-weight:700;">Category *</label>
            <select id="prodCategory" class="clay-input">
              <option value="Electronics">Electronics</option>
              <option value="Watches">Watches</option>
              <option value="Men's Clothing">Men's Clothing</option>
              <option value="Women's Clothing">Women's Clothing</option>
              <option value="Shoes">Shoes</option>
              <option value="Beauty & Care">Beauty & Care</option>
              <option value="Home & Living">Home & Living</option>
              <option value="Accessories">Accessories</option>
            </select>
          </div>
          <div>
            <label style="font-size:0.75rem; font-weight:700;">Badge</label>
            <input type="text" id="prodBadge" class="clay-input" placeholder="BESTSELLER / NEW / DEAL">
          </div>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px;">
          <div>
            <label style="font-size:0.75rem; font-weight:700;">Original Price (₹) *</label>
            <input type="number" id="prodPrice" class="clay-input" required placeholder="2499">
          </div>
          <div>
            <label style="font-size:0.75rem; font-weight:700;">Discount Price (₹) *</label>
            <input type="number" id="prodDiscountPrice" class="clay-input" required placeholder="1499">
          </div>
          <div>
            <label style="font-size:0.75rem; font-weight:700;">Stock Units *</label>
            <input type="number" id="prodStock" class="clay-input" required placeholder="25">
          </div>
        </div>
        <div>
          <label style="font-size:0.75rem; font-weight:700;">Image URL</label>
          <input type="url" id="prodImage" class="clay-input" placeholder="https://images.unsplash.com/...">
        </div>
        <div>
          <label style="font-size:0.75rem; font-weight:700;">Description</label>
          <textarea id="prodDesc" class="clay-input" rows="2" placeholder="Key acoustic & build specifications..."></textarea>
        </div>
        <div style="display:flex; gap:12px; margin-top:12px;">
          <button type="submit" class="clay-btn" style="flex:1;">Save to MongoDB</button>
          <button type="button" class="clay-btn clay-btn-outline" onclick="closeProductModal()">Cancel</button>
        </div>
      </form>
    </div>
  </div>

  <div class="toast-box" id="toast">Notification</div>

  <script>
    let adminToken = localStorage.getItem('easykart_admin_token') || '';

    window.addEventListener('DOMContentLoaded', () => {
      if (adminToken) {
        showDashboard();
      } else {
        document.getElementById('loginScreen').style.display = 'block';
      }
    });

    async function handleAdminLogin(e) {
      e.preventDefault();
      const username = document.getElementById('adminUser').value.trim();
      const password = document.getElementById('adminPass').value.trim();

      try {
        const res = await fetch('/api/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (data.success) {
          adminToken = data.token;
          localStorage.setItem('easykart_admin_token', adminToken);
          showDashboard();
          showToast('Welcome to Admin Command Center 🚀');
        } else {
          showToast(data.error || 'Authentication failed.');
        }
      } catch (err) {
        showToast('Server connection error.');
      }
    }

    function handleAdminLogout() {
      localStorage.removeItem('easykart_admin_token');
      adminToken = '';
      location.reload();
    }

    function showDashboard() {
      document.getElementById('loginScreen').style.display = 'none';
      document.getElementById('dashboardScreen').style.display = 'block';
      loadOverviewStats();
    }

    function switchTab(tab) {
      const tabs = ['overview', 'products', 'orders', 'customers', 'settings'];
      tabs.forEach((t, i) => {
        const wrap = document.getElementById('tab' + t.charAt(0).toUpperCase() + t.slice(1));
        const btn = document.querySelectorAll('.nav-tab-btn')[i];
        if (t === tab) {
          wrap.style.display = 'block';
          btn.classList.add('active');
        } else {
          wrap.style.display = 'none';
          btn.classList.remove('active');
        }
      });

      if (tab === 'overview') loadOverviewStats();
      if (tab === 'products') loadAdminProducts();
      if (tab === 'orders') loadAdminOrders();
      if (tab === 'customers') loadAdminCustomers();
      if (tab === 'settings') loadAdminSettings();
    }

    async function authFetch(url, options = {}) {
      options.headers = options.headers || {};
      options.headers['Authorization'] = 'Bearer ' + adminToken;
      const res = await fetch(url, options);
      if (res.status === 401) {
        handleAdminLogout();
        throw new Error('Session expired.');
      }
      return res.json();
    }

    // Load Stats
    async function loadOverviewStats() {
      try {
        const data = await authFetch('/api/admin/stats');
        if (data.success) {
          const s = data.stats;
          document.getElementById('statRevenue').innerText = '₹' + s.totalRevenue.toLocaleString('en-IN');
          document.getElementById('statOrders').innerText = s.totalOrders;
          document.getElementById('statProducts').innerText = s.totalProducts;
          document.getElementById('statCustomers').innerText = s.totalCustomers;
          document.getElementById('statPending').innerText = s.pendingOrders;
          document.getElementById('statDelivered').innerText = s.deliveredOrders;

          const recentTbody = document.getElementById('recentOrdersTbody');
          if (data.recentOrders.length) {
            recentTbody.innerHTML = data.recentOrders.map(o => \`
              <tr>
                <td><strong>\${o.orderId}</strong></td>
                <td>\${o.customer.name}<br><small style="color:var(--text-muted)">\${o.customer.phone}</small></td>
                <td>\${o.items.length} items</td>
                <td><strong>₹\${o.totalAmount.toLocaleString('en-IN')}</strong></td>
                <td><small>\${o.paymentMethod}</small></td>
                <td><span class="clay-badge badge-\${o.orderStatus.toLowerCase()}">\${o.orderStatus}</span></td>
              </tr>
            \`).join('');
          } else {
            recentTbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No orders recorded yet.</td></tr>';
          }
        }
      } catch (e) {
        console.error(e);
      }
    }

    // Products Management
    async function loadAdminProducts() {
      const tbody = document.getElementById('productsTableBody');
      try {
        const data = await authFetch('/api/admin/products');
        if (data.success) {
          tbody.innerHTML = data.products.map(p => \`
            <tr>
              <td><img src="\${p.image}" style="width:44px; height:44px; border-radius:10px; object-fit:cover;"></td>
              <td><strong>\${p.name}</strong></td>
              <td>\${p.category}</td>
              <td>₹\${p.discountPrice.toLocaleString('en-IN')} <small style="color:var(--text-muted); text-decoration:line-through;">₹\${p.price}</small></td>
              <td>\${p.stock}</td>
              <td><span class="clay-badge badge-deal">\${p.badge || 'NEW'}</span></td>
              <td>
                <button class="clay-btn clay-btn-outline" style="padding:6px 12px; font-size:0.75rem;" onclick='editProduct(\${JSON.stringify(p)})'>Edit</button>
                <button class="clay-btn clay-btn-secondary" style="padding:6px 12px; font-size:0.75rem;" onclick="deleteProduct('\${p._id}')">Delete</button>
              </td>
            </tr>
          \`).join('');
        }
      } catch (e) {
        tbody.innerHTML = '<tr><td colspan="7" style="color:#FF4D3D; text-align:center;">Error loading catalog.</td></tr>';
      }
    }

    function openProductModal() {
      document.getElementById('productModalTitle').innerText = 'Add New Product';
      document.getElementById('prodEditId').value = '';
      document.getElementById('prodName').value = '';
      document.getElementById('prodCategory').value = 'Electronics';
      document.getElementById('prodBadge').value = 'NEW';
      document.getElementById('prodPrice').value = '';
      document.getElementById('prodDiscountPrice').value = '';
      document.getElementById('prodStock').value = '25';
      document.getElementById('prodImage').value = '';
      document.getElementById('prodDesc').value = '';
      document.getElementById('productModal').classList.add('open');
    }

    function editProduct(p) {
      document.getElementById('productModalTitle').innerText = 'Edit Product';
      document.getElementById('prodEditId').value = p._id;
      document.getElementById('prodName').value = p.name;
      document.getElementById('prodCategory').value = p.category;
      document.getElementById('prodBadge').value = p.badge || 'NEW';
      document.getElementById('prodPrice').value = p.price;
      document.getElementById('prodDiscountPrice').value = p.discountPrice;
      document.getElementById('prodStock').value = p.stock;
      document.getElementById('prodImage').value = p.image;
      document.getElementById('prodDesc').value = p.description || '';
      document.getElementById('productModal').classList.add('open');
    }

    function closeProductModal() {
      document.getElementById('productModal').classList.remove('open');
    }

    async function handleSaveProduct(e) {
      e.preventDefault();
      const id = document.getElementById('prodEditId').value;
      const payload = {
        name: document.getElementById('prodName').value,
        category: document.getElementById('prodCategory').value,
        badge: document.getElementById('prodBadge').value,
        price: document.getElementById('prodPrice').value,
        discountPrice: document.getElementById('prodDiscountPrice').value,
        stock: document.getElementById('prodStock').value,
        image: document.getElementById('prodImage').value,
        description: document.getElementById('prodDesc').value,
      };

      const url = id ? '/api/admin/products/' + id : '/api/admin/products';
      const method = id ? 'PUT' : 'POST';

      try {
        const data = await authFetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (data.success) {
          closeProductModal();
          loadAdminProducts();
          showToast('Product saved successfully! ✨');
        }
      } catch (err) {
        showToast('Failed to save product.');
      }
    }

    async function deleteProduct(id) {
      if (!confirm('Are you sure you want to delete this product from MongoDB?')) return;
      try {
        const data = await authFetch('/api/admin/products/' + id, { method: 'DELETE' });
        if (data.success) {
          loadAdminProducts();
          showToast('Product deleted.');
        }
      } catch (e) {
        showToast('Delete failed.');
      }
    }

    // Orders Management
    async function loadAdminOrders() {
      const tbody = document.getElementById('ordersTableBody');
      try {
        const data = await authFetch('/api/admin/orders');
        if (data.success) {
          tbody.innerHTML = data.orders.map(o => \`
            <tr>
              <td><strong>\${o.orderId}</strong></td>
              <td><small>\${new Date(o.createdAt).toLocaleDateString()}</small></td>
              <td>\${o.customer.name}<br><small style="color:var(--text-muted)">\${o.customer.phone}</small></td>
              <td><small>\${o.shippingAddress.address}, \${o.shippingAddress.city} - \${o.shippingAddress.pincode}</small></td>
              <td><small>\${o.items.map(i => i.name + ' (x' + i.quantity + ')').join(', ')}</small></td>
              <td><strong>₹\${o.totalAmount.toLocaleString('en-IN')}</strong></td>
              <td><span class="clay-badge badge-\${o.orderStatus.toLowerCase()}">\${o.orderStatus}</span></td>
              <td>
                <select class="clay-input" style="padding:6px; font-size:0.8rem;" onchange="updateOrderStatus('\${o._id}', this.value)">
                  <option value="Confirmed" \${o.orderStatus === 'Confirmed' ? 'selected' : ''}>Confirmed</option>
                  <option value="Processing" \${o.orderStatus === 'Processing' ? 'selected' : ''}>Processing</option>
                  <option value="Shipped" \${o.orderStatus === 'Shipped' ? 'selected' : ''}>Shipped</option>
                  <option value="Delivered" \${o.orderStatus === 'Delivered' ? 'selected' : ''}>Delivered</option>
                  <option value="Cancelled" \${o.orderStatus === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
                </select>
              </td>
            </tr>
          \`).join('');
        }
      } catch (e) {
        tbody.innerHTML = '<tr><td colspan="8" style="color:#FF4D3D; text-align:center;">Error loading orders.</td></tr>';
      }
    }

    async function updateOrderStatus(id, status) {
      try {
        const data = await authFetch('/api/admin/orders/' + id + '/status', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderStatus: status })
        });
        if (data.success) {
          showToast('Order status updated to ' + status + ' ✓');
        }
      } catch (e) {
        showToast('Status update failed.');
      }
    }

    // Customers Directory
    async function loadAdminCustomers() {
      const tbody = document.getElementById('customersTableBody');
      try {
        const data = await authFetch('/api/admin/customers');
        if (data.success) {
          tbody.innerHTML = data.customers.map(c => \`
            <tr>
              <td><strong>\${c.name}</strong></td>
              <td>\${c.email}</td>
              <td>\${c.phone || '-'}</td>
              <td><small>\${c.address ? c.address.address + ', ' + c.address.city : 'Not saved yet'}</small></td>
              <td><small>\${new Date(c.createdAt).toLocaleDateString()}</small></td>
            </tr>
          \`).join('');
        }
      } catch (e) {
        tbody.innerHTML = '<tr><td colspan="5" style="color:#FF4D3D; text-align:center;">Error loading customers.</td></tr>';
      }
    }

    // Settings
    async function loadAdminSettings() {
      try {
        const data = await authFetch('/api/admin/settings');
        if (data.success && data.settings) {
          const s = data.settings;
          document.getElementById('setStoreName').value = s.storeName || '';
          document.getElementById('setPhone').value = s.phone || '';
          document.getElementById('setEmail').value = s.email || '';
          document.getElementById('setAddress').value = s.address || '';
          document.getElementById('setFreeShip').value = s.freeShippingThreshold || 999;
          document.getElementById('setShipFee').value = s.shippingFee || 99;
          document.getElementById('setPromo').value = s.promoBanner || '';
        }
      } catch (e) {
        console.error(e);
      }
    }

    async function handleSaveSettings(e) {
      e.preventDefault();
      const payload = {
        storeName: document.getElementById('setStoreName').value,
        phone: document.getElementById('setPhone').value,
        email: document.getElementById('setEmail').value,
        address: document.getElementById('setAddress').value,
        freeShippingThreshold: document.getElementById('setFreeShip').value,
        shippingFee: document.getElementById('setShipFee').value,
        promoBanner: document.getElementById('setPromo').value
      };
      try {
        const data = await authFetch('/api/admin/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (data.success) {
          showToast('Store settings saved successfully! ⚙️');
        }
      } catch (err) {
        showToast('Settings update failed.');
      }
    }

    function showToast(msg) {
      const box = document.getElementById('toast');
      box.innerText = msg;
      box.classList.add('show');
      setTimeout(() => box.classList.remove('show'), 3500);
    }
  </script>
</body>
</html>`);
});

const PORT = process.env.PORT || 3001;
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`EasyKart Admin running at http://localhost:${PORT}`);
  });
}

module.exports = app;