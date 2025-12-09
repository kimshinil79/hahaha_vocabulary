import { getMessaging, getToken, onMessage, Messaging } from 'firebase/messaging';
import { collection, addDoc, doc, updateDoc, query, where, onSnapshot, getDoc, Timestamp, arrayUnion } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import app from '@/lib/firebase';
import { registerServiceWorker } from './serviceWorker';

let messaging: Messaging | null = null;
let serviceWorkerRegistration: ServiceWorkerRegistration | null = null;

// Service Worker 등록 및 FCM 초기화
export const initializeFCM = async (): Promise<string | null> => {
  if (typeof window === 'undefined') {
    console.log('[FCM] 서버 사이드에서는 실행되지 않습니다.');
    return null;
  }

  console.log('[FCM] FCM 초기화 시작...');

  // Service Worker 등록 (선택적 - 실패해도 포그라운드 알림은 작동)
  if ('serviceWorker' in navigator) {
    console.log('[FCM] Service Worker 지원 확인됨');
    try {
      const registration = await registerServiceWorker();
      if (registration) {
        serviceWorkerRegistration = registration;
        console.log('[FCM] Service Worker 등록 성공:', registration.scope);
      } else {
        console.warn('[FCM] Service Worker 등록 실패 - 포그라운드 알림만 사용 가능');
        // Service Worker 없이도 계속 진행 (포그라운드 알림은 작동)
      }
    } catch (error) {
      console.error('[FCM] Service Worker 등록 중 오류:', error);
      console.warn('[FCM] Service Worker 없이 계속 진행 - 포그라운드 알림만 사용 가능');
      // Service Worker 없이도 계속 진행
    }
  } else {
    console.warn('[FCM] 이 브라우저는 Service Worker를 지원하지 않습니다 - 포그라운드 알림만 사용 가능');
    // Service Worker 없이도 계속 진행
  }

  // FCM 초기화
  try {
    console.log('[FCM] Firebase Messaging 초기화 중...');
    // Firebase v9+에서는 getMessaging에 옵션을 전달하지 않습니다
    // Service Worker는 자동으로 감지됩니다
    messaging = getMessaging(app);
    console.log('[FCM] Firebase Messaging 초기화 성공');
  } catch (error) {
    console.error('[FCM] FCM 초기화 실패:', error);
    return null;
  }

  // 알림 권한 요청
  console.log('[FCM] 현재 알림 권한 상태:', Notification.permission);
  if (Notification.permission === 'default') {
    console.log('[FCM] 알림 권한 요청 중...');
    const permission = await Notification.requestPermission();
    console.log('[FCM] 알림 권한 응답:', permission);
    if (permission !== 'granted') {
      console.warn('[FCM] 알림 권한이 거부되었습니다. 브라우저 설정에서 알림을 허용해주세요.');
      return null;
    }
  } else if (Notification.permission === 'denied') {
    console.warn('[FCM] 알림 권한이 거부되었습니다. 브라우저 설정에서 알림을 허용해주세요.');
    return null;
  } else {
    console.log('[FCM] 알림 권한이 이미 허용되어 있습니다.');
  }

  // FCM 토큰 가져오기
  try {
    const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
    console.log('[FCM] VAPID 키 확인:', vapidKey ? '설정됨' : '설정되지 않음');
    
    if (!vapidKey) {
      console.error('[FCM] VAPID 키가 설정되지 않았습니다. .env.local 파일에 NEXT_PUBLIC_FIREBASE_VAPID_KEY를 추가해주세요.');
      return null;
    }

    console.log('[FCM] FCM 토큰 요청 중...');
    const token = await getToken(messaging, { vapidKey });
    if (token) {
      console.log('[FCM] FCM 토큰 가져오기 성공:', token.substring(0, 20) + '...');
      await saveFCMToken(token);
      return token;
    } else {
      console.warn('[FCM] FCM 토큰을 가져올 수 없습니다. 알림 권한을 확인해주세요.');
      return null;
    }
  } catch (error: any) {
    console.error('[FCM] FCM 토큰 가져오기 실패:', error);
    console.error('[FCM] 에러 상세:', error.message, error.code);
    return null;
  }
};

// FCM 토큰을 Firestore에 저장
const saveFCMToken = async (token: string) => {
  const user = auth.currentUser;
  if (!user) return;

  try {
    const userDocRef = doc(db, 'users', user.uid);
    await updateDoc(userDocRef, {
      fcmToken: token,
      fcmTokenUpdatedAt: Timestamp.now(),
    });
    console.log('FCM 토큰 저장 완료');
  } catch (error) {
    console.error('FCM 토큰 저장 실패:', error);
  }
};

