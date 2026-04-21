# 🛒 Checkout Rules — Hide, Sort & Control Payment and Shipping at Checkout

> A custom Shopify app built for **Worthy Products (VJ Trading)** that automatically shows or hides payment methods and shipping options at checkout based on who the customer is.

---

## 🤔 What Does This App Do? (Simple Explanation)

Imagine your online store has two types of customers:

- 🧑 **Regular customers (B2C)** — everyday shoppers who pay by credit card
- 🏢 **Business customers (B2B)** — companies who pay via a monthly account

The problem: Shopify shows the same payment options to *everyone*. So your business customers see credit card options they don't need, and regular customers see "Monthly Account Payment" they shouldn't use.

This app **automatically shows the right payment and shipping options to the right customers** — no manual work needed for your staff.

---

## ✨ What It Controls

### 💳 Payment Methods
| Customer Type | What They See at Checkout |
|---|---|
| Regular customer (no tags) | Credit card only |
| Accredo customer | Monthly Account Payment (first) + Credit Card |
| Corporate customer (Caltex, NZMPEA, etc.) | Monthly Account Payment only |

### 🚚 Shipping Methods
| Customer Type | Shipping Options |
|---|---|
| Regular customer | Standard paid shipping |
| Corporate / Accredo customer | Free shipping options available |

---

## 🏗️ How It Works (Behind the Scenes)

```
Customer logs in → has tags in Shopify
        ↓
App syncs those tags to a hidden "groups" field on the customer
        ↓
Customer goes to checkout
        ↓
Shopify Function reads the "groups" field
        ↓
Shows/hides/reorders payment & shipping methods instantly
```

The magic happens in **two parts**:

1. **Tag Sync** — Whenever a customer's tags change in Shopify, a webhook fires and the app updates a hidden metafield with those tags. This is the "memory" the checkout reads.

2. **Shopify Function** — A tiny piece of code that runs *inside Shopify's checkout* (not on our server) that reads the customer's tags and applies the rules in real time.

---

## 🗂️ Project Structure

```
checkout-rules/
├── web/                          # The Remix web app (admin UI + API)
│   └── app/
│       ├── routes/
│       │   ├── app._index.jsx    # Main rules list page
│       │   ├── app.rules.$id.jsx # Rule editor (create/edit rules)
│       │   ├── app.debug.jsx     # Debug tool (test customer state)
│       │   ├── app.sync.jsx      # Bulk sync endpoint
│       │   └── webhooks.jsx      # Shopify webhook handler
│       └── utils/
│           └── sync.server.js    # Core sync logic (bulk + single customer)
│
├── extensions/
│   ├── b2b-payment-rules/        # Shopify Function: payment method logic
│   └── b2b-delivery-rules/       # Shopify Function: shipping method logic
│
└── README.md                     # This file
```

---

## 🚀 Setup & Deployment

### Requirements
- Node.js 18+
- Shopify Partner account
- Shopify Plus store (required for Payment/Delivery Customizations)
- Render account (for hosting)

### Local Development
```bash
npm install
npm run dev
```

### Deploy to Render
The app is hosted on [Render](https://render.com). Every push to `main` on GitHub triggers an automatic redeploy.

```bash
git add .
git commit -m "Your change"
git push origin main
```

⚠️ **After every deploy:** Re-open the app via the Shopify admin link to restore your session:
```
https://admin.shopify.com/store/vjtrading/apps/checkout-rules
```

### Deploy the Shopify Function
When you change the checkout function logic (`extensions/`), you must redeploy it:
```bash
shopify app deploy --force
```

---

## 🎛️ How to Use the App

### Creating a Rule
1. Open the app in Shopify Admin
2. Click **New payment rule** or **New delivery rule**
3. Choose **Customer Tags mode**
4. Add the customer tags this rule applies to
5. Toggle each payment/shipping method **Show** or **Hide**
6. Use **▲▼ arrows** to set the order (top = shown first at checkout)
7. Click **Save rule**

### After Saving Any Rule
The app automatically syncs customers in the background. No manual action needed.

### Manual Sync (if needed)
On the main page, click **"Sync customers from tags"** to force-update all customers.

### Debug Tool
Go to the **Debug** page to:
- Look up any customer by email
- See exactly what the checkout function will read
- Fix a single customer's sync if it's out of date

---

## ⚙️ Current Rules

### Payment Rules
| Rule Name | Applies To | Effect |
|---|---|---|
| B2C | Customers WITHOUT corporate tags | Hides Monthly Account Payment |
| General B2B Customers | Customers WITH `accredo` tag | Shows MAP first, Credit Card second |
| Corporate Customers B2B | Customers WITH caltex/mobil/NZMPEA/etc tags | Shows Monthly Account Payment only |

### Delivery Rules
| Rule Name | Applies To | Effect |
|---|---|---|
| Free Shipping Corporates | Corporate + Accredo customers | Shows free shipping options |
| B2C Customers Shipping | Customers WITHOUT corporate tags | Shows standard shipping only |

### Corporate Tags (as of today)
`caltex` `mobil` `accredo` `Fresh-Choice` `NZMPEA` `Metromart` `liquor-store`

---

## 🐛 Troubleshooting

### App shows blank / "Application Error"
This happens after a Render redeploy wipes the session. Fix:
1. Go to `https://admin.shopify.com/store/vjtrading/apps/checkout-rules`
2. The app will re-authenticate automatically

### Customer still sees wrong payment methods
1. Open **Debug** page
2. Look up the customer's email
3. If it shows "Out of sync" → click **Sync now → fix mismatch**
4. Test checkout again

### New customer tag isn't working at checkout
The webhook should auto-sync within seconds. If not:
1. Check the Debug page for that customer
2. Click the Sync button if out of sync
3. Or run the full **Sync customers from tags** from the main page

---

## 🔮 Future Improvements

See [`docs/DOCUMENTATION.md`](docs/DOCUMENTATION.md) for the full roadmap.

---

## 📞 Support

Built and maintained by the Worthy Products dev team.
App deployed at: `https://checkout-rules.onrender.com`
GitHub: `https://github.com/pratzs/checkout-rules`
