import { useState } from 'react';
import { doc, setDoc, getDoc } from 'firebase/firestore';
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

interface MeaningsData {
  meanings: {
    [word: string]: WordData;
  };
}

export const useWordData = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const saveWordData = async (jsonData: string): Promise<boolean> => {
    if (!user) {
      setError('로그인이 필요합니다');
      return false;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // JSON 파싱
      const data: MeaningsData = JSON.parse(jsonData);
      
      if (!data.meanings) {
        throw new Error('올바른 JSON 형식이 아닙니다. meanings 객체가 필요합니다.');
      }

      const email = user.email;
      const uid = user.uid;
      
      if (!email) {
        throw new Error('이메일 정보를 찾을 수 없습니다.');
      }

      const username = email.split('@')[0];
      const userDocId = `${username}${uid}`;

      // 1. 기존 meanings 데이터 읽어오기
      const userDocRef = doc(db, 'users', userDocId);
      const userDocSnap = await getDoc(userDocRef);
      
      let existingMeanings: { [word: string]: WordData } = {};
      if (userDocSnap.exists()) {
        const userData = userDocSnap.data();
        existingMeanings = userData.meanings || {};
      }

      // 2. 기존 meanings와 새로운 meanings 병합 (중복 제거)
      const mergedMeanings = { ...existingMeanings };
      let addedCount = 0;
      let skippedCount = 0;
      
      Object.entries(data.meanings).forEach(([word, newWordData]) => {
        const newMeaningsArray = newWordData.meanings || [];
        
        if (mergedMeanings[word]) {
          // 기존 단어가 있으면 meanings 배열 병합 (중복 제거)
          const existingMeaningsArray = mergedMeanings[word].meanings || [];
          
          // 새로운 meanings 중에서 중복이 없는 것만 필터링
          const existingDefinitions = new Set(
            existingMeaningsArray.map(m => m.definition?.toLowerCase().trim() || '')
          );
          
          const uniqueNewMeanings = newMeaningsArray.filter(newMeaning => {
            const newDefinition = newMeaning.definition?.toLowerCase().trim() || '';
            if (existingDefinitions.has(newDefinition)) {
              skippedCount++;
              return false; // 중복이므로 제외
            }
            existingDefinitions.add(newDefinition); // 중복 체크를 위해 추가
            addedCount++;
            return true; // 중복이 아니므로 추가
          });
          
          if (uniqueNewMeanings.length > 0) {
            // 새로운 의미가 있으면 기존 배열에 추가
            mergedMeanings[word] = {
              meanings: [...existingMeaningsArray, ...uniqueNewMeanings],
              updatedAt: new Date().toISOString()
            };
          }
        } else {
          // 새 단어는 그대로 추가
          mergedMeanings[word] = {
            ...newWordData,
            updatedAt: new Date().toISOString()
          };
          addedCount += newMeaningsArray.length;
        }
      });

      // 3. 병합된 meanings 데이터 저장
      await setDoc(userDocRef, {
        meanings: mergedMeanings,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      // 4. meanings 컬렉션에 각 단어별로 저장 (병합된 데이터 사용)
      const meaningsPromises = Object.entries(mergedMeanings).map(async ([word, wordData]) => {
        const wordDocRef = doc(db, 'meanings', word);
        await setDoc(wordDocRef, {
          ...wordData,
          word: word,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      });

      await Promise.all(meaningsPromises);

      const newWordsCount = Object.keys(data.meanings).length;
      const totalWordsCount = Object.keys(mergedMeanings).length;
      
      let successMessage = `성공적으로 저장되었습니다! ${addedCount}개의 의미가 추가되었습니다.`;
      if (skippedCount > 0) {
        successMessage += ` (${skippedCount}개의 중복 의미는 건너뛰었습니다)`;
      }
      successMessage += ` (총 ${totalWordsCount}개 단어)`;
      
      setSuccess(successMessage);
      console.log('단어 데이터 저장 완료:', data);
      
      return true; // 성공 시 true 반환

    } catch (err) {
      console.error('단어 데이터 저장 오류:', err);
      setError(err instanceof Error ? err.message : '데이터 저장 중 오류가 발생했습니다.');
      return false; // 실패 시 false 반환
    } finally {
      setLoading(false);
    }
  };

  return { loading, error, success, saveWordData };
};
