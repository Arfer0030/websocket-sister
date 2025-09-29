const WebSocket = require("ws");
const express = require("express");
const http = require("http");
const path = require("path");
const os = require("os");

const app = express();
const server = http.createServer(app);
app.use(express.static(path.join(__dirname, "public")));

// untuk mendapatkan IP lokal
function getLocalIP() {
  const networkInterfaces = os.networkInterfaces();
  const candidates = [];

  for (const interfaceName in networkInterfaces) {
    const networkInterface = networkInterfaces[interfaceName];
    for (const network of networkInterface) {
      // Skip alamat internal
      if (network.internal || network.family !== "IPv4") {
        continue;
      }
      // Prioritaskan alamat Wi-Fi
      if (
        interfaceName.toLowerCase().includes("wi-fi")
      ) {
        return network.address;
      }
      candidates.push(network.address);
    }
  }
  return candidates.length > 0 ? candidates[0] : "localhost";
}

const wss = new WebSocket.Server({ server });
const clients = new Map();
let clientId = 0;

// koneksi WebSocket
wss.on("connection", (ws, req) => {
  const currentClientId = ++clientId;
  clients.set(currentClientId, ws);

  console.log(`Client ${currentClientId} connected`);

  ws.send(
    JSON.stringify({
      type: "connected",
      clientId: currentClientId,
      message: "Connected to WebSocket server",
    })
  );

  broadcastClientList();
  // handle message dari client
  ws.on("message", (data) => {
    try {
      const message = JSON.parse(data.toString());

      switch (message.type) {
        // buat pesan teks
        case "text":
            // kirim pesan ke client tertentu
          if (message.isPrivate && message.targetClient) {
            const targetClient = clients.get(parseInt(message.targetClient));
            if (targetClient && targetClient.readyState === WebSocket.OPEN) {
              targetClient.send(
                JSON.stringify({
                  type: "text",
                  from: currentClientId,
                  message: message.content,
                  isPrivate: true,
                  timestamp: new Date().toISOString(),
                })
              );
            }
          } else {
            // broadcast pesan ke semua client
            clients.forEach((client, id) => {
              if (
                id !== currentClientId &&
                client.readyState === WebSocket.OPEN
              ) {
                client.send(
                  JSON.stringify({
                    type: "text",
                    from: currentClientId,
                    message: message.content,
                    isPrivate: false,
                    timestamp: new Date().toISOString(),
                  })
                );
              }
            });
          }
          break;
        // buat pesan file 
        case "file":
          const fileData = {
            type: "file",
            from: currentClientId,
            filename: message.filename,
            size: message.size,
            data: message.data,
            isPrivate: message.isPrivate || false,
            timestamp: new Date().toISOString(),
          };
        // kirim file ke client tertentu
          if (message.isPrivate && message.targetClient) {
            const targetClient = clients.get(parseInt(message.targetClient));
            if (targetClient && targetClient.readyState === WebSocket.OPEN) {
              targetClient.send(JSON.stringify(fileData));
            }
          } else {
            clients.forEach((client, id) => {
              if (
                id !== currentClientId &&
                client.readyState === WebSocket.OPEN
              ) {
                client.send(JSON.stringify(fileData));
              }
            });
          }
          break;
        case "ping":
          ws.send(JSON.stringify({ type: "pong" }));
          break;
      }
    } catch (error) {
      if (data instanceof Buffer) {
        clients.forEach((client, id) => {
          if (id !== currentClientId && client.readyState === WebSocket.OPEN) {
            client.send(data);
          }
        });
      }
    }
  });

  ws.on("close", () => {
    console.log(`Client ${currentClientId} disconnected`);
    clients.delete(currentClientId);
    broadcastClientList();
  });

  ws.on("error", () => {
    clients.delete(currentClientId);
    broadcastClientList();
  });
});

// daftar client yang terhubung buat broadcast
function broadcastClientList() {
  const clientList = Array.from(clients.keys());
  const message = JSON.stringify({ type: "client_list", clients: clientList });

  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

const PORT = process.env.PORT || 9001;
const localIP = getLocalIP();

// jalankan server
server.listen(PORT, "0.0.0.0", () => {
  console.log(`WebSocket Server Started`);
  console.log(`Local: http://localhost:${PORT}`);
  console.log(`Network: http://${localIP}:${PORT}`);
});
