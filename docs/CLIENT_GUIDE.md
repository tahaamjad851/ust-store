# Running the shop: a guide for the owner

You do everything in the **admin area**. Sign in at `your-shop-address/login`, then open `/admin`. The menu across the top has: Dashboard, Orders, Daily prices, Products, Stock, Categories, Brands, Tractors, Import / export and Settings. (Settings is for administrators only.)

Everything you save shows in the shop straight away. If you do not see a change on a page you already had open, reload that page.

**What the shop shows:** only what you put in. It has no sample products, no invented brands, no star ratings, no "best seller" labels and no customer reviews. If a part of the page has nothing to show (no brands, no tractors, no products in a category), that part is simply left out.

Follow the steps below in this order. Each one makes the next one easier.

---

## 1. Settings (once, then when something changes)

**Admin > Settings > Shop details.** Fill in:

- **Business name**, **Tagline** and **Short line for the home page and footer**. The short line is a sentence about what you offer. Write only what is true.
- **Top bar text**: the strip at the very top of the shop. Leave it empty to hide the strip.
- **Phone**, **Second phone**, **WhatsApp number** (type it like `0321 8219594`), **Email shown in the shop**, **Address**, **City**, **Province**, **Opening hours**.
- **Delivery note**: what customers read instead of a delivery price, for example "Delivery charge confirmed by phone."
- **Exchange text**: your exchange terms. Empty hides the exchange notices.
- **Email for new orders**: private, never shown. You get one email here for every order. Separate several addresses with commas.

Then **Save settings**.

Anything you leave empty is left out of the shop. For example, with no WhatsApp number there is no WhatsApp button anywhere, and with no phone there is no "Call us" link. Fill these in before you open the shop, or customers cannot reach you.

**Couriers** (same page): add the courier companies you use (for example TCS, Leopards). You pick one when you record a shipment on an order.

> Delivery methods (for example "Doorstep courier" and "Cargo terminal pickup") are set up once when the shop is installed. You cannot change them here. Ask whoever installed the shop if you need to change them.

## 2. Categories

**Admin > Categories.** Categories are the groups in the shop menu, for example "Tractor parts" with "Clutch" and "Brakes" inside it.

1. Press **New category**. Give it a **Name**. Choose **Belongs to** to place it inside another category, or leave it at the top level.
2. Pick an **Icon**. Leave **Web address** empty and it is made from the name.
3. Save. Use the arrows to move categories up and down: that is the order customers see.
4. "Hide" takes a category and everything in it out of the shop without deleting anything.

Good to know:
- **A category with no products is not shown to customers.** It appears in the menu, on the home page and in the footer as soon as its first product is published.
- Put each product in the **most specific** category (for example "Clutch", not "Tractor parts"). The page of a group category shows its sub-groups; the products are listed on the sub-group pages and in the full shop list.

## 3. Brands

**Admin > Brands > New brand.** Type the **Brand name** (the maker of the part or oil) and save. Brands appear on the product page, and the home page lists the brands that have at least one published product. There are no logos: names only.

## 4. Tractors

**Admin > Tractors.** The tractor selector and "Tractors it fits" use these.

1. **New make**: the company, for example "Massey Ferguson".
2. Under that make, add each **Model** (for example "385"), with **Made from (year)** and **Made until (year)** if you know them.

If you add no tractors, the tractor selector and the model filters are not shown.

## 5. Products

**Admin > Products > Add product.** New products start as **drafts**, so nothing appears in the shop until you publish.

**Details** (fill what you know):
- **Name**, **Category**, **Brand**, **Type**.
- **Short description** (one line, shown in lists) and **Full description** (shown on the product page).
- **Part number**, **OEM or compatible part numbers**.
- For oils: **Viscosity grade** (for example 15W-40) and **Specifications and certifications**. Write only certifications the product really has.
- **Warranty** and **Packaging**, only if you want them shown.
- **Specifications**: add label and value pairs (for example "Teeth" and "10"). Customers see them as a table.

