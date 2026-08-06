import axios from "axios";

/**
 * Sends a partner's daily invoice PDF over WhatsApp via MSG91.
 *
 * STUB: the real MSG91 WhatsApp template/flow ID isn't wired up yet — swap
 * WHATSAPP_INVOICE_TEMPLATE_ID in and uncomment the axios call once it's
 * available. Until then this just logs what it would have sent, so the cron
 * job (CronHelper.scheduleDailyPartnerInvoices, 8:30 AM IST) can be turned on
 * safely without actually messaging anyone.
 */
export const sendInvoiceViaWhatsApp = async ({ partner, pdfUrl, invoiceDate }) => {
  if (!partner?.phone) {
    console.log(`[InvoiceWhatsApp] skip: partner ${partner?.id} has no phone on file`);
    return { skipped: true, reason: "no_phone" };
  }

  console.log(
    `[InvoiceWhatsApp] STUB — would send invoice for ${invoiceDate} to ` +
    `${partner.name} (${partner.phone}) — PDF: ${pdfUrl}`
  );

  // Real MSG91 WhatsApp send, once template_id/authkey are provided:
  //
  // const endPoint = `https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/`;
  // return axios.post(
  //   endPoint,
  //   {
  //     integrated_number: process.env.MSG91_WHATSAPP_NUMBER,
  //     content_type: "template",
  //     payload: {
  //       messaging_product: "whatsapp",
  //       type: "template",
  //       template: {
  //         name: process.env.WHATSAPP_INVOICE_TEMPLATE_ID,
  //         language: { code: "en", policy: "deterministic" },
  //         to_and_components: [
  //           {
  //             to: ["91" + partner.phone],
  //             components: {
  //               header_1: { type: "document", value: pdfUrl },
  //               body_1: { type: "text", value: partner.name },
  //               body_2: { type: "text", value: invoiceDate },
  //             },
  //           },
  //         ],
  //       },
  //     },
  //   },
  //   { headers: { authkey: process.env.AUTHKEY, "Content-Type": "application/json" } }
  // );

  return { skipped: false, stub: true };
};
