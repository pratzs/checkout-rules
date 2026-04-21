# 📖 Full App Documentation — Checkout Rules (Hide Pay & Ship)

> This document explains **everything** about the Checkout Rules app — from the big picture right down to every line of code. Written so that anyone (even a 10-year-old!) can follow along.

---

## Table of Contents

1. [The Problem We Were Solving](#1-the-problem-we-were-solving)
2. [The Solution — A Quick Overview](#2-the-solution--a-quick-overview)
3. [How the Whole System Fits Together](#3-how-the-whole-system-fits-together)
4. [The Admin App (Web UI)](#4-the-admin-app-web-ui)
5. [The Shopify Functions (The Checkout Brain)](#5-the-shopify-functions-the-checkout-brain)
6. [The Customer Groups Metafield (The Memory)](#6-the-customer-groups-metafield-the-memory)
7. [Webhooks — Keeping Things Up to Date](#7-webhooks--keeping-things-up-to-date)
8. [The Sync System](#8-the-sync-system)
9. [Every File Explained](#9-every-file-explained)
10. [Current Rules in Production](#10-current-rules-in-production)
11. [How to Add or Change a Rule](#11-how-to-add-or-change-a-rule)
12. [The Debug Page — Your Best Friend](#12-the-debug-page--your-best-friend)
13. [Project History — From Start to Today](#13-project-history--from-start-to-today)
14. [Bugs We Found and Fixed](#14-bugs-we-found-and-fixed)
15. [Deployment Guide (Render + Shopify)](#15-deployment-guide-render--shopify)
16. [Future Improvements Roadmap](#16-future-improvements-roadmap)
17. [Glossary (Words Made Simple)](#17-glossary-words-made-simple)

---

## 1. The Problem We Were Solving

### The Store: Worthy Products (VJ Trading)

Worthy Products sells to two very different groups of people:

**Group 1 — Regular Shoppers (B2C)**
- These are everyday people buying online
- They pay with a credit card, just like on any normal website
- They pay for shipping

**Group 2 — Business Customers (B2B)**
- These are companies like Caltex, Mobil, Fresh-Choice, etc.
- They have a special arrangement — they get a **monthly bill** instead of paying by card each time
- Some of them get **free shipping** because of their contract

### The Problem With Shopify Out of the Box

Shopify normally shows the **same checkout to everyone**. That means:

- A Caltex employee clicks "Checkout" and sees "Pay by Credit Card" — but they're not supposed to use that!
- A regular customer clicks "Checkout" and sees "Monthly Account Payment" — but they have no account!
- Corporate customers see paid shipping options even though they should get free shipping

This was confusing for customers and caused payment mistakes.

### What We Needed

We needed the checkout to be **smart**:
- Look at who is logged in
- Show only the right payment and shipping options for that person
- Do this automatically, every time, without staff having to do anything

---

## 2. The Solution — A Quick Overview

Think of it like a **bouncer at a club**. The bouncer checks your ID (your customer tags), looks at the list (the rules), and only lets in what's allowed.

Here's what we built:

```
1. Customer is logged in to the store (has Shopify tags like "accredo" or "caltex")
         ↓
2. A background process copies those tags into a special "memory" field on the customer
         ↓
3. Customer goes to checkout
         ↓
4. A tiny program running INSIDE Shopify reads the memory field
         ↓
5. It hides or reorders payment methods and shipping options in real time
         ↓
6. Customer only sees what they're supposed to see ✓
```

The app has **three main pieces**:

| Piece | What It Does |
|---|---|
| **Admin Web App** | Lets the Worthy Products team create and manage rules (which tags → which payment methods to show) |
| **Shopify Functions** | Tiny programs running inside Shopify's checkout that read the rules and apply them |
| **Sync System + Webhooks** | Makes sure the customer's memory field is always up to date with their tags |

---

## 3. How the Whole System Fits Together

Here is the full picture, step by step:

### Step 1 — Someone Creates a Rule

The Worthy Products team opens the app in Shopify Admin. They say: "Customers with the tag `caltex` should ONLY see Monthly Account Payment."

The app saves this rule as a **Payment Customization** in Shopify, with a metafield that stores:
```json
{
  "tags": ["caltex"],
  "conditionLogic": "ANY",
  "negate": false,
  "paymentMethods": [
    { "title": "Monthly Account Payment", "visible": true, "order": 0 },
    { "title": "Credit Card", "visible": false, "order": 1 }
  ]
}
```

### Step 2 — The Customer Gets a Memory Field

Whenever a customer's tags change (or when we run a bulk sync), the app writes all of their Shopify tags into a special hidden field called the **groups metafield**:

```
Customer: john@caltex.co.nz
Shopify tags: ["caltex", "nz-account"]
Groups metafield: ["caltex", "nz-account"]
```

This metafield is what the checkout reads. It's stored directly on the customer in Shopify.

### Step 3 — Checkout Runs the Function

When the customer goes to checkout, Shopify runs a **Shopify Function** — a tiny piece of code that:

1. Reads the customer's groups metafield
2. Looks at the rule configuration
3. Decides what to show or hide

This all happens inside Shopify — it's incredibly fast and doesn't go through our server at all.

### Step 4 — The Right Options Appear

The customer only sees the payment and shipping options that match their tags. Done!

---

## 4. The Admin App (Web UI)

The admin app is built using **Remix** (a web framework) and **Shopify Polaris** (Shopify's design system for admin apps). It's hosted on **Render**.

### Pages

#### Main Page (`/app`)
Shows a list of all current payment and delivery rules. From here you can:
- See all rules at a glance
- Click into any rule to edit it
- Create a new payment rule or delivery rule
- Run a manual "Sync customers from tags" if needed

#### Rule Editor (`/app/rules/:id`)
This is where you create or edit a rule. It has:

**Rule Name** — Give it a useful name like "Corporate Customers B2B"

**Mode selector** — Currently only "Customer Tags" mode is supported

**Tags input** — Which customer tags does this rule apply to? Add as many as you need.

**Condition logic** — ANY (customer has at least one of the tags) or ALL (customer must have all of them)

**Negate toggle** — When ON, the rule applies to customers who do NOT have the tags (used for B2C rules)

**Payment/Shipping methods list** — Each method has:
- A toggle (Show / Hide)
- Up/Down arrows to set the order (top = appears first at checkout)

After clicking **Save rule**, the app automatically kicks off a background sync of all customers.

#### Debug Page (`/app/debug`)
Your most important troubleshooting tool. It shows:
- All deployed Shopify Functions (so you can confirm they're actually installed)
- All Payment Customizations (rules) — enabled/disabled, which function they use, what they hide
- Customer lookup — type in any email and see exactly what the checkout function will read for that person

#### Sync Endpoint (`/app/sync`)
An internal endpoint that handles the bulk sync process. Called automatically after saving a rule, or manually from the main page.

#### Webhooks (`/webhooks`)
Handles incoming webhook events from Shopify. Specifically:
- `CUSTOMERS_UPDATE` — triggered when a customer's tags change
- `CUSTOMERS_CREATE` — triggered when a new customer is created

---

## 5. The Shopify Functions (The Checkout Brain)

Shopify Functions are special programs that run **inside Shopify's infrastructure**, not on our server. They're written in Rust (compiled to WebAssembly), which makes them extremely fast — they run in microseconds.

We have **two** functions:

### Function 1: B2B Payment Rules (`extensions/b2b-payment-rules`)

**What it does:** Decides which payment methods to show or hide at checkout.

**How it works:**

```
1. Read the customer's groups metafield (the list of their tags)
2. For each payment customization rule:
   a. Get the tags from the rule config
   b. Check if the customer's groups match (using ANY or ALL logic)
   c. Apply negate if needed (flip the match for B2C rules)
   d. If the rule matches:
      - Hide any methods marked as hidden
      - Reorder methods to the specified positions
3. Return the operations to Shopify
```

**The operations it can return:**
- `PaymentCustomizationResult::HidePaymentMethod` — completely removes a method from checkout
- `PaymentCustomizationResult::MovePaymentMethod` — moves a method to a specific position

**Important: How order/position works**

Shopify provides payment methods at checkout in some default order. The function uses `paymentMethodMove` to sort them. The rule config stores `order: 0` for first, `order: 1` for second, etc. Methods marked `visible: false` are hidden entirely.

### Function 2: B2B Delivery Rules (`extensions/b2b-delivery-rules`)

**What it does:** Decides which shipping methods (delivery options) to show or hide at checkout.

Works exactly the same way as the payment rules function, but for shipping instead.

### How the Function Reads the Rule Config

Each Payment/Delivery Customization in Shopify has a metafield attached to it. The function reads this metafield to get the rule configuration:

```
Namespace: $app:b2b-payment-rules
Key: function-configuration
Type: json
```

The value looks like this:
```json
{
  "tags": ["caltex", "mobil"],
  "conditionLogic": "ANY",
  "negate": false,
  "paymentMethods": [
    { "title": "Monthly Account Payment", "visible": true, "order": 0 },
    { "title": "Credit Card", "visible": false, "order": 1 }
  ]
}
```

### How the Function Reads the Customer's Groups

The function reads:
```
Namespace: $app:checkout-rules
Key: groups
Type: json
```

The value is a simple JSON array of the customer's tags:
```json
["caltex", "nz-account"]
```

If this metafield doesn't exist or is empty (`[]`), the customer is treated as a regular B2C customer.

---

## 6. The Customer Groups Metafield (The Memory)

### What It Is

Every customer in Shopify can have **metafields** — these are like extra custom data fields that you can attach to any object (products, customers, orders, etc.).

We use a metafield to store the customer's current tags so that the Shopify Function can read them at checkout.

**Why not just read the tags directly?**

Shopify Functions have very limited access to customer data at checkout time. They can only read data that's stored in metafields — they cannot query the full customer object. So we "pre-copy" the tags into a metafield that the function CAN read.

### The Metafield Details

| Field | Value |
|---|---|
| Namespace | `$app:checkout-rules` |
| Key | `groups` |
| Type | `json` |
| Value | A JSON array of tag strings, e.g. `["caltex", "nz-account"]` |

### What Happens When It's Empty or Missing

If a customer has NO groups metafield (or it's `[]`), the Shopify Function treats them as a regular B2C customer. The B2C rule (which has `negate: true`) then applies — hiding Monthly Account Payment and showing only Credit Card.

This is exactly what we want for new customers who haven't been synced yet, or regular shoppers who have no corporate tags.

### When It Gets Written

The groups metafield is written in three situations:

1. **Webhook fires** — When a customer's tags are changed in Shopify admin, a `customers/update` webhook fires and the app immediately updates the metafield
2. **Bulk sync** — When the team clicks "Sync customers from tags" on the main page
3. **After rule save** — When a rule is saved, the app automatically runs a bulk sync in the background
4. **Manual fix** — When the team uses the Debug page to manually sync a specific customer

---

## 7. Webhooks — Keeping Things Up to Date

### What Is a Webhook?

A webhook is like a phone call that Shopify makes to our app to say "Hey, something changed!" Instead of our app constantly asking Shopify "did anything change?" (which would be slow and wasteful), Shopify calls us the moment something happens.

### Which Webhooks We Use

| Webhook Topic | When It Fires | What We Do |
|---|---|---|
| `CUSTOMERS_UPDATE` | Any time a customer record changes | Re-sync their groups metafield |
| `CUSTOMERS_CREATE` | When a new customer registers | Write their initial groups metafield |

### The Tricky Problem We Solved

Here's a sneaky issue we discovered and fixed:

**The feedback loop problem:**
1. Customer gets the tag "caltex" added in Shopify Admin
2. Shopify fires `CUSTOMERS_UPDATE` webhook
3. Our app receives it and writes `["caltex"]` to the groups metafield
4. Writing the metafield triggers ANOTHER `CUSTOMERS_UPDATE` webhook (because the customer record changed!)
5. That second webhook arrives — but NOW the webhook payload's `tags` field can be empty or stale
6. Our old code trusted the payload tags → wrote `[]` to the metafield → erased the correct value!

**The fix:**

Instead of trusting the webhook payload, our webhook handler now **queries Shopify directly** to get the customer's actual live tags AND their current metafield value. Then it does a read-before-write check:

```
Webhook fires
    ↓
Query customer's LIVE tags + current metafield from Shopify
    ↓
Are the stored tags already the same as the live tags?
    YES → Do nothing (this was the metafield-write webhook, not a real tag change)
    NO  → Write the updated metafield
```

This breaks the feedback loop completely.

---

## 8. The Sync System

The sync system (`web/app/utils/sync.server.js`) has three functions:

### `syncSingleCustomer(admin, customerId, customerTags)`

Writes a single customer's tags to their groups metafield. Used by:
- The webhook handler (real-time sync for individual customers)
- The Debug page sync button (manual fix for one customer)

Returns any errors from the Shopify mutation so the caller can surface them.

### `bulkSync(admin, allRuleTags)`

Syncs ALL customers who have any of the rule tags. This is the big one.

**What it does:**
1. Fetches all customers who have any rule tag (using the Shopify Customer API)
2. Fetches all customers who already have a groups metafield (so we can find stale ones)
3. For customers with rule tags: writes their current tags to the metafield (but only if it has changed — skips unchanged ones to avoid triggering more webhooks)
4. For customers who USED TO have a rule tag but no longer do: clears their metafield to `[]`

**The chunking:**
Shopify's API limits how many metafield writes you can do in one request. We send them in chunks of 25, with a 300ms pause between chunks to avoid triggering a flood of `customers/update` webhooks.

### `getAllRuleTags(admin)`

Queries ALL payment and delivery customizations and collects every tag used in any rule. This is crucial for `bulkSync` — you need to pass ALL rule tags so that `bulkSync` knows which customers are "in scope."

**Why this matters (and the bug we fixed):**

Before the fix, when saving a rule, the code called `bulkSync(admin, config.tags)` — passing only the CURRENT rule's tags. So `bulkSync` would:
1. Find customers with THIS rule's tags → sync them ✓
2. Find customers with other rules' tags → NOT find them (wrong query) → see their metafields as stale → CLEAR THEM ✗

This was wiping metafields for customers under other rules! The fix was to call `getAllRuleTags(admin)` first to get all tags across all rules, then pass that to `bulkSync`.

---

## 9. Every File Explained

```
checkout-rules/
├── web/
│   └── app/
│       ├── routes/
│       │   ├── app._index.jsx       ← Main page: list of all rules
│       │   ├── app.rules.$id.jsx    ← Rule editor: create/edit a rule
│       │   ├── app.debug.jsx        ← Debug tool: inspect customer state
│       │   ├── app.sync.jsx         ← Sync endpoint (called by rule editor)
│       │   └── webhooks.jsx         ← Shopify webhook handler
│       └── utils/
│           └── sync.server.js       ← Core sync logic
│
├── extensions/
│   ├── b2b-payment-rules/
│   │   ├── src/main.rs              ← Rust code for payment function
│   │   └── shopify.extension.toml   ← Extension config
│   └── b2b-delivery-rules/
│       ├── src/main.rs              ← Rust code for delivery function
│       └── shopify.extension.toml   ← Extension config
│
├── shopify.app.toml                 ← App config (webhooks, scopes, etc.)
├── package.json                     ← Node.js dependencies
├── README.md                        ← Quick overview
└── docs/
    └── DOCUMENTATION.md             ← This file!
```

### `web/app/routes/app._index.jsx`
The main dashboard page. Displays all payment and delivery rules in two separate lists. Each rule shows its name, the tags it applies to, and which methods it affects. Has a "New payment rule" button, "New delivery rule" button, and a "Sync customers from tags" button for manual syncing.

### `web/app/routes/app.rules.$id.jsx`
The rule editor. Works for both creating new rules and editing existing ones. The `$id` in the URL is either `new` (create) or the Shopify GID of the payment/delivery customization.

When you save, it:
1. Builds the rule config JSON
2. Calls the Shopify API to create or update the Payment/Delivery Customization
3. Saves the rule config as a metafield on that customization
4. Kicks off a background `bulkSync` using all current rule tags

### `web/app/routes/app.debug.jsx`
The debug page. Has three sections:
1. **Customer lookup** — search by email, see their Shopify tags vs their stored groups metafield, sync if out of date
2. **Deployed functions** — lists all Shopify Functions currently installed (so you can check they're active)
3. **Payment customizations** — lists every rule with its enabled/disabled state, which function it uses, what it hides

### `web/app/routes/app.sync.jsx`
A simple server endpoint that the rule editor calls after saving. Runs `getAllRuleTags` → `bulkSync` → returns counts of how many customers were synced/cleared.

### `web/app/routes/webhooks.jsx`
Handles `CUSTOMERS_UPDATE` and `CUSTOMERS_CREATE` webhooks from Shopify.
- Queries the customer's live tags + current metafield
- Does a read-before-write check (skip if already in sync)
- Calls `syncSingleCustomer` if an update is needed

### `web/app/utils/sync.server.js`
The core sync logic. Three exported functions: `syncSingleCustomer`, `bulkSync`, `getAllRuleTags`. See [Section 8](#8-the-sync-system) for details.

### `extensions/b2b-payment-rules/src/main.rs`
The Rust code for the payment customization Shopify Function. Reads the function configuration metafield and the customer's groups metafield, then returns a list of operations (hide/move) for Shopify to apply at checkout.

### `extensions/b2b-delivery-rules/src/main.rs`
Same as above but for delivery/shipping options.

---

## 10. Current Rules in Production

### Payment Rules

#### Rule 1: B2C (Regular Customers)
- **Who it applies to:** Customers who do NOT have any corporate tag (`negate: true`)
- **What it does:** Hides "Monthly Account Payment"
- **Tags:** All corporate tags listed (used with negate)
- **Result:** Regular shoppers never see the monthly billing option

#### Rule 2: General B2B Customers
- **Who it applies to:** Customers with the `accredo` tag
- **What it does:** Shows Monthly Account Payment FIRST, Credit Card SECOND
- **Result:** Accredo customers can choose either payment method, but MAP is the default

#### Rule 3: Corporate Customers B2B
- **Who it applies to:** Customers with tags: `caltex`, `mobil`, `Fresh-Choice`, `NZMPEA`, `Metromart`, `liquor-store`
- **What it does:** Shows ONLY Monthly Account Payment (credit card is hidden)
- **Result:** Corporate accounts can ONLY use their monthly billing

### Delivery Rules

#### Rule 4: Free Shipping Corporates
- **Who it applies to:** Customers with any corporate tag (same list as above + `accredo`)
- **What it does:** Makes free shipping options visible
- **Result:** Corporate and Accredo customers don't pay for shipping

#### Rule 5: B2C Customers Shipping
- **Who it applies to:** Customers WITHOUT corporate tags (`negate: true`)
- **What it does:** Shows standard paid shipping only
- **Result:** Regular customers pay for shipping as normal

### Full List of Corporate Tags
`caltex` `mobil` `accredo` `Fresh-Choice` `NZMPEA` `Metromart` `liquor-store`

---

## 11. How to Add or Change a Rule

### Adding a New Tag to an Existing Rule

Example: You have a new corporate customer with tag `new-corp` who should get Monthly Account Payment only.

1. Open the app in Shopify Admin → `https://admin.shopify.com/store/vjtrading/apps/checkout-rules`
2. Click on **"Corporate Customers B2B"** rule
3. In the tags section, add `new-corp`
4. Click **Save rule**
5. The app will automatically sync all customers in the background

### Creating a Brand New Rule

1. Click **"New payment rule"** or **"New delivery rule"**
2. Give it a descriptive name
3. Choose **"Customer Tags"** mode
4. Enter the tag(s) this rule applies to
5. Set each payment/shipping method to Show or Hide
6. Use the ▲▼ arrows to set their order (topmost = first at checkout)
7. If you want the rule to apply to customers WITHOUT these tags (B2C style), toggle **Negate** on
8. Click **Save rule**

### Removing a Tag from a Rule

Same as adding — just edit the rule, remove the tag, save. The sync runs automatically.

### After Adding a New Corporate Customer

If you add a corporate tag to an existing customer in Shopify Admin:
- The webhook should auto-sync them within seconds
- Check the Debug page if something seems wrong

---

## 12. The Debug Page — Your Best Friend

URL: Open the app → click **Debug** in the sidebar (or navigate to `/app/debug`)

### What You'll See

**Section 1: Customer lookup**
Type in a customer's email address and click "Look up". You'll see:

- Their Shopify tags (what's stored on the customer in Shopify)
- Their groups metafield (what the checkout function will actually READ)
- A green "In sync ✓" badge if they match, or orange "Out of sync — click Sync" if they don't
- A "Sync now" button to immediately fix a mismatch

**Section 2: Deployed Shopify Functions**
Shows every Shopify Function currently installed. You should see:
- `b2b-payment-rules` with type `payment_customization`
- `b2b-delivery-rules` with type `delivery_customization`

If you don't see them here, the function hasn't been deployed and payment/shipping rules won't work at all.

**Section 3: All Payment Customizations**
Shows every rule with:
- Enabled/Disabled status
- Which function it uses (and whether that function is installed — a ✗ here means the rule is broken)
- What it hides
- Its tags, condition logic, and negate setting

### When To Use It

- Customer complains they're seeing the wrong payment methods → look up their email
- After adding a new customer to a corporate account → verify their sync
- Something seems broken → check the functions are deployed and customizations are enabled
- After a bulk sync → look up a few customers to confirm the data is correct

---

## 13. Project History — From Start to Today

### Where We Started

When we first picked up this project, Worthy Products had a problem: their Shopify store was showing the same checkout to ALL customers — corporate and regular alike. 

Corporate customers (like Caltex, Mobil, etc.) were seeing credit card options they weren't supposed to use. Regular shoppers were seeing "Monthly Account Payment" which is only for business accounts.

### What We Built First

The first version of the app created:
1. A Remix web app hosted on Render for managing rules
2. Two Shopify Functions (one for payments, one for shipping) deployed to Shopify
3. A webhook handler to sync customer tags when they change
4. A simple admin UI to create and manage rules

The core concept was solid — use customer tags to determine who sees what at checkout.

### The Render Free Tier Problem

Early on, the app was hosted on Render's **free tier**. The problem: Render's free tier has an **ephemeral filesystem** — meaning every time the app restarts (which happens often on the free tier), it wipes the `sessions.db` SQLite database.

This database stores the authentication session between our app and Shopify. When it was wiped, the app would show a blank page or "Application Error" because it couldn't authenticate with Shopify anymore.

The solution was upgrading to Render's **Starter plan** with a **persistent disk**. Now the sessions database survives restarts and the app stays connected.

> **Lesson:** Never use ephemeral storage for anything important. The free tier is great for testing, but production needs persistent storage.

### The Webhook Storm Problem

After getting the basic app working, we ran into a nasty problem:

1. We'd sync a customer's metafield
2. Shopify would fire a `customers/update` webhook (because the customer record changed)
3. Our webhook handler would try to sync again
4. This creates a loop!

We added a **read-before-write guard**: before writing a metafield, check if it already matches the customer's live tags. If yes, skip the write. This broke the feedback loop.

### The Empty Tags Bug

Even with the guard in place, we found customers' metafields being reset to `[]` after being synced. This was confusing and took some investigation to track down.

**Root cause:** When Shopify fires `customers/update` because a metafield changed, the webhook payload's `tags` field can come through as an empty string `""`. Our old code was reading tags from the payload and setting the metafield to `[]` — erasing the correct value we'd just written!

**Fix:** Stop trusting the webhook payload's tags. Instead, query Shopify's GraphQL API directly to get the customer's real, live tags before doing anything.

### The Auto-Sync Scope Bug (Critical)

This was the nastiest bug we found. Here's what was happening:

1. Someone edits the "Corporate Customers B2B" rule (tags: `caltex`, `mobil`, etc.)
2. After saving, the app runs a bulk sync
3. The bulk sync was called with ONLY the current rule's tags (`caltex`, `mobil`, etc.)
4. The bulk sync then looked for customers who have a metafield but aren't in the `caltex`/`mobil` query
5. It found `accredo` customers (who are covered by a DIFFERENT rule) and marked them as stale
6. It cleared their metafields to `[]`
7. Now `accredo` customers go to checkout with an empty groups field → treated as B2C!

**Fix:** Before running a bulk sync, always collect ALL tags from ALL rules first. Then pass that full set to `bulkSync` so it knows the full picture of who should have metafields.

### The Debug Page False Positives

The debug page was showing "STALE DATA ⚠️" for customers who were actually fine. The old comparison logic was wrong — it checked if the metafield was non-empty, but since we now store all tags in the metafield (not pre-filtered ones), a customer with any tags at all would always look "stale."

**Fix:** Proper comparison — sort both arrays and compare them as strings. Only flag as out-of-sync if the actual contents differ.

### Going Live

After all these fixes:
1. We ran a full bulk sync → 862 customers synced with their correct tags
2. Approximately 938 B2C customers left with empty metafields (correct — they have no corporate tags)
3. The webhook guard ensures new syncs stay correct
4. The debug page correctly shows sync status

The app was declared ready for production use.

---

## 14. Bugs We Found and Fixed

Here's a complete list of all the bugs found and fixed, in plain English:

### Bug 1: Stale session after Render restart (Severity: High)
**What happened:** The app showed a blank screen after Render restarted it.
**Why:** Render's free tier wipes all files on restart. The app's login database was getting deleted.
**Fix:** Moved to Render Starter plan with a persistent disk.

### Bug 2: Webhook feedback loop (Severity: Medium)
**What happened:** Every time we synced a customer, it would trigger another sync, and another, endlessly.
**Why:** Writing a metafield counts as a customer update, which fires the `customers/update` webhook.
**Fix:** Added a read-before-write check in the webhook handler. Skip the write if the metafield already matches.

### Bug 3: Webhook payload empty tags bug (Severity: Critical)
**What happened:** Customer metafields kept getting reset to `[]` even after a successful sync.
**Why:** When a metafield write triggers `customers/update`, Shopify's webhook payload sometimes has empty `tags`. Old code used those empty payload tags to write the metafield → overwrote the correct value with `[]`.
**Fix:** Stop reading tags from the webhook payload. Query the customer's live tags directly from Shopify's GraphQL API instead.

### Bug 4: Auto-sync clearing other rules' customers (Severity: Critical)
**What happened:** Saving one rule would silently wipe the metafields of customers covered by other rules.
**Why:** Auto-sync after save called `bulkSync(admin, thisRule.tags)` — only passing the saved rule's tags. `bulkSync` would then see other tagged customers as "stale" and clear them.
**Fix:** Before running bulk sync, call `getAllRuleTags(admin)` to collect ALL tags from ALL rules, then pass that full set to `bulkSync`.

### Bug 5: Debug page false "STALE DATA" (Severity: Low)
**What happened:** Debug page said customers were stale when they weren't.
**Why:** Old comparison logic was wrong — it was comparing arrays incorrectly.
**Fix:** Sort both tag arrays and compare as joined strings. Show "Out of sync" only when the sorted arrays differ.

### Bug 6: Silent sync failures in debug page (Severity: Medium)
**What happened:** Clicking "Sync now" in debug page appeared to succeed even when it silently failed.
**Why:** `syncSingleCustomer` wasn't returning errors — it swallowed them.
**Fix:** Return `userErrors` from the Shopify mutation. Show a red error banner in the debug UI if the write fails.

---

## 15. Deployment Guide (Render + Shopify)

### The Web App (Render)

The web app is hosted at `https://checkout-rules.onrender.com`.

**Auto-deploy:** Every push to the `main` branch on GitHub automatically triggers a redeploy on Render.

**After a redeploy:** You may need to re-open the app via Shopify Admin to restore the session:
```
https://admin.shopify.com/store/vjtrading/apps/checkout-rules
```

**Environment variables on Render:**
- `SHOPIFY_API_KEY` — Your app's API key from Shopify Partners
- `SHOPIFY_API_SECRET` — Your app's secret
- `SCOPES` — The Shopify permissions the app needs
- `DATABASE_URL` — Path to the SQLite sessions database (on the persistent disk)

**Persistent disk setup on Render:**
- Mount path: `/data` (or similar)
- The `sessions.db` file should be stored here so it survives restarts

### The Shopify Functions

The functions (checkout logic) are deployed to Shopify directly using the Shopify CLI. They do NOT live on Render.

**Deploy functions after changing `extensions/` code:**
```bash
shopify app deploy --force
```

**Important:** You only need to do this when you change the Rust code inside `extensions/`. Normal changes to the web app (rules, UI) don't require redeploying functions.

**Check functions are deployed:** Open the Debug page and look at the "Deployed Shopify Functions" section. You should see both functions listed.

### Local Development

```bash
cd checkout-rules
npm install
npm run dev
```

This starts the Remix app and opens a Shopify dev tunnel. You'll be given a URL to install the development version on a test store.

---

## 16. Future Improvements Roadmap

These are features and improvements that would make the app better in the future:

### Short Term
- **Rule testing tool** — In the rule editor, add a "Test this rule" button where you can type a customer email and see exactly what checkout they'd see
- **Rule history / audit log** — Track who changed what rule and when
- **Conflict detection** — Warn if two rules might conflict (e.g., both apply to the same customer but give different results)

### Medium Term
- **Additional condition types** — Currently only "Customer Tags" is supported. Could add:
  - Order history (e.g., customers who've spent over $X)
  - Customer account status
  - Specific customer segments
- **Scheduled sync** — Run a full sync automatically every night to catch any customers who slipped through
- **Multi-store support** — Currently built for VJ Trading specifically; could be generalized

### Long Term
- **Analytics dashboard** — See how many customers hit each rule, what methods they're choosing, etc.
- **A/B testing** — Test different payment method orderings to see which converts better
- **Shopify Plus automation** — Hook into Shopify Flow for even more powerful automation

---

## 17. Glossary (Words Made Simple)

| Word | What It Means |
|---|---|
| **B2B** | "Business to Business" — selling to other companies, not regular shoppers |
| **B2C** | "Business to Consumer" — selling to everyday people |
| **Shopify Function** | A tiny program that runs inside Shopify's checkout to customize what customers see |
| **Metafield** | Extra custom data attached to a Shopify object (like a customer) — like a sticky note on a customer's file |
| **Webhook** | A message Shopify sends to our app when something changes |
| **Bulk sync** | Updating the groups metafield for many customers at once |
| **Groups metafield** | The specific metafield we use to store customer tags so the checkout function can read them |
| **negate** | A rule setting that flips it — instead of "apply to customers WITH these tags," it means "apply to customers WITHOUT these tags" |
| **Remix** | The web framework (like a toolkit) used to build the admin app |
| **Polaris** | Shopify's design system — the buttons, forms, and layout components used in the admin UI |
| **Render** | The cloud hosting service where our web app lives |
| **Payment Customization** | A Shopify feature (available on Shopify Plus) that lets you show/hide/reorder payment methods |
| **Delivery Customization** | Same as above but for shipping options |
| **Shopify CLI** | The command-line tool used to develop and deploy Shopify apps and functions |
| **WebAssembly (WASM)** | The format that Shopify Functions are compiled to — it's fast and runs securely inside Shopify |
| **GID** | "Global ID" — Shopify's format for unique IDs, like `gid://shopify/Customer/123456` |
| **Rate limit** | Shopify only allows a certain number of API calls per second — we have to be careful not to send too many at once |
| **Ephemeral storage** | Storage that disappears when a server restarts — why we had the Render free tier problem |
| **Persistent disk** | Storage that survives server restarts — what we use on Render Starter |

---

*Documentation last updated: April 2026*
*Built and maintained by the Worthy Products dev team*
*App: `https://checkout-rules.onrender.com` | GitHub: `https://github.com/pratzs/checkout-rules`*
