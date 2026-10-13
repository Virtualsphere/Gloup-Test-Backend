import puppeteer from "puppeteer";

const generatePDF = async (booking) => {
  try {

    const items = booking.appointment_items || [];
    // All amounts come from what the booking stored (getBookingsDetailsById).
    const rupees = (v) => `₹${Number(v || 0).toFixed(2)}`;


    const [fromTime, toTime] = booking.slot_timing.split('-');

       const parseTime = (time) => {
  const [h, m, s] = time.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, s || 0);
  return d;
};

const to12Hour = (date) =>
  date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

    const fromDate = parseTime(fromTime);
    const toDate = parseTime(toTime);

    const slotTiming = `${to12Hour(fromDate)} – ${to12Hour(toDate)}`;

    // 🔹 Build services HTML
    const servicesHTML = items
      .map(
        (item) => `
        <tr>
          <td style="padding:6px 0;">${item.service_name}</td>
          <td style="padding:6px 0;" align="right">
            ${item.item_discount > 0
              ? `${rupees(item.list_amount)} − ${rupees(item.item_discount)} = <b>${rupees(item.charged_amount)}</b>`
              : `<b>${rupees(item.charged_amount)}</b>`}
          </td>
        </tr>
      `
      )
      .join("");

    const couponRow = booking.coupon_discount > 0
      ? `<tr><td>Coupon Discount</td><td align="right">− ${rupees(booking.coupon_discount)}</td></tr>`
      : "";

    // 🔹 HTML template
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8" />
      <style>
        body {
          font-family: Arial, sans-serif;
          font-size: 12px;
          color: #111;
        }
        h2 {
          margin-bottom: 5px;
        }
        .section {
          margin-bottom: 12px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
        }
        td {
          border-bottom: 1px solid #eee;
        }
        .summary td {
          padding: 6px 0;
        }
        .payable {
          margin-top: 12px;
          padding: 10px;
          background: #111;
          color: #fff;
          font-weight: bold;
          display: flex;
          justify-content: space-between;
        }
      </style>
    </head>

    <body>

      <h2>Booking Invoice</h2>

      <div class="section">
        <b>Booking ID:</b> ${booking.id}<br/>
        <b>Customer:</b> ${booking.user_name}<br/>
        <b>Salon:</b> ${booking.salon_name}<br/>
        <b>Date:</b> ${booking.order_date}<br/>
        <b>Schedule:</b> ${slotTiming}
      </div>

      <div class="section">
        <h3>Services</h3>
        <table>
          ${servicesHTML}
        </table>
      </div>

      <table class="summary">
        <tr>
          <td>Services Total</td>
          <td align="right">${rupees(booking.items_total)}</td>
        </tr>
        ${couponRow}
        <tr>
          <td>Sub Total</td>
          <td align="right">${rupees(booking.taxable_amount)}</td>
        </tr>
        <tr>
          <td>GST (${booking.gst_rate}%)</td>
          <td align="right">${rupees(booking.gst_amount)}</td>
        </tr>
        <tr>
          <td>Platform Fee</td>
          <td align="right">${rupees(booking.platform_fee)}</td>
        </tr>
      </table>

      <div class="payable">
        <span>Payable Amount</span>
        <span>${rupees(booking.payable_amount)}</span>
      </div>

    </body>
    </html>
    `;

    const launchOptions = {
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    };
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
      launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    }

    const browser = await puppeteer.launch(launchOptions);

    const page = await browser.newPage();
    
    await page.setContent(html, {
  waitUntil: "load",   // ✅ DO NOT use networkidle0
  timeout: 0           // ✅ disable timeout
});


    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "20mm",
        bottom: "20mm",
        left: "15mm",
        right: "15mm",
      },
    });

    await browser.close();

    return pdfBuffer; // ✅ IMPORTANT
  } catch (error) {
    console.error("generatePDF error:", error);
    throw error;
  }
};

export default generatePDF;