**First variant.** A variant is one size or pack of the product, with its own **SKU** (your own code, unique), **Regular price (Rs)**, optional **Sale price (Rs)** and **Opening stock**. (Administrators also see **Cost price**, which customers never see.) A product with a single size has one variant named "Default" or "Standard".

Press **Add product**. You land on the product page, where you can also:

- **Variants and prices**: add more variants (for example 5 L and 20 L).
- **Photos**: see step 6.
- **Tractors it fits**: add the models this part fits. Customers then see them on the product page and can filter by them. List only models you are sure about. A part with none listed shows "Universal or not listed for a specific model."

### Publish

At the bottom of the product page, **Publish now**. The page shows a warning if the product would not appear: it needs at least one available variant and a visible category. Use **View in shop** (top right) to see it as customers do.

- **Archive this product** hides it without losing anything. Use this instead of deleting.

### Sale price

Type a **Sale price (Rs)** lower than the regular price. Customers see the old price crossed out and the percentage saved. This is the only label the shop shows, and only when a sale price exists. Clear the sale price to end the sale.

## 6. Photos

On the product page, under **Photos**:

1. **Choose a photo** (JPEG, PNG, WebP or AVIF, up to 4 MB). It is shrunk for fast pages and you see a preview first.
2. **Describe the photo** in a few words (for example "Clutch plate, front"). This helps people using screen readers and search engines.
3. Save. Add up to 8 photos. Mark one as the **main photo**; it is the one shown in lists. Use the arrows to reorder.

A product with no photo shows a grey "Image coming soon" picture. Use your own photos of the real item.

## 7. Daily prices and stock

**Admin > Daily prices**: change prices, sale prices, stock and availability for many items at once in a table, then press **Save changes**. A very large price change asks you to confirm, to catch typing mistakes. The page lists the last 50 changes.

**Admin > Stock**: use this when stock really changes. For each item press **Change stock**, choose **What happened** (Stock received, Returned to the shelf, Damaged or lost, or a Count correction), enter the **Quantity** and a **Reason**. Every change is kept in the history with your name. You can also set the **Low-stock level**: at or below it, the shop shows "Low stock".

**Admin > Import / export** lets you work on all products in a spreadsheet. The file is checked first and nothing is saved until you confirm.

## 8. Orders

Each order sends you an email and appears in **Admin > Orders**, newest first. Search by order number, phone number or the customer's name.

Open an order to:

1. **Call** or **WhatsApp** the customer from the buttons. Customers are told the delivery charge will be confirmed by phone.
2. Move the order along with the status buttons: **New**, **Contacted**, **Confirmed**, **Dispatched**, **Delivered**, **Cancelled**, **Exchange requested**. Steps cannot be skipped. You can add a **Note for the customer**, which they see on their order page.
3. After you agree the delivery charge with the customer, enter it under **Delivery charge** and save. The order total is recalculated for you.
4. When you hand the parcel to a courier, choose the **Courier** and enter the **Tracking number**, then **Save courier and tracking**. The customer sees both on their tracking page.
5. When you have received the cash, press **Mark cash as collected**.
6. Write remarks for your team under **Internal notes**. Customers never see them.
7. **Print the order slip** for packing.

**Stock and orders:** stock is set aside when an order is placed, taken off when the order is **Delivered**, and given back (once) if the order is **Cancelled**.

If the email to you could not be sent, the order page says **"Owner notification not sent"**. The order is still safe in the list; check Orders now and then.

---

## A short checklist before opening the shop

- [ ] Settings filled in, including the order email and WhatsApp number.
- [ ] Categories, brands and tractors created.
- [ ] At least a few products published, each with a real photo.
- [ ] Open the shop in a private browser window and look at the home page, a category, a product and the cart.
- [ ] Place a test order yourself, then cancel it from Admin > Orders.
