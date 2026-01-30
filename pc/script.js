const API_URL = 'https://dispatch-backend-32h8.onrender.com';

const socket = io(API_URL);

let currentUser = null;
let leafletMap = null;
let selectedCallId = null;
let callMarkers = {}; // Çağrı markerları

// BEEP sesi oluştur (Web Audio API ile)
const audioContext = new (window.AudioContext || window.webkitAudioContext)();
function playBeep() {
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  oscillator.frequency.value = 800; // 800Hz frekans
  oscillator.type = 'square'; // Retro square wave

  gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

  oscillator.start(audioContext.currentTime);
  oscillator.stop(audioContext.currentTime + 0.3);
}

// Sistem logu ekle
function addLog(message) {
  const log = document.getElementById('systemLog');
  const time = new Date().toLocaleTimeString('tr-TR');
  log.innerHTML += `<div>[${time}] ${message}</div>`;
  log.scrollTop = log.scrollHeight;
}

// Login
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;

  if (!username) return alert('Kullanıcı adı girin');

  try {
    const res = await fetch(`${API_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();

    if (data.user) {
      currentUser = data.user;
      document.getElementById('loginScreen').classList.add('hidden');
      document.getElementById('mainScreen').classList.remove('hidden');

      socket.emit('join', currentUser.id);
      addLog(`${username} (dispatch) sisteme bağlandı`);

      // Harita başlat (Leaflet)
      leafletMap = L.map('smallMap').setView([41.0082, 28.9784], 11);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: ''
      }).addTo(leafletMap);

      loadCalls();
    } else {
      alert(data.error || 'Giriş başarısız');
    }
  } catch (err) {
    console.error('Login fetch hatası:', err);
    alert('Sunucuya bağlanılamadı: ' + err.message + ' (Backend çalışıyor mu?)');
  }
});

// Aktif kullanıcılar güncelle
socket.on('users-update', (users) => {
  const list = document.getElementById('usersList');
  list.innerHTML = '';
  users.forEach(u => {
    const tag = u.type === 'dispatch' ? '(dispatch)' : '(kullanıcı)';
    const status = u.socketId ? '●' : '○';
    list.innerHTML += `<li>${status} ${u.username} ${tag}</li>`;
  });
  addLog('Kullanıcı listesi güncellendi');
});

// Yeni çağrı / güncelleme
socket.on('new-call', () => {
  playBeep(); // BEEP SESİ!
  loadCalls();
  addLog('🚨 YENİ ÇAĞRI ALINDI - BEEP!');
});

socket.on('call-updated', () => {
  loadCalls();
});

socket.on('calls-cleared', () => {
  loadCalls();
  addLog('Tüm çağrılar temizlendi');
});

// Çağrıları yükle
async function loadCalls() {
  try {
    const res = await fetch(`${API_URL}/api/calls`);
    const calls = await res.json();

    // İstatistikler
    document.getElementById('totalCalls').textContent = `Toplam Çağrı: ${calls.length}`;
    document.getElementById('pendingCalls').textContent = `Bekleyen: ${calls.filter(c => c.status === 'ALINDI').length}`;

    const tbody = document.getElementById('callsBody');
    tbody.innerHTML = '';

    calls.forEach(call => {
      const mapLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(call.location)}`;

      const row = document.createElement('tr');
      row.onclick = () => {
        selectedCallId = call.id;
        addLog(`Çağrı #${call.id} seçildi`);

        // Seçili satırı vurgula
        document.querySelectorAll('#callsBody tr').forEach(r => r.style.background = '');
        row.style.background = 'rgba(0,255,0,0.2)';

        // Haritada göster
        showCallOnMap(call);
      };

      row.innerHTML = `
        <td>${call.id}</td>
        <td>${call.timestamp}</td>
        <td><a href="${mapLink}" target="_blank" title="Google Maps'te aç">📍 ${call.location}</a></td>
        <td>${call.description}</td>
        <td>${call.priority || '-'}</td>
        <td><strong>${call.status}</strong></td>
        <td>${call.note || '-'}</td>
        <td>
          ${call.status === 'ALINDI' ? `<button onclick="changeStatus(${call.id}, 'YANITLANDI'); event.stopPropagation();">YANITLA</button>` : ''}
          ${call.status === 'YANITLANDI' ? `<button onclick="changeStatus(${call.id}, 'SONUÇLANDI'); event.stopPropagation();">SONUÇLANDIR</button>` : ''}
          <button onclick="addNote(${call.id}); event.stopPropagation();">NOT EKLE</button>
        </td>
      `;
      tbody.appendChild(row);
    });
  } catch (err) {
    addLog('Çağrılar yüklenirken hata: ' + err.message);
    console.error('loadCalls hatası:', err);
  }
}

