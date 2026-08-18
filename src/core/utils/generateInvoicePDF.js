import puppeteer from "puppeteer";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";

// Chromium's default profile/temp dir lives under the OS tmp dir. In hardened
// containers /tmp is often mounted noexec/size-limited, which causes
// intermittent "Printing failed" / "Target closed" errors under load. Giving
// each launch its own directory on the app's normal writable layer sidesteps
// that entirely; the unique suffix avoids user-data-dir collisions if two
// invoices render concurrently.
const CHROME_TMP_ROOT = path.join(process.cwd(), ".chrome-tmp");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = path.join(__dirname, "..", "assests", "invoice");

// Drop the real files at src/core/assets/invoice/logo.png and signature.png —
// both are optional; the invoice renders fine (just without the image) if missing.
const LOGO_PATH = path.join(ASSETS_DIR, "logo.png");
const SIGNATURE_PATH = path.join(ASSETS_DIR, "signature.png");

const COMPANY = {
  legalName: "JRSTYLEO BOOKING AND FASHION PRIVATE LIMITED",
  brandName: "GloUp Instantly",
  addressLines: [
    "No 54, Chola Avenue, SNM Green City,",
    "Vilar Road, Thanjavur, Thanjavur – 613006,",
    "Tamil Nadu, India",
  ],
  phone: "+91 75 3880 8796",
  emails: ["contact@gloup.in", "booking@gloup.in"],
  website: "www.gloup.in",
  gstin: "33AAGCJ1397N1Z5",
  pan: "AAGCJ1397N",
  signatoryName: "Janakiraman M",
  homeState: "Tamil Nadu",
};

// No GST is currently levied on this partner booking-summary invoice.
// Flip this on (and adjust the line item math below) if that changes.
const GST_RATE = 0;

