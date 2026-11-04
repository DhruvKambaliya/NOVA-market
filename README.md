# NOVA Market — starter project

An original multi-category shopping website concept using React + Vite and Node.js + Express. The interface is a design prototype; it is not yet a production-ready store.

## Requirements
- Node.js 20+ and npm
- A terminal / command prompt

## Run locally
1. Extract the ZIP.
2. Open a terminal inside `nova-market`.
3. Run `npm install`.
4. Run `npm run dev`.
5. Open the Vite URL printed in the terminal (usually http://localhost:5173).

The API runs at http://localhost:4000 and `GET /api/products` returns demo products.

## Current status
Implemented in this starter:
- Responsive React storefront with product search and category filters
- Demo product cards, add-to-cart interaction and cart drawer
- Admin dashboard interface with demo metrics and product table
- Express API with demo product data and basic request validation
- Google Sheets/Drive integration scaffold and environment variable example

Not yet implemented / requires configuration:
- Real Google Sheets and Drive access (requires Google Cloud project, APIs, service account and sharing permissions)
- Persistent database and production-safe inventory/order transactions
- Customer/admin authentication, secure sessions and enforced admin roles
- Real order creation, checkout, payment provider and shipping integration
- Production deployment, monitoring, backups and security review

Do not accept real payments or store real customer data using this prototype. Admin UI is currently a visual demo and is not protected by authentication yet.
