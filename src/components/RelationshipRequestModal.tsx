'use client';

import { useState, useEffect } from 'react';
import { acceptRelationshipRequest, rejectRelationshipRequest } from '@/utils/fcmService';

interface RelationshipRequest {
  id: string;
  fromUserNickname: string;
  fromUserEmail: string;
  requestType: 'friend' | 'student' | 'child';
  createdAt: any;
}

interface RelationshipRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  request: RelationshipRequest | null;
  onRequestHandled: () => void;
}

export default function RelationshipRequestModal({
  isOpen,
  onClose,
  request,
  onRequestHandled,
}: RelationshipRequestModalProps) {
  const [processing, setProcessing] = useState(false);

  if (!isOpen || !request) return null;

  const getRequestTypeLabel = (type: string) => {
    switch (type) {
      case 'friend':
        return '친구 요청';
      case 'student':
        return '학생 등록 요청';
      case 'child':
        return '자녀 등록 요청';
      default:
        return '요청';
    }
  };

  const getRequestTypeDescription = (type: string) => {
    switch (type) {
      case 'friend':
        return `${request.fromUserNickname}님이 친구 요청을 보냈습니다.`;
      case 'student':
        return `${request.fromUserNickname}님(선생님)이 학생 등록 요청을 보냈습니다.`;
      case 'child':
        return `${request.fromUserNickname}님(부모님)이 자녀 등록 요청을 보냈습니다.`;
      default:
        return `${request.fromUserNickname}님이 요청을 보냈습니다.`;
    }
  };

  const handleAccept = async () => {
    setProcessing(true);
    try {
      await acceptRelationshipRequest(request.id, request.requestType);
      alert('요청을 수락했습니다.');
      onRequestHandled();
      onClose();
    } catch (error: any) {
      console.error('요청 수락 실패:', error);
      alert(`요청 수락 중 오류가 발생했습니다: ${error.message}`);
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    setProcessing(true);
    try {
      await rejectRelationshipRequest(request.id);
      alert('요청을 거절했습니다.');
      onRequestHandled();
      onClose();
    } catch (error: any) {
      console.error('요청 거절 실패:', error);
      alert(`요청 거절 중 오류가 발생했습니다: ${error.message}`);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[200] p-4">
      <div className="bg-white rounded-3xl shadow-xl w-full max-w-md">
        <div className="p-6 border-b border-gray-100 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-t-3xl">
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-bold text-white">{getRequestTypeLabel(request.requestType)}</h3>
            <button
              onClick={onClose}
              disabled={processing}
              className="text-white hover:text-gray-200 text-3xl font-bold disabled:opacity-50"
            >
              ×
            </button>
          </div>
        </div>
        <div className="p-6 space-y-4">
          <div className="text-center">
            <div className="text-6xl mb-4">👋</div>
            <h4 className="text-lg font-semibold text-gray-900 mb-2">
              {request.fromUserNickname}
            </h4>
            <p className="text-gray-600 text-sm">
              {getRequestTypeDescription(request.requestType)}
            </p>
            <p className="text-gray-400 text-xs mt-2">
              {request.fromUserEmail}
            </p>
          </div>
          <div className="flex gap-3 pt-4">
            <button
              onClick={handleReject}
              disabled={processing}
              className="flex-1 px-4 py-3 rounded-xl border-2 border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 font-semibold"
            >
              거절
            </button>
            <button
              onClick={handleAccept}
              disabled={processing}
              className="flex-1 px-4 py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
            >
              {processing ? '처리 중...' : '수락'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

