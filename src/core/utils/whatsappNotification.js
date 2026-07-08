import axios from "axios";
import dotenv from "dotenv";
import { connection } from "../database/connection.js";
import { Sequelize } from "sequelize";
dotenv.config();

const MSG91_BASE_URL = "https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/";
const INTEGRATED_NUMBER = process.env.MSG91_WHATSAPP_NUMBER || "917538808796";
const INDIA_COUNTRY_CODE = "91";

function formatIndianMobileNumber(raw) {
  if (!raw) return null;

  // Strip everything except digits (drops +, spaces, dashes, parens, etc.)
  let digits = String(raw).replace(/\D/g, "");

  if (!digits) return null;

  // Strip a single leading 0 (common local-format prefix, e.g. "09876543210")
  if (digits.length === 11 && digits.startsWith("0")) {
    digits = digits.slice(1);
  }

  // Already has country code (12 digits, starts with 91) -> validate the rest
  if (digits.length === 12 && digits.startsWith(INDIA_COUNTRY_CODE)) {
    const localPart = digits.slice(2);
    if (/^[6-9]\d{9}$/.test(localPart)) {
      return digits;
    }
    console.warn(`[WhatsApp] Number has country code but invalid local part: "${raw}"`);
    return null;
  }

  // Plain 10-digit Indian mobile number (starts 6-9) -> prepend country code
  if (digits.length === 10 && /^[6-9]\d{9}$/.test(digits)) {
    return INDIA_COUNTRY_CODE + digits;
  }

  // Anything else (wrong length, landline, garbled data) — don't guess, just bail
  console.warn(`[WhatsApp] Could not normalize to a valid Indian mobile number: "${raw}"`);
  return null;
}

/**
 * Generic MSG91 WhatsApp template sender
 */
async function sendWhatsAppTemplate({ templateName, languageCode, namespace, to, components }) {
  try {
    if (!process.env.AUTHKEY) {
      console.error("[WhatsApp] AUTHKEY not configured, skipping send");
      return null;
    }

    const formattedTo = formatIndianMobileNumber(to);
    if (!formattedTo) {
      console.warn(`[WhatsApp] Invalid/missing 'to' number for template ${templateName}, skipping`);
      return null;
    }

    const payload = {
      integrated_number: INTEGRATED_NUMBER,
      content_type: "template",
      payload: {
        messaging_product: "whatsapp",
        type: "template",
        template: {
          name: templateName,
          language: {
            code: languageCode,
            policy: "deterministic",
          },
          namespace: namespace || null,
          to_and_components: [
            {
              to: [formattedTo],
              components,
            },
          ],
        },
      },
    };

    const response = await axios.post(MSG91_BASE_URL, payload, {
      headers: {
        "Content-Type": "application/json",
        authkey: process.env.AUTHKEY,
      },
    });

    console.log(`[WhatsApp] Sent template "${templateName}" to ${formattedTo}`, response.data);
    return response.data;
  } catch (error) {
    console.error(
      `[WhatsApp] Failed to send template "${templateName}" to ${to}:`,
      error?.response?.data || error.message
    );
    // Never throw — WhatsApp failures shouldn't break the booking flow
    return null;
  }
}

function textComponent(paramName, value) {
  return {
    type: "text",
    value: `<${value ?? ""}>`,
    parameter_name: paramName,
  };
}

function formatPaymentStatus(status) {
  if (status === "success" || status === "sucssess") return "Paid";
  if (status === "pending") return "Pending";
  if (status === "failed") return "Failed";
  return status || "N/A";
}

/**
 * Pulls everything needed for the WhatsApp templates from a single query.
 * Works for both service and combo bookings.
 */
