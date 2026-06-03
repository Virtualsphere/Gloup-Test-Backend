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

