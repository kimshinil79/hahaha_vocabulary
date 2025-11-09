import { useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from './useAuth';

interface WordMeaning {
  definition: string;
  examples: string[];
  frequency: number;
  updatedAt: string;
}

interface WordData {
  meanings: WordMeaning[];
  updatedAt: string;
}

export const useDirectWordData = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const saveDirectWord = async (word: string, meaning: string, example: string): Promise<boolean> => {
    if (!user) {
      setError('로그인이 필요합니다');
      return false;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const email = user.email;
      const uid = user.uid;
      
      if (!email) {
        throw new Error('이메일 정보를 찾을 수 없습니다.');
      }

      const username = email.split('@')[0];
      const userDocId = `${username}${uid}`;
      const wordKey = word.toLowerCase().trim();
      const now = new Date().toISOString();

      // 1. users 컬렉션에서 기존 meanings 데이터 가져오기
      const userDocRef = doc(db, 'users', userDocId);
      const userDocSnap = await getDoc(userDocRef);
      
      let existingMeanings = {};
      if (userDocSnap.exists()) {
        const userData = userDocSnap.data();
        existingMeanings = userData.meanings || {};
      }

      // 2. meanings 컬렉션에서 기존 단어 데이터 가져오기
      const wordDocRef = doc(db, 'meanings', wordKey);
      const wordDocSnap = await getDoc(wordDocRef);
      
      let existingWordData: WordData = {
        meanings: [],
        updatedAt: now
      };
      
      if (wordDocSnap.exists()) {
        const wordData = wordDocSnap.data();
        existingWordData = {
          meanings: wordData.meanings || [],
          updatedAt: wordData.updatedAt || now
        };
      }

      // 3. 새로운 의미 추가
      const newMeaning: WordMeaning = {
        definition: meaning.trim(),
        examples: [example.trim()],
        frequency: 1,
        updatedAt: now
      };

      // 기존 의미가 있는지 확인 (같은 정의가 있는지)
      const existingMeaningIndex = existingWordData.meanings.findIndex(
        m => m.definition.toLowerCase() === meaning.trim().toLowerCase()
      );

      let updatedMeanings: WordMeaning[];
      if (existingMeaningIndex >= 0) {
        // 기존 의미가 있으면 예문만 추가
        updatedMeanings = [...existingWordData.meanings];
        const existingMeaning = updatedMeanings[existingMeaningIndex];
        
        // 중복되지 않는 예문만 추가
        const newExamples = example.trim();
        if (!existingMeaning.examples.includes(newExamples)) {
          existingMeaning.examples.push(newExamples);
        }
        existingMeaning.frequency += 1;
        existingMeaning.updatedAt = now;
      } else {
        // 새로운 의미 추가
        updatedMeanings = [...existingWordData.meanings, newMeaning];
      }

      const updatedWordData: WordData = {
        meanings: updatedMeanings,
        updatedAt: now
      };

      // 4. users 컬렉션에 업데이트된 meanings 저장
      const updatedUserMeanings = {
        ...existingMeanings,
        [wordKey]: updatedWordData
      };

      await setDoc(userDocRef, {
        meanings: updatedUserMeanings,
        updatedAt: now
      }, { merge: true });

      // 5. meanings 컬렉션에 업데이트된 단어 데이터 저장
      await setDoc(wordDocRef, {
        ...updatedWordData,
        word: wordKey,
        updatedAt: now
      });

      const action = existingMeaningIndex >= 0 ? '업데이트' : '추가';
      setSuccess(`단어가 성공적으로 ${action}되었습니다!`);
      console.log('단어 데이터 저장 완료:', updatedWordData);
      
      return true;

    } catch (err) {
      console.error('단어 데이터 저장 오류:', err);
      setError(err instanceof Error ? err.message : '데이터 저장 중 오류가 발생했습니다.');
      return false;
    } finally {
      setLoading(false);
    }
  };

  return { loading, error, success, saveDirectWord };
};