async function getBookingWhatsAppPayload(appointmentId) {
  const rows = await connection.query(
    `
    SELECT
      a.id,
      a.payment_status,
      DATE_FORMAT(a.booking_date, '%d-%m-%Y') AS booking_date_fmt,
      TIME_FORMAT(e.\`from\`, '%h:%i %p') AS booking_time_fmt,
      u.firstname AS user_firstname,
      u.lastname AS user_lastname,
      u.phone AS user_phone,
      d.name AS salon_name,
      d.phone AS salon_phone,
      d.whatsapp_number AS salon_whatsapp,
      CONCAT_WS(' | ', f.area, f.city, f.district) AS salon_address,
      GROUP_CONCAT(DISTINCT COALESCE(ss.service_name, c.combo) SEPARATOR ', ') AS service_names
    FROM appointments a
    INNER JOIN User u ON a.user_id = u.id
    INNER JOIN Store d ON a.store_id = d.id
    LEFT JOIN Slots e ON a.slot_id = e.id
    LEFT JOIN PartnerAddress f ON d.address_id = f.id
    LEFT JOIN appointment_items ai ON a.id = ai.appointment_id
    LEFT JOIN StoreServices ss ON ai.service_id = ss.id
    LEFT JOIN Combo c ON ai.combo_id = c.id
    WHERE a.id = :id
    GROUP BY a.id
    `,
    {
      replacements: { id: appointmentId },
      type: Sequelize.QueryTypes.SELECT,
    }
  );

  return rows?.[0] || null;
}

/**
 * Sends the "booking confirmed" WhatsApp message to the customer.
 */
async function sendUserBookingWhatsApp(data) {
  const customerName = [data.user_firstname, data.user_lastname].filter(Boolean).join(" ") || "Customer";

  return sendWhatsAppTemplate({
    templateName: "gloup_user_booking",
    languageCode: "en_GB",
    namespace: null,
    to: data.user_phone,
    components: {
      body_customer_name: textComponent("customer_name", customerName),
      body_booking_date: textComponent("booking_date", data.booking_date_fmt),
      body_booking_time: textComponent("booking_time", data.booking_time_fmt),
      body_salon_name: textComponent("salon_name", data.salon_name),
      body_salon_address: textComponent("salon_address", data.salon_address),
      body_salon_phoneno: textComponent("salon_phoneno", data.salon_phone),
      body_service_name: textComponent("service_name", data.service_names),
      body_payment_status: textComponent("payment_status", formatPaymentStatus(data.payment_status)),
    },
  });
}

/**
 * Sends the "new booking" WhatsApp message to the partner (salon).
 * Uses the partner's dedicated WhatsApp number, falling back to their regular phone.
 */
async function sendPartnerBookingWhatsApp(data) {
  const partnerTo = data.salon_whatsapp || data.salon_phone;

  return sendWhatsAppTemplate({
    templateName: "gloup_sms",
    languageCode: "en",
    namespace: "7e6a90a7_e658_4047_acdf_4f945d9a45f4",
    to: partnerTo,
    components: {
      body_partner_name: textComponent("partner_name", data.salon_name),
      body_booking_id: textComponent("booking_id", data.id),
      body_customer_mobileno: textComponent("customer_mobileno", data.user_phone),
      body_booking_date: textComponent("booking_date", data.booking_date_fmt),
      body_booking_time: textComponent("booking_time", data.booking_time_fmt),
      body_service_details_name: textComponent("service_details_name", data.service_names),
      body_payment_status: textComponent("payment_status", formatPaymentStatus(data.payment_status)),
      body_salon_address: textComponent("salon_address", data.salon_address),
      body_salon_phoneno: textComponent("salon_phoneno", data.salon_phone),
    },
  });
}

/**
 * Single entry point: fetches booking data once, sends both WhatsApp messages.
 * Call this alongside sendBookingConfirmedNotifications() after a payment succeeds.
 */
export async function sendBookingConfirmedWhatsApp(appointmentId) {
  try {
    const data = await getBookingWhatsAppPayload(appointmentId);
    if (!data) {
      console.warn(`[WhatsApp] No booking data found for appointment ${appointmentId}, skipping`);
      return;
    }

    await Promise.all([
      sendUserBookingWhatsApp(data),
      sendPartnerBookingWhatsApp(data),
    ]);
  } catch (error) {
    console.error("[WhatsApp] sendBookingConfirmedWhatsApp error:", error);
    // Swallow — never let WhatsApp failures break the booking flow
  }
}

export { sendWhatsAppTemplate, getBookingWhatsAppPayload };