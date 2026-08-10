const clients = new Set();

export const addClient = (res) => clients.add(res);
export const removeClient = (res) => clients.delete(res);

export const broadcastNewBooking = (booking) => {
  console.log("Broadcasting to clients:", clients.size);
  const payload = JSON.stringify({ type: "NEW_BOOKING", booking });
  for (const client of clients) {
    try {
      client.write(`data: ${payload}\n\n`);
    } catch {
      /* client gone */
    }
  }
};

/** Push live presence counts to all admin SSE clients. */
export const broadcastLiveStats = (stats) => {
  const payload = JSON.stringify({
    type: "LIVE_STATS",
    active_users_now: stats?.active_users_now ?? 0,
    active_partners_now: stats?.active_partners_now ?? 0,
    ts: stats?.ts || Date.now(),
  });
  for (const client of clients) {
    try {
      client.write(`data: ${payload}\n\n`);
    } catch {
      /* client gone */
    }
  }
};
