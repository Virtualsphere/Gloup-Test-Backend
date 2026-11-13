/**
 * Monthly report on WhatsApp: on the 1st of each month every salon with
 * bookings in the previous month gets that month's report PDF (the same PDF
 * the admin Monthly Report pages and the partner app download, from
 * generateMonthlyInvoicePDFForPartner) through MSG91's "gloup_montly_invoice"
 * template.
 *
 * Production only. NODE_ENV can't tell the servers apart (the Dockerfile and
 * docker-compose.yml force it to "production" everywhere), so sending needs
 * APP_ENV=production in the server's .env, and is refused whenever
 * UAT_ADMIN_ORIGIN is set (that one exists only on the development server).
 * Anything unset or unexpected means "don't send".
 *
 * MonthlyReportWhatsappLog keeps one row per salon per month, so a salon is
 * sent each month at most once however often the job runs; failed sends are
 * retried by the later runs on the 1st (see CronHelper).
 */
import { adminDbController } from "../database/Controller/AdminDbController.js";
import { uploadToS3 } from "./s3/s3Upload.js";
import { sendWhatsAppTemplate, textComponent } from "./whatsappNotification.js";

const TEMPLATE_NAME = "gloup_montly_invoice";
export const MAX_ATTEMPTS = 4;

export function monthlyReportBlockedReason(env = process.env) {
  if (env.APP_ENV !== "production") {
    return `APP_ENV is "${env.APP_ENV || "(not set)"}", not "production"`;
  }
  if (env.UAT_ADMIN_ORIGIN) {
    return "UAT_ADMIN_ORIGIN is set, so this is the development server";
  }
  return null;
}

/** The calendar month before `now`, in India time, as YYYY-MM. */
export function previousMonthIst(now = new Date()) {
  const [year, month] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
  })
    .format(now)
    .split("-")
    .map(Number);
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  return `${prevYear}-${String(prevMonth).padStart(2, "0")}`;
}

/** "YYYY-MM-DD" -> "DD-MM-YYYY", as the other partner WhatsApp templates show dates. */
function formatDisplayDate(isoDate) {
  const [year, month, day] = String(isoDate).split("-");
  return `${day}-${month}-${year}`;
}

export const sendMonthlyReportViaWhatsApp = async ({ partner, pdfUrl, month, fromDate, toDate }) => {
  return sendWhatsAppTemplate({
    templateName: TEMPLATE_NAME,
    languageCode: "en",
    namespace: null,
    to: partner.whatsapp || partner.phone,
    components: {
      header_1: {
        filename: `MonthlyReport_${partner.id}_${month}.pdf`,
        type: "document",
        value: pdfUrl,
      },
      body_partner_name: textComponent("partner_name", partner.name),
      body_start_date: textComponent("start_date", formatDisplayDate(fromDate)),
      body_end_date: textComponent("end_date", formatDisplayDate(toDate)),
    },
  });
};

let running = false;

/**
 * Sends `month` (default: last month) to every salon that hasn't had it yet.
 * Returns a summary; never throws for a single salon's failure.
 */
export async function runMonthlyPartnerReports({ month = previousMonthIst(), env = process.env } = {}) {
  const blocked = monthlyReportBlockedReason(env);
  if (blocked) {
    console.log(`[MonthlyReportWhatsApp] not sending (${blocked})`);
    return { skipped: true, reason: blocked };
  }
  if (running) {
    console.log("[MonthlyReportWhatsApp] previous run still in progress, skipping");
    return { skipped: true, reason: "already running" };
  }

  running = true;
  const summary = { month, sent: 0, failed: 0, noPhone: 0, alreadyDone: 0 };
  try {
    const { from_date: fromDate, to_date: toDate, partners } =
      await adminDbController.app.getInvoicePartnersMonthly({ month });

    const log = new Map(
      (await adminDbController.app.getMonthlyReportWhatsAppLog(month)).map((row) => [
        String(row.store_id),
        row,
      ])
    );

    for (const row of partners) {
      const previous = log.get(String(row.partner_id));
      if (
        previous &&
        (previous.status !== "failed" || Number(previous.attempts) >= MAX_ATTEMPTS)
      ) {
        summary.alreadyDone++;
        continue;
      }

      const partner = {
        id: row.partner_id,
        name: row.partner_name,
        phone: row.partner_phone,
        whatsapp: row.partner_whatsapp,
      };
      const record = (status, extra = {}) =>
        adminDbController.app.recordMonthlyReportWhatsApp({
          storeId: partner.id,
          month,
          status,
          ...extra,
        });

      if (!partner.whatsapp && !partner.phone) {
        summary.noPhone++;
        await record("skipped", { error: "no phone or WhatsApp number on file" });
        continue;
      }

      let pdfUrl = null;
      try {
        const pdfBuffer = await adminDbController.app.generateMonthlyInvoicePDFForPartner({
          partner_id: partner.id,
          month,
        });
        const uploaded = await uploadToS3(
          {
            originalname: `monthly-report-${partner.id}-${month}.pdf`,
            mimetype: "application/pdf",
            buffer: pdfBuffer,
          },
          "invoices/monthly"
        );
        pdfUrl = uploaded.url;

        const accepted = await sendMonthlyReportViaWhatsApp({
          partner,
          pdfUrl,
          month,
          fromDate,
          toDate,
        });
        if (!accepted) throw new Error("MSG91 did not accept the message (see [WhatsApp] log)");

        summary.sent++;
        await record("sent", { pdfUrl });
      } catch (error) {
        summary.failed++;
        console.error(`[MonthlyReportWhatsApp] salon ${partner.id} (${month}) failed:`, error.message);
        try {
          await record("failed", { pdfUrl, error: error.message });
        } catch (logError) {
          console.error("[MonthlyReportWhatsApp] could not record failure:", logError.message);
        }
      }
    }

    console.log(
      `[MonthlyReportWhatsApp] ${month}: ${summary.sent} sent, ${summary.failed} failed, ` +
        `${summary.noPhone} without a number, ${summary.alreadyDone} already done`
    );
    return summary;
  } finally {
    running = false;
  }
}
