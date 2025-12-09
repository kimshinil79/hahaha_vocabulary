'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';

interface Relationships {
  children: string[];
  friends: string[];
  students: string[];
}

interface RelationshipsContextType {
  relationships: Relationships;
  loading: boolean;
  refresh: () => void;
}

const RelationshipsContext = createContext<RelationshipsContextType | undefined>(undefined);

export function RelationshipsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [relationships, setRelationships] = useState<Relationships>({
    children: [],
    friends: [],
    students: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setRelationships({
        children: [],
        friends: [],
        students: [],
      });
      setLoading(false);
      return;
    }

    setLoading(true);
    const userDocRef = doc(db, 'users', user.uid);

    // 실시간 리스너 설정
    const unsubscribe = onSnapshot(
      userDocRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const userData = snapshot.data();
          setRelationships({
            children: userData.children || [],
            friends: userData.friends || [],
            students: userData.students || [],
          });
        } else {
          setRelationships({
            children: [],
            friends: [],
            students: [],
          });
        }
        setLoading(false);
      },
      (error) => {
        console.error('[RelationshipsProvider] 프로필 불러오기 오류:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  const refresh = () => {
    // 리스너가 자동으로 업데이트하므로 별도 작업 불필요
    // 필요시 강제 새로고침 로직 추가 가능
  };

  return (
    <RelationshipsContext.Provider value={{ relationships, loading, refresh }}>
      {children}
    </RelationshipsContext.Provider>
  );
}

export function useRelationships() {
  const context = useContext(RelationshipsContext);
  if (context === undefined) {
    throw new Error('useRelationships must be used within a RelationshipsProvider');
  }
  return context;
}

