import { sendWhatsAppTemplate, textComponent } from "./whatsappNotification.js";

const INVOICE_NAMESPACE = "7e6a90a7_e658_4047_acdf_4f945d9a45f4";

/** "YYYY-MM-DD" -> "DD-MM-YYYY", matching the date format used by every
 * other partner/customer-facing WhatsApp template in this codebase. */
function formatDisplayDate(isoDate) {
  const parts = String(isoDate || "").split("-");
  if (parts.length !== 3) return isoDate || "";
  const [year, month, day] = parts;
  return `${day}-${month}-${year}`;
}

function formatPayout(amount) {
  return `₹${Number(amount || 0).toFixed(2)}`;
}

/**
 * Sends a partner's daily invoice PDF over WhatsApp via MSG91's
 * "gloup_partner_invoice" template. Uses the partner's dedicated WhatsApp
 * number, falling back to their regular phone — same precedence used for
 * the booking-notification templates in whatsappNotification.js.
 */
export const sendInvoiceViaWhatsApp = async ({ partner, pdfUrl, invoiceDate, payoutAmount }) => {
  const to = partner?.whatsapp_number || partner?.phone;

  if (!to) {
    console.log(`[InvoiceWhatsApp] skip: partner ${partner?.id} has no phone/whatsapp number on file`);
    return { skipped: true, reason: "no_phone" };
  }

  if (!pdfUrl) {
    console.log(`[InvoiceWhatsApp] skip: partner ${partner?.id} has no invoice PDF URL`);
    return { skipped: true, reason: "no_pdf" };
  }

  const result = await sendWhatsAppTemplate({
    templateName: "gloup_partner_invoice",
    languageCode: "en",
    namespace: INVOICE_NAMESPACE,
    to,
    components: {
      header_1: {
        filename: `Invoice_${partner?.id}_${invoiceDate}.pdf`,
        type: "document",
        value: pdfUrl,
      },
      body_partner_name: textComponent("partner_name", partner?.name),
      body_date: textComponent("date", formatDisplayDate(invoiceDate)),
      body_payout: textComponent("payout", formatPayout(payoutAmount)),
    },
  });

  if (!result) {
    return { skipped: true, reason: "send_failed" };
  }

  return { skipped: false, response: result };
};