async function fileToDataUri(filePath, mime) {
  try {
    const buf = await fs.readFile(filePath);
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigitsToWords(n) {
  if (n < 20) return ONES[n];
  return TENS[Math.floor(n / 10)] + (n % 10 ? " " + ONES[n % 10] : "");
}

function threeDigitsToWords(n) {
  const hundred = Math.floor(n / 100);
  const rest = n % 100;
  let out = "";
  if (hundred) out += ONES[hundred] + " Hundred";
  if (rest) out += (out ? " " : "") + twoDigitsToWords(rest);
  return out;
}

function integerToWords(num) {
  if (num === 0) return "Zero";
  const crore = Math.floor(num / 10000000);
  num %= 10000000;
  const lakh = Math.floor(num / 100000);
  num %= 100000;
  const thousand = Math.floor(num / 1000);
  num %= 1000;
  const hundred = num;

  const parts = [];
  if (crore) parts.push(threeDigitsToWords(crore) + " Crore");
  if (lakh) parts.push(threeDigitsToWords(lakh) + " Lakh");
  if (thousand) parts.push(threeDigitsToWords(thousand) + " Thousand");
  if (hundred) parts.push(threeDigitsToWords(hundred));
  return parts.join(" ");
}

function amountToWords(amount) {
  const rupees = Math.floor(amount);
  const paise = Math.round((amount - rupees) * 100);
  let words = `Indian Rupee ${integerToWords(rupees)}`;
  if (paise) words += ` and ${integerToWords(paise)} Paise`;
  return words + " Only";
}

function formatDate(date) {
  return new Date(date).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatTime(date) {
  return new Date(date).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * invoice shape (from AdminDbController.getInvoiceDetailsForPartner):
 * { partner: { id, name, phone, email, address, state, zipcode },
 *   date, items: [{ appointment_id, booking_time, service_name, important, amount }],
 *   total_bookings, total_amount }
 */
const generateInvoicePDF = async (invoice) => {
  try {
    const [logoDataUri, signatureDataUri] = await Promise.all([
      fileToDataUri(LOGO_PATH, "image/png"),
      fileToDataUri(SIGNATURE_PATH, "image/png"),
    ]);

    const invoiceDate = new Date();
    const dueDate = new Date(invoiceDate);
    dueDate.setDate(dueDate.getDate() + 7);

    const invoiceNo = `INV-GLOUP-${invoiceDate.toISOString().slice(0, 10).replace(/-/g, "")}-${invoice.partner.id}`;

    const subTotal = Number(invoice.total_amount) || 0;
    const gstAmount = Number(((subTotal * GST_RATE) / 100).toFixed(2));
    const grandTotal = Number((subTotal + gstAmount).toFixed(2));

    const rowsHtml = (invoice.items || [])
      .map(
        (item, index) => `
        <tr>
          <td class="num">${index + 1}</td>
          <td>
            <div class="svc-name">${escapeHtml(item.service_name)}${item.important ? ' <span class="tag">Important</span>' : ""}</div>
            <div class="svc-sub">Booking #${item.appointment_id} &middot; ${formatTime(item.booking_time)}</div>
          </td>
          <td class="num">1</td>
          <td class="amt">${Number(item.amount).toFixed(2)}</td>
          <td class="amt">${Number(item.amount).toFixed(2)}</td>
        </tr>
      `
      )
      .join("");

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8" />
      <style>
        * { box-sizing: border-box; }
        body {
          font-family: Arial, Helvetica, sans-serif;
          color: #16181d;
          font-size: 12px;
          margin: 0;
          padding: 28px 34px;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 22px;
        }
        .logo img { height: 46px; }
        .logo-fallback {
          font-size: 26px;
          font-weight: 800;
          letter-spacing: -0.5px;
        }
        .logo-fallback .sub { display: block; font-size: 10px; font-weight: 600; letter-spacing: 3px; color: #6b7280; }
        .doc-title { text-align: right; }
        .doc-title h1 { margin: 0 0 10px; font-size: 24px; letter-spacing: 0.5px; }
        .meta-row { font-size: 11px; margin-bottom: 4px; color: #1f2430; }
        .meta-row .k { color: #6b7280; display: inline-block; min-width: 92px; }

        .parties { display: flex; justify-content: space-between; gap: 24px; margin-bottom: 18px; }
        .party { width: 48%; }
        .party h3 { margin: 0 0 6px; font-size: 13px; }
        .party .brand { color: #2457e8; font-weight: 700; font-size: 12px; margin-bottom: 4px; }
        .party p { margin: 2px 0; line-height: 1.5; color: #333; }
        .badge {
          display: inline-block;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.5px;
          color: #2457e8;
          background: #eaf0ff;
          border-radius: 4px;
          padding: 2px 8px;
          margin-bottom: 6px;
        }

        table.items { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
        table.items thead th {
          background: #eaf0ff;
          color: #1f2430;
          text-align: left;
          font-size: 10.5px;
          padding: 8px 10px;
          border-bottom: 1px solid #d7e0f5;
        }
        table.items thead th.num { text-align: center; }
        table.items thead th.amt { text-align: right; }
        table.items tbody td { padding: 8px 10px; border-bottom: 1px solid #eef0f4; vertical-align: top; }
        table.items tbody td.num { text-align: center; }
        table.items tbody td.amt { text-align: right; white-space: nowrap; }
        .svc-name { font-weight: 700; }
        .svc-sub { color: #8a8f98; font-size: 10px; margin-top: 2px; }
        .tag {
          font-size: 8.5px;
          font-weight: 700;
          color: #a6620c;
          background: #fff1d6;
          border-radius: 3px;
          padding: 1px 5px;
          vertical-align: middle;
        }

        .bottom { display: flex; justify-content: space-between; gap: 24px; margin-bottom: 20px; }
        .words-box {
          width: 55%;
          background: #f4f6fb;
          border-radius: 6px;
          padding: 12px 14px;
          align-self: flex-start;
        }
        .words-box .k { font-size: 10px; font-weight: 700; color: #2457e8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
        .totals { width: 42%; }
        .totals table { width: 100%; border-collapse: collapse; }
        .totals td { padding: 6px 4px; font-size: 12px; }
        .totals td:last-child { text-align: right; }
        .totals .grand td { border-top: 1px solid #d7dbe3; font-weight: 700; font-size: 13px; padding-top: 9px; }
        .totals .payable td {
          background: #16181d;
          color: #fff;
          font-weight: 700;
          font-size: 13px;
          padding: 10px 12px;
        }
        .totals .payable td:first-child { border-radius: 4px 0 0 4px; }
        .totals .payable td:last-child { border-radius: 0 4px 4px 0; }

        .footer { display: flex; justify-content: space-between; gap: 24px; margin-top: 8px; }
        .terms { width: 58%; font-size: 10.5px; color: #444; }
        .terms h4 { margin: 0 0 6px; font-size: 11px; color: #2457e8; }
        .terms ul { margin: 0; padding-left: 16px; }
        .terms li { margin-bottom: 4px; line-height: 1.4; }
        .sign { width: 36%; text-align: right; }
        .sign img { height: 46px; margin-bottom: 2px; }
        .sign .fallback-sig { font-family: "Segoe Script", "Brush Script MT", cursive; font-size: 26px; margin-bottom: 2px; }
        .sign .name { font-weight: 700; color: #2457e8; font-size: 11px; }
        .sign .role { font-size: 10px; color: #6b7280; }

        .thankyou {
          margin-top: 22px;
          background: #eaf0ff;
          border-radius: 6px;
          padding: 10px 16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 10.5px;
          color: #1f2430;
        }
      </style>
    </head>
    <body>

      <div class="header">
        <div class="logo">
          ${logoDataUri
        ? `<img src="${logoDataUri}" alt="GloUp" />`
        : `<div class="logo-fallback">gloup<span class="sub">INSTANTLY</span></div>`
      }
        </div>
        <div class="doc-title">
          <h1>TAX INVOICE</h1>
          <div class="meta-row"><span class="k">Invoice No.</span>${invoiceNo}</div>
          <div class="meta-row"><span class="k">Invoice Date</span>${formatDate(invoiceDate)}</div>
          <div class="meta-row"><span class="k">Due Date</span>${formatDate(dueDate)}</div>
          <div class="meta-row"><span class="k">Place of Supply</span>${escapeHtml(invoice.partner.state || COMPANY.homeState)}</div>
        </div>
      </div>

      <div class="parties">
        <div class="party">
          <div class="brand">${COMPANY.brandName}</div>
          <h3>${COMPANY.legalName}</h3>
          ${COMPANY.addressLines.map((l) => `<p>${l}</p>`).join("")}
          <p>${COMPANY.phone}</p>
          <p>${COMPANY.emails.join(" &middot; ")}</p>
          <p>${COMPANY.website}</p>
          <p><b>GSTIN:</b> ${COMPANY.gstin} &nbsp;|&nbsp; <b>PAN:</b> ${COMPANY.pan}</p>
        </div>
        <div class="party">
          <div class="badge">BILL TO</div>
          <h3>${escapeHtml(invoice.partner.name)}</h3>
          <p>${escapeHtml(invoice.partner.address || "")}</p>
          ${invoice.partner.zipcode ? `<p>${escapeHtml(invoice.partner.state || "")} – ${escapeHtml(invoice.partner.zipcode)}</p>` : ""}
          ${invoice.partner.phone ? `<p>${escapeHtml(invoice.partner.phone)}</p>` : ""}
          ${invoice.partner.email ? `<p>${escapeHtml(invoice.partner.email)}</p>` : ""}
        </div>
      </div>

      <table class="items">
        <thead>
          <tr>
            <th class="num">#</th>
            <th>Description</th>
            <th class="num">Qty</th>
            <th class="amt">Rate (&#8377;)</th>
            <th class="amt">Amount (&#8377;)</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml || `<tr><td colspan="5" style="padding:16px;text-align:center;color:#8a8f98;">No bookings recorded</td></tr>`}
        </tbody>
      </table>

      <div class="bottom">
        <div class="words-box">
          <div class="k">Total In Words</div>
          <div>${amountToWords(grandTotal)}</div>
        </div>
        <div class="totals">
          <table>
            <tr><td>Sub Total</td><td>&#8377;${subTotal.toFixed(2)}</td></tr>
            <tr><td>GST @ ${GST_RATE}%</td><td>&#8377;${gstAmount.toFixed(2)}</td></tr>
            <tr class="grand"><td>TOTAL</td><td>&#8377;${grandTotal.toFixed(2)}</td></tr>
            <tr class="payable"><td>AMOUNT PAYABLE</td><td>&#8377;${grandTotal.toFixed(2)}</td></tr>
          </table>
        </div>
      </div>

      <div class="footer">
        <div class="terms">
          <h4>TERMS &amp; CONDITIONS</h4>
          <ul>
            <li>Please review this booking summary against your salon records within 7 days of the invoice date.</li>
            <li>This is a computer generated invoice and does not require a physical signature.</li>
            <li>For any queries, contact us at ${COMPANY.emails[0]} or ${COMPANY.phone}.</li>
          </ul>
        </div>
        <div class="sign">
          ${signatureDataUri
        ? `<img src="${signatureDataUri}" alt="Signature" />`
        : `<div class="fallback-sig">${COMPANY.signatoryName}</div>`
      }
          <div class="name">${COMPANY.signatoryName}</div>
          <div class="role">Authorised Signature &middot; For ${COMPANY.brandName}</div>
        </div>
      </div>

      <div class="thankyou">
        <span>Thank you for being a part of the GloUp family.</span>
        <span><b>Book More. Earn More. Grow With GloUp.</b></span>
      </div>

    </body>
    </html>
    `;

    const userDataDir = path.join(CHROME_TMP_ROOT, randomUUID());
    await fs.mkdir(userDataDir, { recursive: true });

    const launchOptions = {
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
      userDataDir,
      env: {
        ...process.env,
        TMPDIR: CHROME_TMP_ROOT,
      },
    };
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
      launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    }

    let browser;
    try {
      browser = await puppeteer.launch(launchOptions);
      const page = await browser.newPage();

      await page.setContent(html, { waitUntil: "load", timeout: 0 });

      const pdfBuffer = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "10mm", bottom: "10mm", left: "10mm", right: "10mm" },
      });

      return pdfBuffer;
    } finally {
      if (browser) {
        await browser.close().catch(() => {});
      }
      await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => {});
    }
  } catch (error) {
    console.error("generateInvoicePDF error:", error);
    throw error;
  }
};

export default generateInvoicePDF;
