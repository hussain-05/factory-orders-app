// firebase-messaging-sw.js
// IMPORTANT: Replace the firebaseConfig values below with your own
// from Firebase console → Project settings → Your apps → SDK setup
 
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyAWLSlZI-cXUqscSCMmwR1g7vJf3duzX50',
  authDomain: 'factory-orders-618a6.firebaseapp.com',
  projectId: 'factory-orders-618a6',
  storageBucket: 'factory-orders-618a6.firebasestorage.app',
  messagingSenderId: '835999021554',
  appId: '1:835999021554:web:378fc37b60827c7a5fd36b',
});

const messaging = firebase.messaging();
 
messaging.onBackgroundMessage((payload) => {
  // If the app is open and visible, skip the system notification —
  // the in-app foreground toast will handle it instead.
  self.clients
    .matchAll({ type: 'window', includeUncontrolled: true })
    .then((clients) => {
      const appIsOpen = clients.some((c) => c.visibilityState === 'visible');
      if (appIsOpen) return;
 
      const title = payload.notification?.title ?? 'Factory Orders';
      const body = payload.notification?.body ?? '';
      self.registration.showNotification(title, {
        body,
        icon: '/favicon.ico',
      });
    });
});
