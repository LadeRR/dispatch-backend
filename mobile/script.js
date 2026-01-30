const API_URL = 'http://localhost:3000';
const socket = io(API_URL);
let currentUser;

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('username').value;
  const password = 'OCST2020';

  const res = await fetch(`${API_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, type: 'mobile' })
  });

  if (res.ok) {
    currentUser = (await res.json()).user;
    document.getElementById('loginContainer').style.display = 'none';
    document.getElementById('mainContainer').style.display = 'block';
    socket.emit('join', currentUser.id);
  } else {
    alert('Giriş hatası!');
  }
});

// Mevcut çağrı gönderme aynı, ama callData'ya userId ekle: currentUser.id

// Chat
function sendChat() {
  const msg = document.getElementById('chatInput').value;
  if (msg) {
    socket.emit('chat-message', { from: currentUser.username, text: msg, tag: '(kullanıcı)' });
    document.getElementById('chatInput').value = '';
  }
}
socket.on('chat-message', (msg) => {
  const div = document.createElement('div');
  div.textContent = `${msg.from} ${msg.tag}: ${msg.text}`;
  document.getElementById('chatMessages').appendChild(div);
});

// Konum isteği al
socket.on('location-request', () => {
  if (confirm('Dispatch konumunuzu istiyor. Paylaş?')) {
    navigator.geolocation.getCurrentPosition(pos => {
      socket.emit('share-location', { lat: pos.coords.latitude, lon: pos.coords.longitude, userId: currentUser.id });
    });
  }
});

// Bildirim al
socket.on('notification', (msg) => {
  alert(`Bildirim: ${msg}`);  // İleride Notification API
});