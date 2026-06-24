const clients = new Set();

export const addClient = (res) => clients.add(res);
export const removeClient = (res) => clients.delete(res);

export const broadcastNewBooking = (booking) => {
  console.log("Broadcasting to clients:", clients.size);
  const payload = JSON.stringify({ type: "NEW_BOOKING", booking });
  for (const client of clients) {
    client.write(`data: ${payload}\n\n`);
  }
};