// Haritada çağrıyı göster
async function showCallOnMap(call) {
  if (!leafletMap) return;

  // Önceki markerleri temizle
  Object.values(callMarkers).forEach(marker => marker.remove());
  callMarkers = {};

  // Geocoding ile konum bul (Nominatim - OpenStreetMap)
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(call.location)}`);
    const data = await res.json();

    if (data && data[0]) {
      const lat = parseFloat(data[0].lat);
      const lon = parseFloat(data[0].lon);

      // Haritayı konuma odakla
      leafletMap.setView([lat, lon], 16);

      // Kırmızı blip marker ekle
      const marker = L.marker([lat, lon], {
        icon: L.divIcon({
          className: 'call-marker',
          html: `<div style="background:#f00; width:20px; height:20px; border-radius:50%; border:3px solid #fff; box-shadow:0 0 10px #f00; animation:pulse 1s infinite;"></div>`,
          iconSize: [20, 20]
        })
      }).addTo(leafletMap);

      marker.bindPopup(`
        <strong>Çağrı #${call.id}</strong><br>
        ${call.location}<br>
        ${call.description}<br>
        <em>${call.status}</em>
      `).openPopup();

      callMarkers[call.id] = marker;

      addLog(`📍 Harita: ${call.location}`);
    } else {
      addLog(`⚠️ Konum bulunamadı: ${call.location}`);
    }
  } catch (err) {
    addLog('Harita hatası: ' + err.message);
    console.error('showCallOnMap hatası:', err);
  }
}

// Durum değiştir
window.changeStatus = async (id, newStatus) => {
  try {
    await fetch(`${API_URL}/api/calls/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    addLog(`Çağrı #${id} → ${newStatus}`);
  } catch (err) {
    addLog('Durum değiştirilemedi: ' + err.message);
    console.error('changeStatus hatası:', err);
  }
};

// Not ekle
window.addNote = async (id) => {
  const note = prompt('Not ekleyin:');
  if (note) {
    try {
      await fetch(`${API_URL}/api/calls/${id}/note`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note })
      });
      addLog(`Çağrı #${id}'e not eklendi`);
    } catch (err) {
      addLog('Not eklenemedi: ' + err.message);
      console.error('addNote hatası:', err);
    }
  }
};

// Tüm yeni çağrıları ALINDI yap
document.getElementById('markAllBtn').onclick = async () => {
  try {
    const res = await fetch(`${API_URL}/api/calls`);
    const calls = await res.json();

    for (const call of calls) {
      if (call.status !== 'ALINDI') {
        await changeStatus(call.id, 'ALINDI');
      }
    }
    addLog('Tüm çağrılar ALINDI yapıldı');
  } catch (err) {
    addLog('Hata: ' + err.message);
    console.error('markAllBtn hatası:', err);
  }
};

// Tüm çağrıları temizle
document.getElementById('clearAllBtn').onclick = async () => {
  if (confirm('TÜM çağrılar silinecek. Emin misiniz?')) {
    try {
      await fetch(`${API_URL}/api/calls`, { method: 'DELETE' });
      addLog('Tüm çağrılar silindi');
    } catch (err) {
      addLog('Silme hatası: ' + err.message);
      console.error('clearAllBtn hatası:', err);
    }
  }
};

// Konum talep et
document.getElementById('reqLocationBtn').onclick = () => {
  const targetId = prompt('Konum talep edilecek kullanıcı ID numarasını girin:');
  if (targetId) {
    socket.emit('request-location', Number(targetId));
    addLog(`Kullanıcı ID ${targetId}'den konum talep edildi`);
  }
};

// Konum geldi
socket.on('user-location', ({ userId, lat, lon }) => {
  if (leafletMap) {
    L.marker([lat, lon])
      .addTo(leafletMap)
      .bindPopup(`Kullanıcı ID: ${userId}`)
      .openPopup();
    leafletMap.setView([lat, lon], 14);
    addLog(`Kullanıcı ID ${userId} konumu alındı`);
  }
});

// Chat mesajı gönder
function sendChatMessage() {
  const text = document.getElementById('chatInput').value.trim();
  if (text && currentUser) {
    socket.emit('chat-message', {
      userId: currentUser.id,
      username: currentUser.username + ' (dispatch)',
      message: text
    });
    document.getElementById('chatInput').value = '';
  }
}

// Chat mesajı al
socket.on('chat-message', (msg) => {
  const log = document.getElementById('chatLog');
  const username = msg.username || 'Bilinmeyen';
  const message = msg.message || '';

  if (username && message) {
    log.innerHTML += `<div><strong>${username}:</strong> ${message}</div>`;
    log.scrollTop = log.scrollHeight;
  }
});

// Sohbet temizlendi
socket.on('chat-cleared', () => {
  document.getElementById('chatLog').innerHTML = '';
  addLog('Sohbet temizlendi');
});

// Bildirim gönder (seçili çağrıya bağlı kullanıcıya)
document.getElementById('sendNotifyBtn').onclick = () => {
  if (!selectedCallId) {
    alert('Önce bir çağrı seçin!');
    return;
  }

  const targetId = prompt(`Seçili çağrı: #${selectedCallId}\n\nBildirim gönderilecek kullanıcı ID:`, '');
  const message = prompt('Bildirim mesajı:', 'Çağrınız için bildirim');

  if (targetId && message) {
    socket.emit('send-notification', {
      targetUserId: Number(targetId),
      message
    });
    addLog(`Bildirim gönderildi → Kullanıcı ID ${targetId}: "${message}"`);
  }
};

// Enter ile chat gönderme
document.getElementById('chatInput').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    sendChatMessage();
  }
});

// Socket bağlantı hatalarını logla (debug için faydalı)
socket.on('connect_error', (err) => {
  console.error('Socket bağlantı hatası:', err.message);
  addLog('Socket bağlantı hatası: ' + err.message);
});
