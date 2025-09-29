let ws,
  clientId,
  selectedTarget,
  messageMode = "broadcast";

// Inisialisasi elemen DOM
const elements = {
  status: document.getElementById("status"),
  chat: document.getElementById("chat"),
  msg: document.getElementById("msg"),
  clientId: document.getElementById("clientId"),
  currentMode: document.getElementById("currentMode"),
  clientList: document.getElementById("clientList"),
  clientListSection: document.getElementById("clientListSection"),
  selectedClient: document.getElementById("selectedClient"),
  sendBtn: document.getElementById("sendBtn"),
  sendFileBtn: document.getElementById("sendFileBtn"),
  downloadLinks: document.getElementById("downloadLinks"),
};

// Inisialisasi app ketika DOM sudah siap
document.addEventListener("DOMContentLoaded", () => {
  setupModeButtons();
  setupEventListeners();
  connect();
});

// Setup tombol mode (Broadcast/Private)
function setupModeButtons() {
  document.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".mode-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      messageMode = btn.dataset.mode;
      const isPrivate = messageMode === "private";

      // Update UI teks sesuai modenya
      elements.clientListSection.style.display = isPrivate ? "block" : "none";
      elements.sendBtn.textContent = isPrivate ? "Send Private" : "Send to All";
      elements.sendFileBtn.textContent = isPrivate
        ? "Send File Private"
        : "Send File";
      elements.currentMode.textContent = isPrivate ? "Private" : "Broadcast";
      if (!isPrivate) {
        selectedTarget = null;
        elements.selectedClient.textContent = "None";
      }
    });
  });
}

// Setup event listeners buat ping jaga koneksi tetap hidup
function setupEventListeners() {
  setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "ping" }));
    }
  }, 30000);
}

// Koneksi ke WebSocket server
function connect() {
  // Deteksi protokol (ws atau wss)
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const url = `${protocol}//${window.location.host}`;
  ws = new WebSocket(url);
  ws.binaryType = "arraybuffer"; 

  ws.onopen = () => {
    elements.status.textContent = "✅ Connected";
    elements.status.className = "connected";
    addMessage("Connected to server");
  };

  ws.onclose = () => {
    elements.status.textContent = "❌ Disconnected";
    elements.status.className = "disconnected";
    addMessage("Connection closed");
  };

  ws.onerror = () => {
    elements.status.textContent = "❌ Error";
    elements.status.className = "disconnected";
    addMessage("Connection error");
  };
  ws.onmessage = handleMessage;
}

// Handle pesan yang diterima dari server
function handleMessage(evt) {
  if (typeof evt.data === "string") {
    const msg = JSON.parse(evt.data);
    const time = new Date().toLocaleTimeString();

    // Handle berdasarkan tipe pesan
    switch (msg.type) {
      case "connected":
        clientId = msg.clientId;
        elements.clientId.textContent = clientId;
        addMessage(`Welcome! You are Client ${clientId}`);
        break;

      case "text":
        const prefix = msg.isPrivate ? "[PRIVATE]" : "[PUBLIC]";
        addMessage(`${prefix} [${time}] Client ${msg.from}: ${msg.message}`);
        break;

      case "file_info":
        const filePrefix = msg.isPrivate ? "[PRIVATE FILE]" : "[PUBLIC FILE]";
        addMessage(
          `${filePrefix} [${time}] Client ${msg.from} will send: ${msg.filename}`
        );
        // Simpan info file untuk isi binary data (file) yang masuk nanti
        window.expectedFile = {
          filename: msg.filename,
          size: msg.size,
          from: msg.from,
        };
        break;

      case "client_list":
        updateClientList(msg.clients);
        break;
    }
  } else {
    const size = evt.data.byteLength;
    if (window.expectedFile) {
        addMessage(`Received file: ${window.expectedFile.filename} from Client ${window.expectedFile.from}`);
        createDownloadLink(window.expectedFile.filename, evt.data, size);
        delete window.expectedFile; 
    } else {
        addMessage(`Received file (${size} bytes)`);
        createDownloadLink(`file_${Date.now()}`, evt.data, size);
    }
    }
}

// Tambah pesan ke area chat
function addMessage(text) {
  const time = new Date().toLocaleTimeString();
  elements.chat.value += `[${time}] ${text}\n`;
  elements.chat.scrollTop = elements.chat.scrollHeight; 
}

// Update daftar client yang online
function updateClientList(clients) {
  const others = clients.filter((id) => id !== clientId);

  if (others.length > 0) {
    elements.clientList.innerHTML = others
      .map(
        (id) =>
          `<div class="client-item" onclick="selectClient(${id}, this)">
        <span>Client ${id}</span>
      </div>`
      )
      .join("");
    addMessage(`Online: You + ${others.length} others`);
  } else {
    elements.clientList.innerHTML =
      '<div style="color: var(--text-muted); text-align: center; padding: 1rem;">No other clients</div>';
  }
}

// Fungsi global untuk memilih client target 
window.selectClient = function (id, element) {
  document
    .querySelectorAll(".client-item")
    .forEach((el) => el.classList.remove("selected"));

  element.classList.add("selected");
  selectedTarget = id;
  elements.selectedClient.textContent = `Client ${id}`;
};

// Fungsi global untuk kirim pesan teks
window.sendText = function () {
  const text = elements.msg.value.trim();
  if (!text || !ws || ws.readyState !== WebSocket.OPEN) return;
  if (messageMode === "private" && !selectedTarget) {
    alert("Please select a client");
    return;
  }

  ws.send(
    JSON.stringify({
      type: "text",
      content: text,
      isPrivate: messageMode === "private",
      targetClient: selectedTarget,
    })
  );

  const prefix =
    messageMode === "private"
      ? `[PRIVATE to Client ${selectedTarget}]`
      : "[BROADCAST]";
  addMessage(`${prefix} You: ${text}`);
  elements.msg.value = ""; 
};

// Fungsi global untuk kirim file
window.sendFile = function () {
  const file = document.getElementById("file").files[0];
  if (!file || !ws || ws.readyState !== WebSocket.OPEN) return;
  if (messageMode === "private" && !selectedTarget) {
    alert("Please select a client");
    return;
  }

  // Kirim info file dulu sebagai JSON
  ws.send(JSON.stringify({
    type: "file_info",
    filename: file.name,
    size: file.size,
    isPrivate: messageMode === "private",
    targetClient: selectedTarget,
  }));

  // kirim file sebagai binary ArrayBuffer
  const reader = new FileReader();
  reader.onload = (e) => {
    const arrayBuffer = e.target.result;
    ws.send(arrayBuffer);

    const prefix =
      messageMode === "private"
        ? `[PRIVATE to Client ${selectedTarget}]`
        : "[BROADCAST]";
    addMessage(`${prefix} Sent file: ${file.name}`);
    createDownloadLink(file.name, arrayBuffer, file.size);
  };

  reader.readAsArrayBuffer(file);
  document.getElementById("file").value = "";
};


// Buat link download untuk file
function createDownloadLink(filename, data, size) {
  const blob = new Blob([data]);
  const url = URL.createObjectURL(blob);
  const noDownloads = elements.downloadLinks.querySelector(".no-downloads");
  if (noDownloads) noDownloads.remove();

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.className = "download-link";
  link.textContent = `${filename} (${size} bytes)`;

  elements.downloadLinks.appendChild(link);

  const links = elements.downloadLinks.querySelectorAll(".download-link");
  if (links.length > 10) links[0].remove();
}