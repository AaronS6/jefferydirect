// ClientHub seed — clearly identified DEMONSTRATION data for evaluation.
// Replace with real business records when going live.
//
//   bun run prisma/seed.ts
//
// Demo credentials (also shown on the login screen):
//   Admin:    admin@jefferygroup.com / Jeffery2024!
//   Customer: maria@mapleleafpizzeria.ca / Client2024!
//             daniel@harvestfood.ca     / Client2024!
//             sofia@pacificbakehouse.ca/ Client2024!

import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/server/crypto";

const db = new PrismaClient();

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number, hours = 0) => new Date(Date.now() - n * DAY + hours * 60 * 60 * 1000);
const daysFromNow = (n: number) => new Date(Date.now() + n * DAY);
const TAX_BP = 500; // 5% GST (demo)

function totals(items: { qty: number; unitPriceCents: number }[]) {
  const subtotal = items.reduce((s, i) => s + i.qty * i.unitPriceCents, 0);
  const tax = Math.round((subtotal * TAX_BP) / 10_000);
  return { subtotal, tax, total: subtotal + tax };
}

async function main() {
  console.log("Seeding ClientHub demo data…");

  // Wipe in FK-safe order
  await db.emailLog.deleteMany();
  await db.attentionDismissal.deleteMany();
  await db.updateTemplate.deleteMany();
  await db.savedProduct.deleteMany();
  await db.orderDraft.deleteMany();
  await db.orderChangeRequest.deleteMany();
  await db.orderInternalNote.deleteMany();
  await db.orderUpdate.deleteMany();
  await db.auditLog.deleteMany();
  await db.notification.deleteMany();
  await db.message.deleteMany();
  await db.document.deleteMany();
  await db.quotationItem.deleteMany();
  await db.quotation.deleteMany();
  await db.orderStatusHistory.deleteMany();
  await db.orderItem.deleteMany();
  await db.order.deleteMany();
  await db.customerPrice.deleteMany();
  await db.productAccess.deleteMany();
  await db.product.deleteMany();
  await db.category.deleteMany();
  await db.address.deleteMany();
  await db.user.deleteMany();
  await db.organization.deleteMany();

  // ─── Categories ────────────────────────────────────────────────────────────
  const cats = await Promise.all(
    [
      ["Corrugated Packaging", "corrugated", "Shipping cartons, mailers and heavy-duty boxes"],
      ["Pizza Boxes", "pizza-boxes", "Corrugated pizza boxes in standard and custom prints"],
      ["Food Packaging", "food-packaging", "Bags, wraps, soup cups and takeaway packaging"],
      ["PET Containers", "pet-containers", "Clear PET clamshells and cold cups"],
      ["PP Containers", "pp-containers", "Polypropylene deli containers and bowls"],
      ["Custom Printed Packaging", "custom-printed", "Bespoke printed packaging programs"],
    ].map(([name, slug, description], i) =>
      db.category.create({ data: { name, slug, description, sortOrder: i } }),
    ),
  );
  const catId = Object.fromEntries(cats.map((c) => [c.slug, c.id]));

  // ─── Products ──────────────────────────────────────────────────────────────
  type P = {
    sku: string;
    name: string;
    cat: string;
    short: string;
    desc: string;
    material: string;
    dims: string;
    colour: string;
    printing: string;
    casePack: number;
    palletPack?: number;
    moq: number;
    increment: number;
    unit: string;
    price: number | null;
    stock: string;
    lead?: string;
  };

  const products: P[] = [
    {
      sku: "JG-CB-1208",
      name: "Regular Slotted Carton 12 × 8 × 8 in",
      cat: "corrugated",
      short: "Single-wall kraft RSC shipping carton, sold per unit.",
      desc: "Classic regular slotted container in 32 ECT kraft board. A dependable everyday shipping carton suitable for light-to-medium goods. Available flat-packed in bundles of 50.",
      material: "Single-wall corrugated kraft, 32 ECT",
      dims: "12 × 8 × 8 in (305 × 203 × 203 mm)",
      colour: "Natural kraft",
      printing: "Flexo printing available on request",
      casePack: 50,
      palletPack: 400,
      moq: 100,
      increment: 50,
      unit: "each",
      price: 89,
      stock: "IN_STOCK",
    },
    {
      sku: "JG-CB-1612",
      name: "Heavy-Duty Carton 16 × 12 × 10 in",
      cat: "corrugated",
      short: "Double-wall heavy-duty carton for dense loads.",
      desc: "Double-wall (48 ECT) kraft carton engineered for heavier consignments. Stronger burst and stacking strength for industrial and food-service distribution.",
      material: "Double-wall corrugated kraft, 48 ECT",
      dims: "16 × 12 × 10 in (406 × 305 × 254 mm)",
      colour: "Natural kraft",
      printing: "Flexo printing available on request",
      casePack: 25,
      palletPack: 150,
      moq: 50,
      increment: 25,
      unit: "each",
      price: 142,
      stock: "IN_STOCK",
    },
    {
      sku: "JG-CB-MAI4",
      name: "White Mailer Carton 10 × 7 × 4 in",
      cat: "corrugated",
      short: "Clean white mailer for retail-ready shipments.",
      desc: "Smooth white outside / kraft inside mailer carton. Popular with bakeries and retailers for a premium unboxing presentation without custom print costs.",
      material: "Single-wall corrugated, white outside / kraft inside",
      dims: "10 × 7 × 4 in (254 × 178 × 102 mm)",
      colour: "White",
      printing: "Flexo printing available on request",
      casePack: 100,
      palletPack: 800,
      moq: 250,
      increment: 100,
      unit: "each",
      price: 54,
      stock: "IN_STOCK",
    },
    {
      sku: "JG-CB-PALS",
      name: "Pallet Sleeve Box 48 × 40 × 36 in",
      cat: "corrugated",
      short: "Heavy-duty pallet sleeve box for bulk handling.",
      desc: "Reusable-style corrugated pallet sleeve box for bulk produce and industrial distribution. Produced to order in configurable board grades.",
      material: "Double-wall corrugated kraft",
      dims: "48 × 40 × 36 in (1219 × 1016 × 914 mm)",
      colour: "Natural kraft",
      printing: "Flexo printing available on request",
      casePack: 1,
      moq: 5,
      increment: 1,
      unit: "each",
      price: 1275,
      stock: "MADE_TO_ORDER",
      lead: "Produced in 10–14 business days after confirmation",
    },
    {
      sku: "JG-PZ-10",
      name: '10" Corrugated Pizza Box',
      cat: "pizza-boxes",
      short: "Standard 10-inch pizza box, lock-corner, kraft.",
      desc: "10-inch corrugated pizza box with lock-corner construction. Venting options and grease resistance suitable for hot-holding. Sold per box, bundled 100 per case.",
      material: "Single-wall corrugated kraft",
      dims: '10 × 10 × 1.75 in',
      colour: "Natural kraft",
      printing: "1–4 colour flexo available on volume orders",
      casePack: 100,
      palletPack: 1200,
      moq: 500,
      increment: 100,
      unit: "each",
      price: 42,
      stock: "IN_STOCK",
    },
    {
      sku: "JG-PZ-12",
      name: '12" Corrugated Pizza Box',
      cat: "pizza-boxes",
      short: "Standard 12-inch pizza box, lock-corner, kraft.",
      desc: "Our best-selling 12-inch corrugated pizza box. Lock-corner assembly, stacked strength tested for delivery. Bundled 100 per case, pallets of 1,000.",
      material: "Single-wall corrugated kraft",
      dims: '12 × 12 × 1.75 in',
      colour: "Natural kraft",
      printing: "1–4 colour flexo available on volume orders",
      casePack: 100,
      palletPack: 1000,
      moq: 500,
      increment: 100,
      unit: "each",
      price: 51,
      stock: "IN_STOCK",
    },
    {
      sku: "JG-PZ-14",
      name: '14" Corrugated Pizza Box',
      cat: "pizza-boxes",
      short: "Oversize 14-inch pizza box for family sizes.",
      desc: "14-inch corrugated pizza box for extra-large and family-size pizzas. Same lock-corner construction as our 10 and 12 inch ranges.",
      material: "Single-wall corrugated kraft",
      dims: '14 × 14 × 2 in',
      colour: "Natural kraft",
      printing: "1–4 colour flexo available on volume orders",
      casePack: 100,
      palletPack: 900,
      moq: 500,
      increment: 100,
      unit: "each",
      price: 58,
      stock: "IN_STOCK",
    },
    {
      sku: "JG-PZ-CP",
      name: "Custom Printed Pizza Boxes",
      cat: "pizza-boxes",
      short: "Your artwork, printed on our pizza box range.",
      desc: "Custom printed pizza boxes with your branding in 1–4 colours. Plate setup applies; pricing depends on artwork, colours and volume. Request a quotation to begin.",
      material: "Single-wall corrugated kraft",
      dims: "10 / 12 / 14 in formats",
      colour: "Natural kraft or white top liner",
      printing: "1–4 colour flexo",
      casePack: 100,
      moq: 2500,
      increment: 500,
      unit: "each",
      price: null,
      stock: "ENQUIRY_ONLY",
      lead: "Quotation required — setup and artwork approval included",
    },
    {
      sku: "JG-FP-KB6",
      name: "Kraft Takeout Bag 6.25 × 9.25 in",
      cat: "food-packaging",
      short: "Flat-handle kraft paper bag for takeaway.",
      desc: "Sturdy kraft takeout bag with flat paper handles. Standard takeaway size, sold in bundles of 500. Pairs with our pizza and wrap ranges.",
      material: "Natural kraft paper, 70 lb basis",
      dims: "6.25 × 9.25 × 3.75 in",
      colour: "Natural kraft",
      printing: "1–2 colour flexo available on request",
      casePack: 500,
      palletPack: 10_000,
      moq: 1000,
      increment: 500,
      unit: "each",
      price: 18,
      stock: "IN_STOCK",
    },
    {
      sku: "JG-FP-SC32",
      name: "32 oz Soup Container & Lid",
      cat: "food-packaging",
      short: "PP soup cup with vented lid, case of 100.",
      desc: "32-ounce polypropylene soup container with matching vented lid. Microwave-safe and leak-resistant for delivery. Containers and lids bundled together.",
      material: "Food-grade polypropylene",
      dims: "32 oz capacity, 97 mm rim diameter",
      colour: "White",
      printing: "Not applicable (stock item)",
      casePack: 100,
      palletPack: 2000,
      moq: 300,
      increment: 100,
      unit: "each",
      price: 36,
      stock: "IN_STOCK",
    },
    {
      sku: "JG-FP-GW12",
      name: "Grease-Resistant Sandwich Wrap 12 × 12 in",
      cat: "food-packaging",
      short: "Dry-wax sandwich wrap sheets.",
      desc: "Grease-resistant dry-wax paper sheets for wrapping sandwiches, burgers and wraps. Supplied as cut sheets in bundles of 5,000.",
      material: "Dry-waxed grease-resistant paper",
      dims: "12 × 12 in sheets",
      colour: "Natural white",
      printing: "1-colour flexo available on request",
      casePack: 5000,
      palletPack: 100_000,
      moq: 5000,
      increment: 2500,
      unit: "each",
      price: 5,
      stock: "IN_STOCK",
    },
    {
      sku: "JG-PET-CLAM6",
      name: "Clear PET Clamshell 6 × 6 × 3 in",
      cat: "pet-containers",
      short: "Crystal-clear hinged clamshell for sandwiches.",
      desc: "High-clarity PET clamshell with hinged lid, ideal for sandwiches, pastries and salads. Recyclable #1 plastic. Cases of 250.",
      material: "RPET (recycled PET), 0.4 mm",
      dims: "6 × 6 × 3 in",
      colour: "Crystal clear",
      printing: "Not applicable (stock item)",
      casePack: 250,
      palletPack: 3500,
      moq: 500,
      increment: 250,
      unit: "each",
      price: 29,
      stock: "IN_STOCK",
    },
    {
      sku: "JG-PET-CT20",
      name: "PET Cold Cup 20 oz",
      cat: "pet-containers",
      short: "Clear 20 oz cold cup, case of 1,000.",
      desc: "20-ounce crystal-clear PET cold cup with rolled rim for dome or flat lids. Sold per cup in full cases of 1,000.",
      material: "Virgin PET",
      dims: "20 oz capacity, 98 mm rim",
      colour: "Crystal clear",
      printing: "Not applicable (stock item)",
      casePack: 1000,
      palletPack: 40_000,
      moq: 1000,
      increment: 1000,
      unit: "each",
      price: 9,
      stock: "IN_STOCK",
    },
    {
      sku: "JG-PET-CT12",
      name: "PET Cold Cup 12 oz",
      cat: "pet-containers",
      short: "Clear 12 oz cold cup, case of 2,000.",
      desc: "12-ounce crystal-clear PET cold cup with rolled rim. Compact format for tastings and juice service. Sold per cup in cases of 2,000.",
      material: "Virgin PET",
      dims: "12 oz capacity, 90 mm rim",
      colour: "Crystal clear",
      printing: "Not applicable (stock item)",
      casePack: 2000,
      palletPack: 60_000,
      moq: 2000,
      increment: 1000,
      unit: "each",
      price: 6,
      stock: "IN_STOCK",
    },
    {
      sku: "JG-PP-DC24",
      name: "PP Deli Container 24 oz",
      cat: "pp-containers",
      short: "Tamper-evident ready PP deli cup.",
      desc: "24-ounce polypropylene deli container. Microwave and freezer safe. Accepts tamper-evident lids (sold with matching lids bundled).",
      material: "Food-grade polypropylene",
      dims: "24 oz capacity, 98 mm rim",
      colour: "Natural translucent",
      printing: "Not applicable (stock item)",
      casePack: 250,
      palletPack: 2500,
      moq: 500,
      increment: 250,
      unit: "each",
      price: 22,
      stock: "IN_STOCK",
    },
    {
      sku: "JG-PP-BW32",
      name: "Microwave-Safe PP Bowl 32 oz",
      cat: "pp-containers",
      short: "Deep PP bowl for hot menu items.",
      desc: "32-ounce polypropylene bowl with high-heat tolerance for soups, ramen and hot bowls. Lids included. Cases of 150.",
      material: "Food-grade polypropylene",
      dims: "32 oz capacity, 185 mm diameter",
      colour: "Black",
      printing: "Not applicable (stock item)",
      casePack: 150,
      palletPack: 1800,
      moq: 300,
      increment: 150,
      unit: "each",
      price: 31,
      stock: "IN_STOCK",
    },
    {
      sku: "JG-CP-CUST",
      name: "Custom Printed Packaging Program",
      cat: "custom-printed",
      short: "Bespoke printed packaging, quoted per project.",
      desc: "Fully bespoke printed packaging — boxes, wraps, sleeves and labels produced to your specifications and artwork. Each project is individually quoted including plates, setup and freight. Submit a quotation request with your artwork and specifications.",
      material: "Configurable (corrugated, paperboard, film)",
      dims: "Per specification",
      colour: "Per specification",
      printing: "Flexo, offset litho or digital",
      casePack: 1,
      moq: 5000,
      increment: 500,
      unit: "each",
      price: null,
      stock: "ENQUIRY_ONLY",
      lead: "Typical turnaround 3–5 weeks from artwork approval",
    },
  ];

  const productIds: Record<string, string> = {};
  for (const p of products) {
    const rec = await db.product.create({
      data: {
        sku: p.sku,
        name: p.name,
        categoryId: catId[p.cat],
        shortDescription: p.short,
        description: p.desc,
        material: p.material,
        dimensions: p.dims,
        colour: p.colour,
        printingOptions: p.printing,
        casePack: p.casePack,
        palletPack: p.palletPack ?? null,
        minOrderQty: p.moq,
        increment: p.increment,
        unit: p.unit,
        defaultPriceCents: p.price,
        stockStatus: p.stock,
        leadTimeNote: p.lead ?? null,
      },
    });
    productIds[p.sku] = rec.id;
  }

  // ─── Organizations ─────────────────────────────────────────────────────────
  const orgs = await Promise.all([
    db.organization.create({
      data: {
        code: "JG-C1001",
        name: "Maple Leaf Pizzeria Ltd.",
        status: "ACTIVE",
        billingLine1: "2145 Bloor Street West",
        billingCity: "Toronto",
        billingProvince: "ON",
        billingPostal: "M6R 2M3",
        phone: "(416) 555-0182",
        internalNotes:
          "Negotiated 2024 rates reconfirmed for Q3. Prefers Thursday deliveries. Watch pizza box volumes — considering printed boxes for spring rebrand.",
      },
    }),
    db.organization.create({
      data: {
        code: "JG-C1002",
        name: "Harvest Food Group Inc.",
        status: "ACTIVE",
        billingLine1: "88 Ironside Drive, Unit 12",
        billingCity: "Mississauga",
        billingProvince: "ON",
        billingPostal: "L5G 3L9",
        phone: "(905) 555-0234",
        internalNotes:
          "Distributor account — volume pricing on PET. AP contact is Daniel; purchasing is Ava (invite pending).",
      },
    }),
    db.organization.create({
      data: {
        code: "JG-C1003",
        name: "Pacific Bakehouse Co.",
        status: "ACTIVE",
        billingLine1: "1120 Powell Street",
        billingCity: "Vancouver",
        billingProvince: "BC",
        billingPostal: "V6A 1H4",
        phone: "(604) 555-0197",
        internalNotes: "Coastal freight applies. Sofia owns purchasing; payables handled by their bookkeeper.",
      },
    }),
  ]);
  const [maple, harvest, pacific] = orgs;

  // ─── Addresses ──────────────────────────────────────────────────────────────
  await db.address.createMany({
    data: [
      {
        orgId: maple.id,
        label: "Main Location — Bloor St",
        line1: "2145 Bloor Street West",
        city: "Toronto",
        province: "ON",
        postal: "M6R 2M3",
        isDefault: true,
      },
      {
        orgId: maple.id,
        label: "Second Store — Danforth",
        line1: "1082 Danforth Avenue",
        city: "Toronto",
        province: "ON",
        postal: "M4C 1V2",
        isDefault: false,
      },
      {
        orgId: harvest.id,
        label: "Distribution Centre",
        line1: "88 Ironside Drive, Unit 12",
        city: "Mississauga",
        province: "ON",
        postal: "L5G 3L9",
        isDefault: true,
      },
      {
        orgId: pacific.id,
        label: "Production Facility",
        line1: "1120 Powell Street",
        city: "Vancouver",
        province: "BC",
        postal: "V6A 1H4",
        isDefault: true,
      },
    ],
  });

  // ─── Users ─────────────────────────────────────────────────────────────────
  const [adminMain, adminSam] = await Promise.all([
    db.user.create({
      data: {
        email: "admin@jefferygroup.com",
        name: "Morgan Chen",
        passwordHash: hashPassword("Jeffery2024!"),
        role: "ADMIN",
        title: "Operations Director",
        phone: "(905) 555-0100",
        status: "ACTIVE",
        notifyPrefs: JSON.stringify({ orderUpdates: true, quoteUpdates: true, documents: true, messages: true }),
        lastLoginAt: daysAgo(0, -3),
      },
    }),
    db.user.create({
      data: {
        email: "sam.torres@jefferygroup.com",
        name: "Sam Torres",
        passwordHash: hashPassword("Jeffery2024!"),
        role: "ADMIN",
        title: "Account Manager",
        phone: "(905) 555-0101",
        status: "ACTIVE",
        lastLoginAt: daysAgo(1),
      },
    }),
  ]);

  const [maria, luca, daniel, sofia] = await Promise.all([
    db.user.create({
      data: {
        email: "maria@mapleleafpizzeria.ca",
        name: "Maria Rossi",
        passwordHash: hashPassword("Client2024!"),
        role: "CUSTOMER",
        orgId: maple.id,
        title: "Purchasing Manager",
        phone: "(416) 555-0183",
        status: "ACTIVE",
        notifyPrefs: JSON.stringify({ orderUpdates: true, quoteUpdates: true, documents: true, messages: true }),
        lastLoginAt: daysAgo(0, -1),
      },
    }),
    db.user.create({
      data: {
        email: "luca@mapleleafpizzeria.ca",
        name: "Luca Rossi",
        passwordHash: hashPassword("Client2024!"),
        role: "CUSTOMER",
        orgId: maple.id,
        title: "Accounts Payable",
        status: "ACTIVE",
        lastLoginAt: daysAgo(6),
      },
    }),
    db.user.create({
      data: {
        email: "daniel@harvestfood.ca",
        name: "Daniel Okafor",
        passwordHash: hashPassword("Client2024!"),
        role: "CUSTOMER",
        orgId: harvest.id,
        title: "Supply Chain Lead",
        phone: "(905) 555-0235",
        status: "ACTIVE",
        lastLoginAt: daysAgo(2),
      },
    }),
    db.user.create({
      data: {
        email: "sofia@pacificbakehouse.ca",
        name: "Sofia Lindqvist",
        passwordHash: hashPassword("Client2024!"),
        role: "CUSTOMER",
        orgId: pacific.id,
        title: "Owner & Head Baker",
        phone: "(604) 555-0198",
        status: "ACTIVE",
        lastLoginAt: daysAgo(0, -5),
      },
    }),
  ]);

  // ─── Product access (approved per customer) ────────────────────────────────
  const accessMatrix: Record<string, string[]> = {
    [maple.id]: ["JG-PZ-10", "JG-PZ-12", "JG-PZ-14", "JG-PZ-CP", "JG-FP-KB6", "JG-FP-SC32", "JG-FP-GW12"],
    [harvest.id]: [
      "JG-PET-CLAM6",
      "JG-PET-CT20",
      "JG-PET-CT12",
      "JG-PP-DC24",
      "JG-PP-BW32",
      "JG-FP-SC32",
      "JG-FP-KB6",
      "JG-FP-GW12",
    ],
    [pacific.id]: ["JG-CB-1208", "JG-CB-1612", "JG-CB-MAI4", "JG-CB-PALS", "JG-FP-KB6", "JG-CP-CUST"],
  };
  for (const [orgId, skus] of Object.entries(accessMatrix)) {
    await db.productAccess.createMany({
      data: skus.map((sku) => ({ orgId, productId: productIds[sku], approved: true })),
    });
  }

  // ─── Customer-specific negotiated pricing ─────────────────────────────────
  const prices: [string, string, number, string][] = [
    [maple.id, "JG-PZ-10", 36, "2024 volume rate — 3,000+ boxes per order"],
    [maple.id, "JG-PZ-12", 44, "2024 volume rate — 3,000+ boxes per order"],
    [maple.id, "JG-FP-KB6", 16, "Standing rate, reconfirmed Q3 2024"],
    [harvest.id, "JG-PET-CLAM6", 26, "Distributor volume tier"],
    [harvest.id, "JG-PET-CT20", 8, "Distributor volume tier (case pricing)"],
    [harvest.id, "JG-PP-DC24", 19, "Distributor volume tier"],
    [harvest.id, "JG-FP-SC32", 33, "Standing rate"],
    [pacific.id, "JG-CB-1208", 82, "Coastal program rate"],
    [pacific.id, "JG-CB-MAI4", 48, "Coastal program rate"],
    [pacific.id, "JG-FP-KB6", 16, "Standing rate"],
  ];
  await db.customerPrice.createMany({
    data: prices.map(([orgId, sku, cents, note]) => ({
      orgId,
      productId: productIds[sku],
      priceCents: cents,
      note,
      effectiveFrom: daysAgo(120),
    })),
  });

  const effectivePrice = (orgId: string, sku: string): number | null => {
    const custom = prices.find((p) => p[0] === orgId && p[1] === sku);
    if (custom) return custom[2];
    const prod = products.find((p) => p.sku === sku)!;
    return prod.price;
  };

  // ─── Orders (with status history) ───────────────────────────────────────────
  let orderSeq = 100;
  const orderNumber = () => {
    orderSeq += 1;
    return `ORD-2024-${String(orderSeq).padStart(4, "0")}`;
  };

  async function seedOrder(opts: {
    orgId: string;
    org: (typeof orgs)[number];
    userId: string;
    userName: string;
    submittedDaysAgo: number;
    lines: { sku: string; qty: number; note?: string; specs?: Record<string, string> }[];
    shipping: string;
    poNumber?: string;
    notes?: string;
    requestedDelivery?: string;
    history: { status: string; note?: string; daysAgo: number; by: "admin" | "customer" }[];
    estimatedDeliveryDaysFromNow?: number;
    trackingNumber?: string;
    reorderSource?: string;
    sourceType?: "PORTAL" | "EMAIL" | "PHONE" | "IN_PERSON";
    recordedByName?: string;
    nextUpdateDaysFromNow?: number;
    estimatedDispatchDaysFromNow?: number;
  }) {
    const items = opts.lines.map((l) => {
      const price = effectivePrice(opts.orgId, l.sku)!;
      const prod = products.find((p) => p.sku === l.sku)!;
      return {
        productId: productIds[l.sku],
        sku: l.sku,
        name: prod.name,
        qty: l.qty,
        unitPriceCents: price,
        lineTotalCents: price * l.qty,
        note: l.note ?? null,
        ...(l.specs ? { specJson: JSON.stringify(l.specs) } : {}),
      };
    });
    const t = totals(items);
    const order = await db.order.create({
      data: {
        orderNumber: orderNumber(),
        orgId: opts.orgId,
        userId: opts.userId,
        status: opts.history[opts.history.length - 1].status,
        subtotalCents: t.subtotal,
        taxCents: t.tax,
        totalCents: t.total,
        taxRateBp: TAX_BP,
        shippingText: opts.shipping,
        poNumber: opts.poNumber ?? null,
        notes: opts.notes ?? null,
        requestedDelivery: opts.requestedDelivery ?? null,
        estimatedDelivery:
          opts.estimatedDeliveryDaysFromNow !== undefined
            ? daysFromNow(opts.estimatedDeliveryDaysFromNow)
            : null,
        trackingNumber: opts.trackingNumber ?? null,
        reorderSource: opts.reorderSource ?? null,
        requestedDeliveryDate: null,
        estimatedDispatch:
          opts.estimatedDispatchDaysFromNow !== undefined ? daysFromNow(opts.estimatedDispatchDaysFromNow) : null,
        nextUpdateDate: opts.nextUpdateDaysFromNow !== undefined ? daysFromNow(opts.nextUpdateDaysFromNow) : null,
        sourceType: opts.sourceType ?? "PORTAL",
        recordedByName: opts.recordedByName ?? null,
        createdAt: daysAgo(opts.submittedDaysAgo),
        updatedAt: daysAgo(Math.max(0, opts.history[opts.history.length - 1].daysAgo)),
        items: { create: items },
      },
    });
    await db.orderStatusHistory.createMany({
      data: opts.history.map((h) => ({
        orderId: order.id,
        status: h.status,
        note: h.note ?? null,
        byUserId: h.by === "admin" ? adminMain.id : opts.userId,
        byName: h.by === "admin" ? "Morgan Chen (Jeffery Group)" : opts.userName,
        createdAt: daysAgo(h.daysAgo),
      })),
    });
    return order;
  }

  const shipMaple = "Main Location — 2145 Bloor Street West, Toronto, ON, M6R 2M3";
  const shipMaple2 = "Second Store — 1082 Danforth Avenue, Toronto, ON, M4C 1V2";
  const shipHarvest = "Distribution Centre — 88 Ironside Drive, Unit 12, Mississauga, ON, L5G 3L9";
  const shipPacific = "Production Facility — 1120 Powell Street, Vancouver, BC, V6A 1H4";

  // Maple Leaf — delivered order (reorder source)
  const mapleDelivered = await seedOrder({
    orgId: maple.id,
    org: maple,
    userId: maria.id,
    userName: "Maria Rossi",
    submittedDaysAgo: 58,
    lines: [
      { sku: "JG-PZ-12", qty: 5000 },
      { sku: "JG-FP-KB6", qty: 1000 },
    ],
    shipping: shipMaple,
    poNumber: "MLP-PO-0871",
    notes: "Standard Thursday delivery if possible.",
    requestedDelivery: "Within 2 weeks of confirmation",
    history: [
      { status: "SUBMITTED", daysAgo: 58, by: "customer" },
      { status: "UNDER_REVIEW", note: "Received — reviewing availability.", daysAgo: 58, by: "admin" },
      { status: "CONFIRMED", note: "Stock confirmed. Pricing as agreed.", daysAgo: 57, by: "admin" },
      { status: "PROCESSING", daysAgo: 52, by: "admin" },
      { status: "READY_FOR_SHIPMENT", daysAgo: 48, by: "admin" },
      { status: "DISPATCHED", note: "Dispatched on JG truck 22.", daysAgo: 46, by: "admin" },
      { status: "DELIVERED", note: "Signed for by M. Rossi.", daysAgo: 44, by: "admin" },
    ],
    estimatedDeliveryDaysFromNow: -44,
    trackingNumber: "JG-TRK-78412",
  });

  // Maple Leaf — dispatched, ETA tomorrow
  const mapleDispatched = await seedOrder({
    orgId: maple.id,
    org: maple,
    userId: maria.id,
    userName: "Maria Rossi",
    submittedDaysAgo: 20,
    lines: [
      { sku: "JG-PZ-12", qty: 3000 },
      { sku: "JG-PZ-10", qty: 1000 },
      { sku: "JG-FP-SC32", qty: 300 },
    ],
    shipping: shipMaple,
    poNumber: "MLP-PO-0903",
    requestedDelivery: "Week of confirmation + 1",
    history: [
      { status: "SUBMITTED", daysAgo: 20, by: "customer" },
      { status: "UNDER_REVIEW", daysAgo: 20, by: "admin" },
      { status: "CONFIRMED", note: "Confirmed — production slot booked.", daysAgo: 19, by: "admin" },
      { status: "PROCESSING", daysAgo: 15, by: "admin" },
      { status: "IN_PRODUCTION", note: "Printing run scheduled.", daysAgo: 12, by: "admin" },
      { status: "READY_FOR_SHIPMENT", daysAgo: 5, by: "admin" },
      { status: "DISPATCHED", note: "Carrier: Jeffery Group route 4.", daysAgo: 1, by: "admin" },
    ],
    estimatedDeliveryDaysFromNow: 1,
    trackingNumber: "JG-TRK-79120",
  });

  // Maple Leaf — order phoned in and recorded by Jeffery Group on their behalf
  const mapleOffline = await seedOrder({
    orgId: maple.id,
    org: maple,
    userId: maria.id,
    userName: "Maria Rossi",
    submittedDaysAgo: 9,
    lines: [
      { sku: "JG-FP-KB6", qty: 1000 },
      { sku: "JG-FP-SC32", qty: 200 },
    ],
    shipping: shipMaple,
    poNumber: "MLP-PO-0899",
    notes: "Phoned in by Maria — order desk conversation logged. Recorded here so the company's history stays complete.",
    history: [
      { status: "SUBMITTED", daysAgo: 9, by: "admin" },
      { status: "CONFIRMED", note: "Recorded from phone order and confirmed same day.", daysAgo: 9, by: "admin" },
      { status: "PROCESSING", daysAgo: 8, by: "admin" },
      { status: "DISPATCHED", note: "Dispatched with route 2.", daysAgo: 2, by: "admin" },
    ],
    estimatedDeliveryDaysFromNow: 3,
    trackingNumber: "JG-TRK-79055",
    sourceType: "PHONE",
    recordedByName: "Morgan Chen (Admin)",
  });

  // Maple Leaf — in production
  const mapleInProduction = await seedOrder({
    orgId: maple.id,
    org: maple,
    userId: maria.id,
    userName: "Maria Rossi",
    submittedDaysAgo: 6,
    lines: [
      { sku: "JG-PZ-10", qty: 3000 },
      {
        sku: "JG-PZ-14",
        qty: 500,
        note: "For the seasonal menu — see attached artwork reference.",
        specs: {
          dimensions: "14 × 14 × 1.75 in",
          material: "E-flute corrugated kraft",
          printing: "1-colour flexo, exterior",
          colour: "Natural kraft, black ink",
          custom: "Logo centred on lid, 60% coverage",
        },
      },
    ],
    shipping: shipMaple2,
    poNumber: "MLP-PO-0918",
    requestedDelivery: "Before month end",
    history: [
      { status: "SUBMITTED", daysAgo: 6, by: "customer" },
      { status: "UNDER_REVIEW", daysAgo: 6, by: "admin" },
      { status: "CONFIRMED", note: "14\" boxes from new stock run.", daysAgo: 5, by: "admin" },
      { status: "PROCESSING", daysAgo: 4, by: "admin" },
      { status: "IN_PRODUCTION", note: "Estimated completion this week.", daysAgo: 2, by: "admin" },
    ],
    estimatedDeliveryDaysFromNow: 7,
    nextUpdateDaysFromNow: 2,
  });

  // Harvest — delivered
  await seedOrder({
    orgId: harvest.id,
    org: harvest,
    userId: daniel.id,
    userName: "Daniel Okafor",
    submittedDaysAgo: 50,
    lines: [
      { sku: "JG-PET-CLAM6", qty: 4000 },
      { sku: "JG-PET-CT20", qty: 5000 },
      { sku: "JG-PP-DC24", qty: 2000 },
    ],
    shipping: shipHarvest,
    poNumber: "HFG-PO-3341",
    history: [
      { status: "SUBMITTED", daysAgo: 50, by: "customer" },
      { status: "UNDER_REVIEW", daysAgo: 50, by: "admin" },
      { status: "CONFIRMED", daysAgo: 49, by: "admin" },
      { status: "PROCESSING", daysAgo: 45, by: "admin" },
      { status: "READY_FOR_SHIPMENT", daysAgo: 41, by: "admin" },
      { status: "DISPATCHED", daysAgo: 39, by: "admin" },
      { status: "DELIVERED", daysAgo: 37, by: "admin" },
    ],
    estimatedDeliveryDaysFromNow: -37,
    trackingNumber: "JG-TRK-77201",
  });

  // Harvest — confirmed, ETA in 9 days
  const harvestConfirmed = await seedOrder({
    orgId: harvest.id,
    org: harvest,
    userId: daniel.id,
    userName: "Daniel Okafor",
    submittedDaysAgo: 26,
    lines: [
      { sku: "JG-PP-BW32", qty: 900 },
      { sku: "JG-FP-SC32", qty: 500 },
    ],
    shipping: shipHarvest,
    poNumber: "HFG-PO-3355",
    notes: "Split pallet if possible — freezer space limited at DC.",
    requestedDelivery: "Two-week window",
    history: [
      { status: "SUBMITTED", daysAgo: 26, by: "customer" },
      { status: "UNDER_REVIEW", daysAgo: 26, by: "admin" },
      { status: "CONFIRMED", note: "Black PP bowls from next production run.", daysAgo: 25, by: "admin" },
      { status: "PROCESSING", daysAgo: 20, by: "admin" },
    ],
    estimatedDeliveryDaysFromNow: 9,
  });

  // Harvest — fresh request awaiting review
  await seedOrder({
    orgId: harvest.id,
    org: harvest,
    userId: daniel.id,
    userName: "Daniel Okafor",
    submittedDaysAgo: 3,
    lines: [
      { sku: "JG-PET-CT20", qty: 10_000 },
      { sku: "JG-PET-CT12", qty: 8000 },
      { sku: "JG-FP-GW12", qty: 5000 },
    ],
    shipping: shipHarvest,
    poNumber: "HFG-PO-3362",
    notes: "Q4 promotional volume — please confirm case quantities before processing.",
    requestedDelivery: "First week of next month",
    history: [
      { status: "SUBMITTED", daysAgo: 3, by: "customer" },
      { status: "UNDER_REVIEW", note: "Received — availability check underway.", daysAgo: 2, by: "admin" },
    ],
  });

  // Pacific — delivered
  await seedOrder({
    orgId: pacific.id,
    org: pacific,
    userId: sofia.id,
    userName: "Sofia Lindqvist",
    submittedDaysAgo: 44,
    lines: [
      { sku: "JG-CB-MAI4", qty: 5000 },
      { sku: "JG-FP-KB6", qty: 2000 },
    ],
    shipping: shipPacific,
    poNumber: "PBC-PO-1192",
    history: [
      { status: "SUBMITTED", daysAgo: 44, by: "customer" },
      { status: "UNDER_REVIEW", daysAgo: 44, by: "admin" },
      { status: "CONFIRMED", daysAgo: 43, by: "admin" },
      { status: "PROCESSING", daysAgo: 39, by: "admin" },
      { status: "READY_FOR_SHIPMENT", daysAgo: 35, by: "admin" },
      { status: "DISPATCHED", daysAgo: 33, by: "admin" },
      { status: "DELIVERED", daysAgo: 31, by: "admin" },
    ],
    estimatedDeliveryDaysFromNow: -31,
    trackingNumber: "JG-TRK-76884",
  });

  // Pacific — ready for shipment
  await seedOrder({
    orgId: pacific.id,
    org: pacific,
    userId: sofia.id,
    userName: "Sofia Lindqvist",
    submittedDaysAgo: 14,
    lines: [
      { sku: "JG-CB-1208", qty: 3000 },
      { sku: "JG-CB-1612", qty: 500 },
    ],
    shipping: shipPacific,
    poNumber: "PBC-PO-1203",
    requestedDelivery: "Coastal freight — mid-window",
    history: [
      { status: "SUBMITTED", daysAgo: 14, by: "customer" },
      { status: "UNDER_REVIEW", daysAgo: 14, by: "admin" },
      { status: "CONFIRMED", daysAgo: 13, by: "admin" },
      { status: "PROCESSING", daysAgo: 10, by: "admin" },
      { status: "IN_PRODUCTION", daysAgo: 8, by: "admin" },
      { status: "READY_FOR_SHIPMENT", note: "Awaiting carrier booking.", daysAgo: 1, by: "admin" },
    ],
    estimatedDeliveryDaysFromNow: 5,
  });

  // Pacific — submitted yesterday (fresh request)
  const pacificFresh = await seedOrder({
    orgId: pacific.id,
    org: pacific,
    userId: sofia.id,
    userName: "Sofia Lindqvist",
    submittedDaysAgo: 1,
    lines: [{ sku: "JG-CB-MAI4", qty: 3000 }],
    shipping: shipPacific,
    poNumber: "PBC-PO-1211",
    notes: "For the holiday gift-box program — please confirm before print run.",
    requestedDelivery: "Four weeks out",
    history: [{ status: "SUBMITTED", daysAgo: 1, by: "customer" }],
    reorderSource: "ORD-2024-0108",
  });

  // ─── Quotations ────────────────────────────────────────────────────────────
  let quoteSeq = 30;
  const quoteNumber = () => {
    quoteSeq += 1;
    return `Q-2024-${String(quoteSeq).padStart(3, "0")}`;
  };

  // Q-2024-031 — ISSUED to Maple Leaf (custom printed pizza boxes)
  await db.quotation.create({
    data: {
      quoteNumber: quoteNumber(),
      orgId: maple.id,
      userId: maria.id,
      status: "ISSUED",
      revision: 0,
      title: '5,000 × custom printed 12" pizza boxes',
      category: "Pizza Boxes",
      productName: '12" Corrugated Pizza Box — custom print',
      dimensions: '12 × 12 × 1.75 in',
      material: "Single-wall corrugated kraft",
      colour: "White top liner",
      printing: "2-colour flexo, customer artwork",
      quantity: "5,000 boxes",
      neededBy: "6 weeks",
      destination: "Main Location — 2145 Bloor Street West, Toronto",
      specs: "Artwork supplied as vector PDF; plates produced by Jeffery Group.",
      comments: "Rebrand launch — spring menu. Second colour is a warm red.",
      itemsTotalCents: 328_500,
      expiryDate: daysFromNow(10),
      terms:
        "Quote valid until the expiry date shown. Pricing includes plate setup for the two-colour run. Freight quoted to the Bloor Street location. Taxes extra. Lead time 4 weeks from artwork approval and order confirmation.",
      createdAt: daysAgo(9),
      issuedAt: daysAgo(4),
      items: {
        create: [
          {
            description: 'Custom printed 12" pizza box — 2-colour flexo, white top liner',
            kind: "PRODUCT",
            qty: 5000,
            unitPriceCents: 62,
            lineTotalCents: 310_000,
          },
          { description: "Flexo plate setup — two plates", kind: "SETUP", qty: 1, unitPriceCents: 18_000, lineTotalCents: 18_000 },
          { description: "Delivery freight — Toronto (Bloor St)", kind: "FREIGHT", qty: 1, unitPriceCents: 500, lineTotalCents: 500 },
        ],
      },
    },
  });

  // Q-2024-029 — REQUESTED by Pacific (admin must review & issue)
  await db.quotation.create({
    data: {
      quoteNumber: quoteNumber(),
      orgId: pacific.id,
      userId: sofia.id,
      status: "REQUESTED",
      revision: 0,
      title: "Custom printed mailer boxes 10 × 7 × 4 in — 8,000 units",
      category: "Custom Printed Packaging",
      productName: "White Mailer Carton 10 × 7 × 4 in — custom print",
      dimensions: "10 × 7 × 4 in",
      material: "Single-wall corrugated, white outside / kraft inside",
      colour: "White",
      printing: "1-colour flexo (black), supplied artwork",
      quantity: "8,000 boxes",
      neededBy: "8 weeks",
      destination: "Production Facility — 1120 Powell Street, Vancouver",
      specs: "Logo centered on lid panel; artwork supplied as vector EPS.",
      comments: "Annual holiday gift-box program. Would like to evaluate two quantity tiers if possible (8,000 / 12,000).",
      createdAt: daysAgo(2),
    },
  });

  // Q-2024-033 — REQUESTED by Harvest
  await db.quotation.create({
    data: {
      quoteNumber: quoteNumber(),
      orgId: harvest.id,
      userId: daniel.id,
      status: "REQUESTED",
      revision: 0,
      title: "Tamper-evident PP containers 8 oz — 20,000 units",
      category: "PP Containers",
      productName: "PP Deli Container 8 oz (tamper-evident)",
      dimensions: "8 oz capacity",
      material: "Food-grade polypropylene",
      colour: "Natural translucent",
      printing: "None",
      quantity: "20,000 containers",
      neededBy: "10 weeks",
      destination: "Distribution Centre — Mississauga",
      specs: "Tamper-evident lid style required; freezer-safe to −20 °C.",
      comments: "Evaluating for the new meal-kit line. Freight to DC required.",
      createdAt: daysAgo(1),
    },
  });

  // Q-2024-034 — ISSUED ON BEHALF of Maple Leaf (email enquiry, admin-recorded)
  await db.quotation.create({
    data: {
      quoteNumber: quoteNumber(),
      orgId: maple.id,
      userId: maria.id,
      status: "ISSUED",
      revision: 0,
      title: "Kraft takeaway bags — weekend pop-up run",
      category: "Kraft Bags",
      productName: "Kraft Takeaway Bag — large",
      quantity: "3,000 bags",
      neededBy: "3 weeks",
      destination: "Summer Pop-up — Harbourfront, Toronto",
      comments: "Emailed enquiry — bags for the Harbourfront kiosk through the summer.",
      itemsTotalCents: 121_500,
      expiryDate: daysFromNow(14),
      terms:
        "Quote valid until the expiry date shown. Pricing reflects the emailed volume agreed for the pop-up program. Freight to the Harbourfront kiosk included. Taxes extra. Lead time 2 weeks from confirmation.",
      // Provenance: the enquiry arrived by email and was recorded by an admin.
      sourceType: "EMAIL",
      recordedById: adminMain.id,
      recordedByName: "Morgan Chen",
      createdAt: daysAgo(3),
      issuedAt: daysAgo(2),
      items: {
        create: [
          {
            description: "Kraft takeaway bag — large, twisted paper handles",
            kind: "PRODUCT",
            qty: 3000,
            unitPriceCents: 40,
            lineTotalCents: 120_000,
          },
          { description: "Delivery freight — Harbourfront kiosk", kind: "FREIGHT", qty: 1, unitPriceCents: 1_500, lineTotalCents: 1_500 },
        ],
      },
    },
  });

  // Q-2024-025 — ACCEPTED by Harvest
  const acceptedQuote = await db.quotation.create({
    data: {
      quoteNumber: quoteNumber(),
      orgId: harvest.id,
      userId: daniel.id,
      status: "ACCEPTED",
      revision: 0,
      title: "20 oz PET cold cups — 50,000 units (volume tier)",
      category: "PET Containers",
      productName: "PET Cold Cup 20 oz",
      quantity: "50,000 cups",
      neededBy: "4 weeks",
      destination: "Distribution Centre — Mississauga",
      itemsTotalCents: 176_000,
      expiryDate: daysAgo(5),
      createdAt: daysAgo(21),
      issuedAt: daysAgo(18),
      respondedAt: daysAgo(15),
      respondedNote: "Accepted — aligns with our Q4 program volumes.",
      terms: "Volume tier pricing held for 60 days from acceptance. Freight included to a single Ontario destination.",
      items: {
        create: [
          {
            description: "PET Cold Cup 20 oz — volume tier",
            kind: "PRODUCT",
            qty: 50_000,
            unitPriceCents: 8,
            lineTotalCents: 176_000,
          },
          { description: "Freight — full truckload to Mississauga DC", kind: "FREIGHT", qty: 1, unitPriceCents: 0, lineTotalCents: 0 },
        ],
      },
    },
  });

  // Q-2024-018 — EXPIRED (Pacific)
  await db.quotation.create({
    data: {
      quoteNumber: quoteNumber(),
      orgId: pacific.id,
      userId: sofia.id,
      status: "EXPIRED",
      revision: 0,
      title: "Custom printed kraft bags — first tier",
      category: "Custom Printed Packaging",
      productName: "Kraft Takeout Bag — custom print",
      quantity: "12,000 bags",
      itemsTotalCents: 96_000,
      expiryDate: daysAgo(25),
      createdAt: daysAgo(40),
      issuedAt: daysAgo(38),
      comments: "Exploring printed bags for the holiday season.",
      items: {
        create: [
          { description: "Custom printed kraft takeout bag — 1-colour", kind: "PRODUCT", qty: 12_000, unitPriceCents: 8, lineTotalCents: 96_000 },
        ],
      },
    },
  });

  // ─── Documents ─────────────────────────────────────────────────────────────
  async function doc(data: {
    orgId: string;
    category: string;
    title: string;
    description?: string;
    fileName: string;
    sizeLabel: string;
    orderId?: string;
    quotationId?: string;
    daysAgo?: number;
  }) {
    await db.document.create({
      data: {
        orgId: data.orgId,
        category: data.category,
        title: data.title,
        description: data.description ?? null,
        fileName: data.fileName,
        sizeLabel: data.sizeLabel,
        orderId: data.orderId ?? null,
        quotationId: data.quotationId ?? null,
        uploadedBy: "Morgan Chen (Jeffery Group)",
        createdAt: daysAgo(data.daysAgo ?? 2),
      },
    });
  }

  await doc({
    orgId: maple.id,
    category: "INVOICE",
    title: "Invoice INV-2024-0312",
    description: `Order ${mapleDelivered.orderNumber} — delivered ${daysAgo(44).toLocaleDateString("en-CA")}`,
    fileName: "INV-2024-0312.pdf",
    sizeLabel: "84 KB",
    orderId: mapleDelivered.id,
    daysAgo: 42,
  });
  await doc({
    orgId: maple.id,
    category: "PURCHASE_ORDER",
    title: `Order confirmation ${mapleDelivered.orderNumber}`,
    description: "Jeffery Group confirmation of your purchase order MLP-PO-0871",
    fileName: `${mapleDelivered.orderNumber}-confirmation.pdf`,
    sizeLabel: "62 KB",
    orderId: mapleDelivered.id,
    daysAgo: 57,
  });
  await doc({
    orgId: maple.id,
    category: "STATEMENT",
    title: "Statement of account — September",
    description: "Demo statement covering September activity",
    fileName: "statement-2024-09.pdf",
    sizeLabel: "48 KB",
    daysAgo: 12,
  });
  await doc({
    orgId: maple.id,
    category: "SPECIFICATION",
    title: "Product specification — 12\" pizza box",
    description: "Board grade, venting and stacking specification",
    fileName: "spec-JG-PZ-12.pdf",
    sizeLabel: "126 KB",
    daysAgo: 70,
  });
  await doc({
    orgId: harvest.id,
    category: "INVOICE",
    title: "Invoice INV-2024-0298",
    description: `Order for PET/PP program — delivered ${daysAgo(37).toLocaleDateString("en-CA")}`,
    fileName: "INV-2024-0298.pdf",
    sizeLabel: "88 KB",
    daysAgo: 35,
  });
  await doc({
    orgId: harvest.id,
    category: "QUOTATION",
    title: `Quotation ${acceptedQuote.quoteNumber} (accepted)`,
    description: "Volume-tier pricing for 20 oz PET cold cups",
    fileName: `${acceptedQuote.quoteNumber}.pdf`,
    sizeLabel: "76 KB",
    quotationId: acceptedQuote.id,
    daysAgo: 15,
  });
  await doc({
    orgId: harvest.id,
    category: "STATEMENT",
    title: "Statement of account — October",
    description: "Demo statement covering October activity",
    fileName: "statement-2024-10.pdf",
    sizeLabel: "52 KB",
    daysAgo: 3,
  });
  await doc({
    orgId: pacific.id,
    category: "INVOICE",
    title: "Invoice INV-2024-0305",
    description: "Mailer cartons and kraft bags — delivered",
    fileName: "INV-2024-0305.pdf",
    sizeLabel: "82 KB",
    daysAgo: 29,
  });
  await doc({
    orgId: pacific.id,
    category: "DELIVERY_RECEIPT",
    title: "Delivery receipt — Powell Street facility",
    description: "Signed proof of delivery",
    fileName: "receipt-JG-TRK-76884.pdf",
    sizeLabel: "38 KB",
    daysAgo: 31,
  });

  // ─── Notifications ────────────────────────────────────────────────────────
  // Customer-facing (Maple Leaf)
  await db.notification.createMany({
    data: [
      {
        audience: "CUSTOMER",
        orgId: maple.id,
        title: `Quotation ${"Q-2024-031"} is ready to review`,
        body: "Your quotation for 5,000 custom printed 12\" pizza boxes has been issued and is valid for 10 days.",
        kind: "QUOTATION",
        view: "quotations",
        isRead: false,
        createdAt: daysAgo(4),
      },
      {
        audience: "CUSTOMER",
        orgId: maple.id,
        title: "Quotation Q-2024-034 added to your account",
        body: "Jeffery Group issued a quotation for \"Kraft takeaway bags — weekend pop-up run\" (valid 14 days) from your email enquiry so you can review and accept it in ClientHub.",
        kind: "QUOTATION",
        view: "quotations",
        isRead: false,
        createdAt: daysAgo(2),
      },
      {
        audience: "CUSTOMER",
        orgId: maple.id,
        title: "Invoice INV-2024-0312 uploaded",
        body: "A new invoice has been added to your document centre.",
        kind: "DOCUMENT",
        view: "documents",
        isRead: false,
        createdAt: daysAgo(2),
      },
      {
        audience: "CUSTOMER",
        orgId: maple.id,
        title: `Order ${mapleDispatched.orderNumber} dispatched`,
        body: "Your order is on Jeffery Group route 4. Estimated delivery tomorrow.",
        kind: "ORDER",
        view: "orders",
        isRead: true,
        createdAt: daysAgo(1),
      },
    ],
  });
  // Customer-facing (Harvest)
  await db.notification.createMany({
    data: [
      {
        audience: "CUSTOMER",
        orgId: harvest.id,
        title: `Quotation ${"Q-2024-033"} received`,
        body: "We have received your request for tamper-evident PP containers and will respond with pricing shortly.",
        kind: "QUOTATION",
        view: "quotations",
        isRead: false,
        createdAt: daysAgo(1),
      },
    ],
  });
  // Admin-facing
  await db.notification.createMany({
    data: [
      {
        audience: "ADMIN",
        title: `New order request ${pacificFresh.orderNumber}`,
        body: "Pacific Bakehouse Co. submitted a new order request for the holiday gift-box program.",
        kind: "ORDER",
        view: "admin-orders",
        relatedId: pacificFresh.id,
        isRead: false,
        createdAt: daysAgo(1),
      },
      {
        audience: "ADMIN",
        title: "New quotation request Q-2024-029",
        body: "Pacific Bakehouse Co. requested pricing for 8,000 custom printed mailer boxes.",
        kind: "QUOTATION",
        view: "admin-quotes",
        isRead: false,
        createdAt: daysAgo(2),
      },
      {
        audience: "ADMIN",
        title: "Message received — Maple Leaf Pizzeria",
        body: `Maria Rossi asked about delivery timing for ${mapleDispatched.orderNumber}.`,
        kind: "MESSAGE",
        view: "admin-notifications",
        isRead: false,
        createdAt: daysAgo(0, -2),
      },
      {
        audience: "ADMIN",
        title: "Quotation request Q-2024-033 awaiting review",
        body: "Harvest Food Group requested pricing for 20,000 tamper-evident PP containers.",
        kind: "QUOTATION",
        view: "admin-quotes",
        isRead: true,
        createdAt: daysAgo(1),
      },
    ],
  });

  // ─── Messages ──────────────────────────────────────────────────────────────
  await db.message.createMany({
    data: [
      {
        orgId: maple.id,
        userId: maria.id,
        subject: `Delivery timing for ${mapleDispatched.orderNumber}`,
        category: "DELIVERY",
        orderId: mapleDispatched.id,
        body: "Hi — could you confirm the delivery window for our dispatched order? We would like staff on hand to receive the boxes at the Bloor Street location.",
        status: "OPEN",
        createdAt: daysAgo(0, -2),
      },
      {
        orgId: harvest.id,
        userId: daniel.id,
        subject: "Spec confirmation for PP deli containers",
        category: "PRODUCT",
        body: "Can you confirm the freezer rating on the 24 oz PP deli containers? We need assurance for −20 °C storage.",
        status: "ANSWERED",
        reply:
          "Confirmed — the JG-PP-DC24 is rated for freezer storage to −20 °C and microwave reheating. Specification sheet is in your document centre.",
        repliedAt: daysAgo(4),
        repliedBy: "Sam Torres (Jeffery Group)",
        createdAt: daysAgo(5),
      },
    ],
  });

  // ─── Audit log ─────────────────────────────────────────────────────────────
  await db.auditLog.createMany({
    data: [
      {
        actorId: adminMain.id,
        actorName: "Morgan Chen",
        action: "PRICE_UPDATED",
        entity: "CustomerPrice",
        detail: "Maple Leaf Pizzeria — JG-PZ-12 set to $0.44 (volume tier)",
        createdAt: daysAgo(120),
      },
      {
        actorId: adminMain.id,
        actorName: "Morgan Chen",
        action: "CUSTOMER_CREATED",
        entity: "Organization",
        detail: "Pacific Bakehouse Co. onboarded with coastal program pricing",
        createdAt: daysAgo(90),
      },
      {
        actorId: adminSam.id,
        actorName: "Sam Torres",
        action: "ORDER_STATUS_CHANGED",
        entity: "Order",
        detail: `${mapleDispatched.orderNumber} → DISPATCHED`,
        createdAt: daysAgo(1),
      },
      {
        actorId: adminMain.id,
        actorName: "Morgan Chen",
        action: "QUOTATION_ISSUED",
        entity: "Quotation",
        detail: "Q-2024-031 issued to Maple Leaf Pizzeria ($3,285.00)",
        createdAt: daysAgo(4),
      },
    ],
  });

  // ─── Update templates (seeded, professionally written) ─────────────────────
  const templates: { title: string; category: string; body: string }[] = [
    {
      title: "Order Request Received",
      category: "ORDER_ACCEPTED",
      body: "Hello {{customer_name}},\n\nWe can confirm that your order request {{order_number}} has been received and is now with our order desk for review.\n\nWe will confirm availability, pricing and the delivery date shortly, and you will be able to track every step here in ClientHub.\n\nThank you for your business.\n\n{{admin_name}}\nJeffery Group Ltd.",
    },
    {
      title: "Order Accepted",
      category: "ORDER_ACCEPTED",
      body: "Hello {{customer_name}},\n\nGood news — your order {{order_number}} has been accepted and entered into our production schedule.\n\nWe will keep you informed as the order moves through preparation and production.\n\nThank you for your continued business.\n\n{{admin_name}}\nJeffery Group Ltd.",
    },
    {
      title: "Order Under Preparation",
      category: "PREPARATION",
      body: "Hello {{customer_name}},\n\nYour order {{order_number}} is now being prepared — materials and plates are being staged for production.\n\nWe expect to share the next update with you shortly.\n\n{{admin_name}}\nJeffery Group Ltd.",
    },
    {
      title: "Production Started",
      category: "PRODUCTION",
      body: "Hello {{customer_name}},\n\nProduction has started on your order {{order_number}} ({{product_name}}).\n\nWe will notify you as soon as production is completed and the order is prepared for dispatch.\n\n{{admin_name}}\nJeffery Group Ltd.",
    },
    {
      title: "Production Completed",
      category: "PRODUCTION_COMPLETED",
      body: "Hello {{customer_name}},\n\nProduction of your order {{order_number}} has been completed and the goods have passed our quality check.\n\nYour order will now move to dispatch preparation.\n\n{{admin_name}}\nJeffery Group Ltd.",
    },
    {
      title: "Ready for Dispatch",
      category: "READY_DISPATCH",
      body: "Hello {{customer_name}},\n\nYour order {{order_number}} is packed and ready for dispatch.\n\nWe are confirming carrier booking and will share tracking details once the order is on its way.\n\n{{admin_name}}\nJeffery Group Ltd.",
    },
    {
      title: "Delivery Scheduled",
      category: "DELIVERY",
      body: "Hello {{customer_name}},\n\nDelivery has been scheduled for your order {{order_number}}. The estimated delivery date is {{estimated_delivery}}.\n\nIf anything changes we will let you know right away.\n\n{{admin_name}}\nJeffery Group Ltd.",
    },
    {
      title: "Delivery Schedule Updated",
      category: "DELAY",
      body: "Hello {{customer_name}},\n\nWe would like to inform you that the expected delivery date for your order {{order_number}} has been revised to {{revised_delivery}}.\n\nWe will continue to keep you informed of any further developments.\n\nThank you for your understanding.\n\n{{admin_name}}\nJeffery Group Ltd.",
    },
    {
      title: "Order Delayed",
      category: "DELAY",
      body: "Hello {{customer_name}},\n\nWe want to be upfront with you: your order {{order_number}} has encountered a delay, and the revised estimated delivery date is now {{revised_delivery}}.\n\nWe are sorry for the inconvenience and are doing everything we can to keep things moving. Reply here or send us a message if you would like to discuss alternatives.\n\n{{admin_name}}\nJeffery Group Ltd.",
    },
    {
      title: "Additional Information Required",
      category: "INFO",
      body: "Hello {{customer_name}},\n\nTo continue processing your order {{order_number}}, we need a little more information from you.\n\nPlease reply here or send us a message through ClientHub at your earliest convenience so we can keep the order on schedule.\n\n{{admin_name}}\nJeffery Group Ltd.",
    },
    {
      title: "Order Completed",
      category: "COMPLETED",
      body: "Hello {{customer_name}},\n\nYour order {{order_number}} has been delivered and is now complete.\n\nThank you for ordering with Jeffery Group. Reordering is simple — open the order in ClientHub and choose “Reorder” to start a new request with your current pricing.\n\n{{admin_name}}\nJeffery Group Ltd.",
    },
  ];
  await db.updateTemplate.createMany({
    data: templates.map((t) => ({
      title: t.title,
      category: t.category,
      body: t.body,
      isDefault: true,
      createdByName: "Jeffery Group",
    })),
  });

  // ─── Customer Update Centre — published updates + drafts ───────────────────
  await db.orderUpdate.createMany({
    data: [
      // mapleDelivered — complete update history
      {
        orderId: mapleDelivered.id,
        authorName: "Morgan Chen",
        title: "Order accepted",
        category: "ORDER_ACCEPTED",
        message: "Your order request has been accepted and entered into our production schedule.",
        newStatus: "CONFIRMED",
        isPublished: true,
        publishedAt: daysAgo(57),
        createdAt: daysAgo(57),
      },
      {
        orderId: mapleDelivered.id,
        authorName: "Morgan Chen",
        title: "Production completed",
        category: "PRODUCTION_COMPLETED",
        message: "Production of your pizza boxes and kraft bags is complete and quality checks have passed.",
        newStatus: "READY_FOR_SHIPMENT",
        isPublished: true,
        publishedAt: daysAgo(48),
        createdAt: daysAgo(48),
      },
      {
        orderId: mapleDelivered.id,
        authorName: "Sam Torres",
        title: "Delivered and signed for",
        category: "COMPLETED",
        message: "Your order was delivered and signed for by M. Rossi. Thank you for ordering with Jeffery Group.",
        newStatus: "DELIVERED",
        isPublished: true,
        publishedAt: daysAgo(44),
        createdAt: daysAgo(44),
      },
      // mapleDispatched — dispatch update with next-update commitment
      {
        orderId: mapleDispatched.id,
        authorName: "Sam Torres",
        title: "On the truck — route 4",
        category: "SHIPMENT",
        message:
          "Your order has been dispatched on Jeffery Group route 4. The estimated delivery date is tomorrow by end of day.",
        newStatus: "DISPATCHED",
        estimatedDelivery: daysFromNow(1),
        nextUpdateDate: daysFromNow(1),
        isPublished: true,
        publishedAt: daysAgo(1),
        createdAt: daysAgo(1),
      },
      // mapleInProduction — production update + next expected update
      {
        orderId: mapleInProduction.id,
        authorName: "Morgan Chen",
        title: "Print run scheduled",
        category: "PRODUCTION",
        message:
          "The 14-inch seasonal boxes are queued for the flexo print run this week. The 10-inch boxes are already complete.",
        newStatus: "IN_PRODUCTION",
        nextUpdateDate: daysFromNow(2),
        isPublished: true,
        publishedAt: daysAgo(2),
        createdAt: daysAgo(2),
      },
      // harvestConfirmed — delay notice with revised delivery (overdue next update → attention)
      {
        orderId: harvestConfirmed.id,
        authorName: "Morgan Chen",
        title: "Production delay — revised delivery date",
        category: "DELAY",
        message:
          "The black PP bowl production run shifted due to a resin supply delay. We have secured a new slot and the revised delivery estimate is below. We are sorry for the shift and will keep you posted.",
        revisedDelivery: daysFromNow(12),
        nextUpdateDate: daysAgo(1), // overdue — surfaces in the Attention Centre
        isPublished: true,
        publishedAt: daysAgo(3),
        createdAt: daysAgo(3),
      },
      // pacificFresh — unpublished draft for the admin to finish
      {
        orderId: pacificFresh.id,
        authorId: adminMain.id,
        authorName: "Morgan Chen",
        title: "Holiday gift-box mailers — availability confirmed",
        category: "ORDER_ACCEPTED",
        message:
          "Draft: confirm availability of the mailer stock for the holiday program and set the expected timeline before publishing.",
        isPublished: false,
        createdAt: daysAgo(0, -2),
      },
    ],
  });

  // Internal notes (never customer-visible)
  await db.orderInternalNote.createMany({
    data: [
      {
        orderId: pacificFresh.id,
        authorId: adminMain.id,
        authorName: "Morgan Chen",
        body: "Customer mentioned a possible logo change for the gift-box program — confirm artwork version with Sofia before the print run. Do not start plates until confirmed.",
        createdAt: daysAgo(1),
      },
      {
        orderId: harvestConfirmed.id,
        authorId: adminSam.id,
        authorName: "Sam Torres",
        body: "Resin supplier pushed the PP run by a week. Keep an eye on the revised date — if it slips again, offer the bowl alternative from stock.",
        createdAt: daysAgo(3),
      },
    ],
  });

  // ─── Pending change request (Maple Leaf on the dispatched order) ───────────
  await db.orderChangeRequest.create({
    data: {
      orderId: mapleDispatched.id,
      requestedById: maria.id,
      requestedByName: "Maria Rossi",
      status: "PENDING",
      requestNote: "Weekend volume is tracking higher than forecast — can we top the soup cups up before dispatch?",
      changesJson: JSON.stringify([
        {
          kind: "QUANTITY",
          productId: productIds["JG-FP-SC32"],
          sku: "JG-FP-SC32",
          name: "Soup Cup 32 oz Black",
          currentQty: 300,
          newQty: 450,
          note: "Additional 150 cups for the weekend service.",
        },
      ]),
      createdAt: daysAgo(0, -4),
    },
  });

  // ─── Customer-added delivery address (active immediately — no approval) ───
  await db.address.create({
    data: {
      orgId: maple.id,
      label: "Summer Pop-up — Harbourfront",
      line1: "235 Queens Quay West",
      line2: "Unit 3 (kiosk)",
      city: "Toronto",
      province: "ON",
      postal: "M5J 2B9",
      approvalStatus: "APPROVED",
      requestedById: maria.id,
      requestedByName: "Maria Rossi (Maple Leaf Pizzeria)",
      requestedAt: daysAgo(1),
    },
  });

  // ─── Saved products (quick reorder) ────────────────────────────────────────
  await db.savedProduct.createMany({
    data: [
      {
        orgId: maple.id,
        userId: maria.id,
        productId: productIds["JG-PZ-12"],
        qty: 5000,
        note: "Standard biweekly order",
        createdAt: daysAgo(30),
      },
      {
        orgId: maple.id,
        userId: maria.id,
        productId: productIds["JG-FP-KB6"],
        qty: 1000,
        createdAt: daysAgo(30),
      },
    ],
  });

  // ─── Organization preferences + user org roles ─────────────────────────────
  await db.organization.update({
    where: { id: maple.id },
    data: {
      preferences: JSON.stringify({
        preferredContactUserId: maria.id,
        preferredContactMethod: "PORTAL",
        deliveryInstructions: "Deliver to the back dock before 10am; receiving on weekdays only. Ask for Maria or Luca.",
        commonlyOrderedNote: "Biweekly pizza boxes + kraft bags; seasonal printed runs twice a year.",
      }),
    },
  });
  await db.user.update({ where: { id: maria.id }, data: { orgRole: "ORG_ADMIN" } });
  await db.user.update({ where: { id: luca.id }, data: { orgRole: "READONLY" } });
  await db.user.update({ where: { id: daniel.id }, data: { orgRole: "ORG_ADMIN" } });
  await db.user.update({ where: { id: sofia.id }, data: { orgRole: "PURCHASING" } });

  // Purchasing user at Maple Leaf (demonstrates multiple contacts per org)
  await db.user.create({
    data: {
      email: "elena@mapleleafpizzeria.ca",
      name: "Elena Rossi",
      passwordHash: hashPassword("Client2024!"),
      role: "CUSTOMER",
      orgId: maple.id,
      orgRole: "PURCHASING",
      title: "Operations Manager",
      status: "ACTIVE",
      lastLoginAt: daysAgo(3),
    },
  });

  // ─── Notifications for the new workflows ───────────────────────────────────
  await db.notification.createMany({
    data: [
      {
        audience: "ADMIN",
        title: `Change request — ${mapleDispatched.orderNumber}`,
        body: "Maria Rossi at Maple Leaf Pizzeria requested a quantity change on their dispatched order. Review it before anything is applied.",
        kind: "CHANGE",
        view: "admin-order-detail",
        relatedId: mapleDispatched.id,
        createdAt: daysAgo(0, -4),
      },
      {
        audience: "CUSTOMER",
        orgId: maple.id,
        title: `Change request submitted — ${mapleDispatched.orderNumber}`,
        body: "Jeffery Group has been notified. Your order stays unchanged until they review and approve the request.",
        kind: "CHANGE",
        view: "order-detail",
        relatedId: mapleDispatched.id,
        createdAt: daysAgo(0, -4),
      },
      {
        audience: "CUSTOMER",
        orgId: maple.id,
        title: "New order added to your account",
        body: `We recorded your phone order ${mapleOffline.orderNumber} so your full history stays in ClientHub. No action is needed.`,
        kind: "ORDER",
        view: "order-detail",
        relatedId: mapleOffline.id,
        createdAt: daysAgo(9),
      },
      {
        audience: "ADMIN",
        title: "Delivery address added — Maple Leaf Pizzeria",
        body: 'Maria Rossi added "Summer Pop-up — Harbourfront" to their address book. It is active immediately.',
        kind: "SYSTEM",
        view: "admin-customer-detail",
        relatedId: maple.id,
        createdAt: daysAgo(1),
      },
    ],
  });

  // ─── Email outbox (queued — provider not yet configured) ───────────────────
  await db.emailLog.create({
    data: {
      toEmail: "maria@mapleleafpizzeria.ca",
      toName: "Maria Rossi",
      subject: `[${mapleDispatched.orderNumber}] On the truck — route 4`,
      kind: "UPDATE",
      status: "QUEUED",
      relatedId: mapleDispatched.id,
      bodyHtml:
        "<!doctype html><html><body><p>Your order has been dispatched on Jeffery Group route 4. Estimated delivery: tomorrow.</p></body></html>",
      createdAt: daysAgo(1),
    },
  });

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
