export const schemaFormats = {
    onlyAlpha: val => /^[a-zA-Z ]+$/.test(val),
    desc: val => /^[ a-zA-Z_./#+-,;$!]+$/.test(val),
    alphaNumeric: val => /^[a-zA-Z0-9]+$/.test(val),
    numeric: val => /^[0-9]+$/.test(val),
    pincode: val => /^[1-9][0-9]{5}$/.test(val)
}



export const formatDate = (date) => {
    if (!date) return null;

    const d = new Date(date);

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    const seconds = String(d.getSeconds()).padStart(2, "0");

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

/** Calendar date in Asia/Kolkata (YYYY-MM-DD) from a booking_date datetime. */
export const toIstDatePart = (date) => {
    if (!date) return null;
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(new Date(date));
};

/** Normalize MySQL TIME / string / Date to HH:MM:SS. */
export const formatSlotTime = (slotTime) => {
    if (slotTime == null || slotTime === "") return null;
    if (typeof slotTime === "string") {
        const m = slotTime.match(/(\d{2}:\d{2}:\d{2})/);
        return m ? m[1] : slotTime.slice(0, 8);
    }
    if (slotTime instanceof Date && !Number.isNaN(slotTime.getTime())) {
        const hh = String(slotTime.getUTCHours()).padStart(2, "0");
        const mm = String(slotTime.getUTCMinutes()).padStart(2, "0");
        const ss = String(slotTime.getUTCSeconds()).padStart(2, "0");
        return `${hh}:${mm}:${ss}`;
    }
    return null;
};

/**
 * booking_date is date-only (often midnight UTC → 05:30 IST).
 * Combine IST calendar date with Slots.from for the real appointment time.
 * Returns ISO-8601 with +05:30 so clients toLocal() to the salon slot, not 5:30 AM.
 */
export const buildAppointmentDateTime = (bookingDate, slotFrom) => {
    const datePart = toIstDatePart(bookingDate);
    if (!datePart) return null;
    const timePart = formatSlotTime(slotFrom) || "00:00:00";
    return `${datePart}T${timePart}+05:30`;
};

