const API_URL = 'https://dispatch-backend-32h8.onrender.com';

const socket = io(API_URL);

let currentUser;

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const username = document.getElementById('username').value;
  const password = 'OCST2020';  // Sabit şifre, istersen değiştir

  try {
    const res = await fetch(`${API_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, type: 'mobile' })
    });

    if (res.ok) {
      const data = await res.json();
      currentUser = data.user;
      
      document.getElementById('loginContainer').style.display = 'none';
      document.getElementById('mainContainer').style.display = 'block';
      
      socket.emit('join', currentUser.id);
      console.log('Giriş başarılı:', currentUser.username);
    } else {
      const errorData = await res.json();
      alert('Giriş hatası: ' + (errorData.error || 'Bilinmeyen hata'));
      console.error('Login hatası:', errorData);
    }
  } catch (err) {
    console.error('Fetch hatası:', err);
    alert('Sunucuya bağlanılamadı. Backend çalışıyor mu? (Failed to fetch)');
  }
});

// Mevcut çağrı gönderme aynı, ama callData'ya userId ekle: currentUser.id
// Chat
function sendChat() {
  const msg = document.getElementById('chatInput').value;
  if (msg) {
    socket.emit('chat-message', { 
      from: currentUser.username, 
      text: msg, 
      tag: '(kullanıcı)' 
    });
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
      socket.emit('share-location', { 
        lat: pos.coords.latitude, 
        lon: pos.coords.longitude, 
        userId: currentUser.id 
      });
    }, err => {
      console.error('Konum alınamadı:', err);
      alert('Konum izni verilmedi veya hata oluştu.');
    });
  }
});

// Bildirim al
socket.on('notification', (msg) => {
  alert(`Bildirim: ${msg}`); // İleride Notification API kullanılabilir
});

// Socket bağlantı hatalarını logla (debug için faydalı)
socket.on('connect_error', (err) => {
  console.error('Socket bağlantı hatası:', err.message);
});