// 포그라운드 메시지 수신 처리
export const setupForegroundMessageHandler = (
  onMessageReceived: (payload: any) => void
) => {
  if (!messaging) {
    console.warn('[FCM] Messaging이 초기화되지 않았습니다. 포그라운드 메시지 핸들러를 설정할 수 없습니다.');
    return;
  }

  try {
    onMessage(messaging, (payload) => {
      console.log('[FCM] 포그라운드 메시지 수신:', payload);
      onMessageReceived(payload);
    });
    console.log('[FCM] 포그라운드 메시지 핸들러 설정 완료');
  } catch (error) {
    console.error('[FCM] 포그라운드 메시지 핸들러 설정 실패:', error);
  }
};

// 관계 요청 전송
export const sendRelationshipRequest = async (
  toEmail: string,
  fromUserNickname: string,
  requestType: 'friend' | 'student' | 'child'
) => {
  const user = auth.currentUser;
  if (!user || !user.email) {
    throw new Error('로그인이 필요합니다.');
  }

  try {
    await addDoc(collection(db, 'relationship_requests'), {
      fromUserId: user.uid,
      fromUserEmail: user.email,
      fromUserNickname: fromUserNickname,
      toUserEmail: toEmail.toLowerCase(),
      requestType: requestType,
      status: 'pending',
      createdAt: Timestamp.now(),
    });
    console.log('관계 요청 전송 완료');
  } catch (error) {
    console.error('관계 요청 전송 실패:', error);
    throw error;
  }
};

// 관계 요청 수락
export const acceptRelationshipRequest = async (
  requestId: string,
  requestType: 'friend' | 'student' | 'child'
) => {
  const user = auth.currentUser;
  if (!user || !user.email) {
    throw new Error('로그인이 필요합니다.');
  }

  try {
    // 요청 문서 가져오기
    const requestDocRef = doc(db, 'relationship_requests', requestId);
    const requestDocSnap = await getDoc(requestDocRef);

    if (!requestDocSnap.exists()) {
      throw new Error('요청을 찾을 수 없습니다.');
    }

    const requestData = requestDocSnap.data();
    const fromUserId = requestData.fromUserId as string;
    const fromUserEmail = requestData.fromUserEmail as string;

    // 요청 상태 업데이트
    await updateDoc(requestDocRef, {
      status: 'accepted',
      acceptedAt: Timestamp.now(),
    });

    // fromUser의 문서에서 현재 사용자 추가
    const fromUserDocRef = doc(db, 'users', fromUserId);
    const currentUserDocRef = doc(db, 'users', user.uid);

    if (requestType === 'friend') {
      // 양방향 친구 추가
      await updateDoc(fromUserDocRef, {
        friends: arrayUnion(user.email!.toLowerCase()),
      });
      await updateDoc(currentUserDocRef, {
        friends: arrayUnion(fromUserEmail.toLowerCase()),
      });
    } else if (requestType === 'student') {
      // 선생님의 students에 학생 추가
      await updateDoc(fromUserDocRef, {
        students: arrayUnion(user.email!.toLowerCase()),
      });
    } else if (requestType === 'child') {
      // 부모의 children에 자녀 추가
      await updateDoc(fromUserDocRef, {
        children: arrayUnion(user.email!.toLowerCase()),
      });
    }

    console.log('관계 요청 수락 완료');
  } catch (error) {
    console.error('관계 요청 수락 실패:', error);
    throw error;
  }
};

// 관계 요청 거절
export const rejectRelationshipRequest = async (requestId: string) => {
  try {
    const requestDocRef = doc(db, 'relationship_requests', requestId);
    await updateDoc(requestDocRef, {
      status: 'rejected',
      rejectedAt: Timestamp.now(),
    });
    console.log('관계 요청 거절 완료');
  } catch (error) {
    console.error('관계 요청 거절 실패:', error);
    throw error;
  }
};

// 대기 중인 요청 가져오기 (실시간)
export const subscribeToPendingRequests = (
  callback: (requests: any[]) => void
) => {
  const user = auth.currentUser;
  if (!user || !user.email) {
    return () => {};
  }

  const q = query(
    collection(db, 'relationship_requests'),
    where('toUserEmail', '==', user.email!.toLowerCase()),
    where('status', '==', 'pending')
  );

  const unsubscribe = onSnapshot(q, (snapshot) => {
    const requests = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    callback(requests);
  });

  return unsubscribe;
};

