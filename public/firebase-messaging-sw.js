// Service Worker for Firebase Cloud Messaging
// 이 파일은 반드시 서버의 public 폴더에 있어야 합니다.

importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

let firebaseInitialized = false;
let messaging = null;

// 알림 클릭 처리 - 반드시 초기 평가 시 등록
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification click received.');
  
  event.notification.close();
  
  const data = event.notification.data;
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // 현재 열려있는 클라이언트 찾기
      for (const client of clientList) {
        // URL이 일치하거나 루트 경로인 경우
        if (client.url && (client.url.includes(self.location.origin) || client.url === self.location.origin + '/')) {
          client.postMessage({
            type: 'NOTIFICATION_CLICK',
            data: data,
          });
          return client.focus();
        }
      }
      // 열려있는 클라이언트가 없으면 새로 열기
      if (clients.openWindow) {
        return clients.openWindow(self.location.origin + '/');
      }
    })
  );
});

// 클라이언트로부터 Firebase 설정 받기
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'FIREBASE_CONFIG' && !firebaseInitialized) {
    try {
      const firebaseConfig = event.data.config;
      firebase.initializeApp(firebaseConfig);
      firebaseInitialized = true;
      console.log('[SW] Firebase 초기화 완료');
      
      // 메시징 설정
      messaging = firebase.messaging();
      
      messaging.onBackgroundMessage((payload) => {
        console.log('[SW] Received background message:', payload);
        
        const notificationTitle = payload.notification?.title || '알림';
        const notificationOptions = {
          body: payload.notification?.body || '',
          icon: '/icon-192x192.png',
          badge: '/badge-72x72.png',
          data: payload.data,
        };

        return self.registration.showNotification(notificationTitle, notificationOptions);
      });
    } catch (error) {
      console.error('[SW] Firebase 초기화 오류:', error);
    }
  }
});
