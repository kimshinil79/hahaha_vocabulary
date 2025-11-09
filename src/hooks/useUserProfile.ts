import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from './useAuth';

export const useUserProfile = () => {
  const { user } = useAuth();
  const [nickname, setNickname] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUserProfile = async () => {
      if (!user) {
        setNickname('');
        setLoading(false);
        return;
      }

      try {
        const email = user.email;
        const uid = user.uid;
        
        if (email) {
          const username = email.split('@')[0];
          const docRef = doc(db, 'users', `${username}${uid}`);
          const docSnap = await getDoc(docRef);

          if (docSnap.exists()) {
            const data = docSnap.data();
            setNickname(data.nickname || '');
          }
        }
      } catch (error) {
        console.error('사용자 프로필 가져오기 오류:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchUserProfile();
  }, [user]);

  return { nickname, loading };
};
