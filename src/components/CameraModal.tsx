'use client';

import { useState, useRef, useEffect } from 'react';

interface CameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (imageDataUrl: string) => void;
}

export default function CameraModal({ isOpen, onClose, onCapture }: CameraModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cropCanvasRef = useRef<HTMLCanvasElement>(null);
  const cropImageRef = useRef<HTMLImageElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [capturedImage, setCapturedImage] = useState<string | null>(null); // 촬영된 이미지
  const [isCropping, setIsCropping] = useState(false); // 크롭 모드 여부
  const [croppedImagePreview, setCroppedImagePreview] = useState<string | null>(null); // 크롭된 이미지 미리보기
  
  // 크롭 영역 상태
  const [cropArea, setCropArea] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dragType, setDragType] = useState<'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w'>('move'); // 드래그 타입
  const [cropStart, setCropStart] = useState({ x: 0, y: 0, width: 0, height: 0 }); // 드래그 시작 시 크롭 영역 상태
  const cropContainerRef = useRef<HTMLDivElement>(null);
  
  const HANDLE_SIZE = 20; // 모서리 핸들 크기

  useEffect(() => {
    if (isOpen) {
      startCamera();
      // 모달이 열릴 때 body 스크롤 및 터치 이벤트 막기
      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'none';
    } else {
      stopCamera();
      // 모달이 닫힐 때 body 스타일 복원
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    }

    return () => {
      stopCamera();
      // 컴포넌트 언마운트 시 body 스타일 복원
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    };
  }, [isOpen, facingMode]);

  const startCamera = async () => {
    try {
      setError(null);
      
      // 기존 스트림 정리
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }

      // 카메라 권한 요청 및 스트림 시작
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });

      setStream(mediaStream);
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      console.error('카메라 접근 오류:', err);
      if (err instanceof Error) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setError('카메라 권한이 거부되었습니다. 브라우저 설정에서 권한을 허용해주세요.');
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          setError('카메라를 찾을 수 없습니다.');
        } else {
          setError(`카메라 접근 오류: ${err.message}`);
        }
      } else {
        setError('카메라에 접근할 수 없습니다.');
      }
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (!ctx) return;

    // 비디오 크기에 맞춰 캔버스 크기 설정
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // 비디오 프레임을 캔버스에 그리기
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // 캔버스를 이미지 데이터 URL로 변환
    const imageDataUrl = canvas.toDataURL('image/jpeg', 0.9);
    
    // 촬영된 이미지 저장하고 크롭 모드로 전환
    setCapturedImage(imageDataUrl);
    setIsCropping(true);
    
    // 카메라 정지
    stopCamera();
  };

  // 크롭 영역 초기화 (이미지 로드 시)
  useEffect(() => {
    if (isCropping && capturedImage && cropImageRef.current && cropContainerRef.current) {
      const img = cropImageRef.current;
      const container = cropContainerRef.current;
      
      const initializeCropArea = () => {
        // 이미지가 이미 로드되어 있거나 로드 완료 시
        if (img.complete && img.naturalWidth > 0) {
          // 이미지 크기에 맞춰 컨테이너 크기 계산
          const containerRect = container.getBoundingClientRect();
          const imgAspect = img.naturalWidth / img.naturalHeight;
          const containerAspect = containerRect.width / containerRect.height;
          
          let displayWidth, displayHeight;
          if (imgAspect > containerAspect) {
            displayWidth = containerRect.width;
            displayHeight = containerRect.width / imgAspect;
          } else {
            displayHeight = containerRect.height;
            displayWidth = containerRect.height * imgAspect;
          }
          
          // 중앙에 크롭 영역 초기화 (이미지의 80% 크기)
          const cropSize = Math.min(displayWidth, displayHeight) * 0.8;
          setCropArea({
            x: (displayWidth - cropSize) / 2,
            y: (displayHeight - cropSize) / 2,
            width: cropSize,
            height: cropSize
          });
        }
      };

      // 이미지가 이미 로드되어 있는지 확인
      if (img.complete) {
        // 약간의 지연을 주어 DOM 업데이트 후 실행
        setTimeout(initializeCropArea, 100);
      } else {
        img.onload = initializeCropArea;
      }
    }
  }, [isCropping, capturedImage]);

  // 드래그 타입 감지 함수
  const getDragType = (x: number, y: number): 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w' => {
    const { x: cropX, y: cropY, width, height } = cropArea;
    
    // 모서리 확인
    if (x >= cropX - HANDLE_SIZE && x <= cropX + HANDLE_SIZE && 
        y >= cropY - HANDLE_SIZE && y <= cropY + HANDLE_SIZE) return 'nw';
    if (x >= cropX + width - HANDLE_SIZE && x <= cropX + width + HANDLE_SIZE && 
        y >= cropY - HANDLE_SIZE && y <= cropY + HANDLE_SIZE) return 'ne';
    if (x >= cropX - HANDLE_SIZE && x <= cropX + HANDLE_SIZE && 
        y >= cropY + height - HANDLE_SIZE && y <= cropY + height + HANDLE_SIZE) return 'sw';
    if (x >= cropX + width - HANDLE_SIZE && x <= cropX + width + HANDLE_SIZE && 
        y >= cropY + height - HANDLE_SIZE && y <= cropY + height + HANDLE_SIZE) return 'se';
    
    // 가장자리 확인
    if (x >= cropX && x <= cropX + width && 
        y >= cropY - HANDLE_SIZE && y <= cropY + HANDLE_SIZE) return 'n';
    if (x >= cropX && x <= cropX + width && 
        y >= cropY + height - HANDLE_SIZE && y <= cropY + height + HANDLE_SIZE) return 's';
    if (x >= cropX - HANDLE_SIZE && x <= cropX + HANDLE_SIZE && 
        y >= cropY && y <= cropY + height) return 'w';
    if (x >= cropX + width - HANDLE_SIZE && x <= cropX + width + HANDLE_SIZE && 
        y >= cropY && y <= cropY + height) return 'e';
    
    // 크롭 영역 내부 확인
    if (x >= cropX && x <= cropX + width && y >= cropY && y <= cropY + height) return 'move';
    
    return 'move';
  };

  // 마우스/터치 이벤트 처리
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!cropContainerRef.current) return;
    const rect = cropContainerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const type = getDragType(x, y);
    setIsDragging(true);
    setDragType(type);
    setDragStart({ x, y });
    setCropStart({ ...cropArea }); // 드래그 시작 시 크롭 영역 상태 저장
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !cropContainerRef.current) return;
    
    const rect = cropContainerRef.current.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;
    
    const dx = currentX - dragStart.x;
    const dy = currentY - dragStart.y;
    
    const minSize = 50; // 최소 크기
    
    let newCropArea = { ...cropStart };
    
    switch (dragType) {
      case 'move':
        // 크롭 영역 이동
        newCropArea.x = Math.max(0, Math.min(cropStart.x + dx, rect.width - cropStart.width));
        newCropArea.y = Math.max(0, Math.min(cropStart.y + dy, rect.height - cropStart.height));
        break;
        
      case 'nw': // 왼쪽 위 모서리
        newCropArea.x = Math.max(0, cropStart.x + dx);
        newCropArea.y = Math.max(0, cropStart.y + dy);
        newCropArea.width = Math.max(minSize, cropStart.width - dx);
        newCropArea.height = Math.max(minSize, cropStart.height - dy);
        break;
        
      case 'ne': // 오른쪽 위 모서리
        newCropArea.y = Math.max(0, cropStart.y + dy);
        newCropArea.width = Math.max(minSize, cropStart.width + dx);
        newCropArea.height = Math.max(minSize, cropStart.height - dy);
        newCropArea.x = Math.min(newCropArea.x, rect.width - newCropArea.width);
        break;
        
      case 'sw': // 왼쪽 아래 모서리
        newCropArea.x = Math.max(0, cropStart.x + dx);
        newCropArea.width = Math.max(minSize, cropStart.width - dx);
        newCropArea.height = Math.max(minSize, cropStart.height + dy);
        newCropArea.y = Math.min(newCropArea.y, rect.height - newCropArea.height);
        break;
        
      case 'se': // 오른쪽 아래 모서리
        newCropArea.width = Math.max(minSize, Math.min(cropStart.width + dx, rect.width - cropStart.x));
        newCropArea.height = Math.max(minSize, Math.min(cropStart.height + dy, rect.height - cropStart.y));
        break;
        
      case 'n': // 위쪽 가장자리
        newCropArea.y = Math.max(0, cropStart.y + dy);
        newCropArea.height = Math.max(minSize, cropStart.height - dy);
        break;
        
      case 's': // 아래쪽 가장자리
        newCropArea.height = Math.max(minSize, Math.min(cropStart.height + dy, rect.height - cropStart.y));
        break;
        
      case 'w': // 왼쪽 가장자리
        newCropArea.x = Math.max(0, cropStart.x + dx);
        newCropArea.width = Math.max(minSize, cropStart.width - dx);
        break;
        
      case 'e': // 오른쪽 가장자리
        newCropArea.width = Math.max(minSize, Math.min(cropStart.width + dx, rect.width - cropStart.x));
        break;
    }
    
    // 경계 체크
    if (newCropArea.x + newCropArea.width > rect.width) {
      newCropArea.width = rect.width - newCropArea.x;
    }
    if (newCropArea.y + newCropArea.height > rect.height) {
      newCropArea.height = rect.height - newCropArea.y;
    }
    
    setCropArea(newCropArea);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // 크롭된 이미지 생성
  const applyCrop = () => {
    if (!capturedImage || !cropCanvasRef.current || !cropImageRef.current || !cropContainerRef.current) {
      console.error('크롭 실패: 필요한 요소가 없습니다');
      return;
    }

    const img = cropImageRef.current;
    const canvas = cropCanvasRef.current;
    const ctx = canvas.getContext('2d');
    const container = cropContainerRef.current;

    if (!ctx) {
      console.error('크롭 실패: Canvas context를 가져올 수 없습니다');
      return;
    }

    // 이미지가 완전히 로드되었는지 확인
    if (!img.complete || img.naturalWidth === 0 || img.naturalHeight === 0) {
      console.error('크롭 실패: 이미지가 아직 로드되지 않았습니다');
      return;
    }

    // 실제 이미지 크기
    const imgWidth = img.naturalWidth;
    const imgHeight = img.naturalHeight;

    // 실제 이미지 크기와 디스플레이 크기 비율 계산
    const imgAspect = imgWidth / imgHeight;
    const containerRect = container.getBoundingClientRect();
    const containerAspect = containerRect.width / containerRect.height;
    
    let displayWidth, displayHeight;
    let offsetX = 0;
    let offsetY = 0;
    
    if (imgAspect > containerAspect) {
      // 이미지가 가로로 더 길 때 (좌우 여백)
      displayWidth = containerRect.width;
      displayHeight = containerRect.width / imgAspect;
      offsetX = 0;
      offsetY = (containerRect.height - displayHeight) / 2;
    } else {
      // 이미지가 세로로 더 길 때 (상하 여백)
      displayHeight = containerRect.height;
      displayWidth = containerRect.height * imgAspect;
      offsetX = (containerRect.width - displayWidth) / 2;
      offsetY = 0;
    }

    // 크롭 영역을 실제 이미지 좌표로 변환 (오프셋 고려)
    const scaleX = imgWidth / displayWidth;
    const scaleY = imgHeight / displayHeight;
    
    // 크롭 영역에서 오프셋을 빼서 실제 이미지 영역 기준으로 변환
    const cropX = Math.max(0, (cropArea.x - offsetX) * scaleX);
    const cropY = Math.max(0, (cropArea.y - offsetY) * scaleY);
    const cropWidth = Math.min(imgWidth - cropX, cropArea.width * scaleX);
    const cropHeight = Math.min(imgHeight - cropY, cropArea.height * scaleY);

    // 크롭 영역 유효성 확인
    if (cropWidth <= 0 || cropHeight <= 0) {
      console.error('크롭 실패: 크롭 영역이 유효하지 않습니다', { cropX, cropY, cropWidth, cropHeight });
      return;
    }

    console.log('크롭 정보:', {
      원본이미지: { width: imgWidth, height: imgHeight },
      디스플레이: { width: displayWidth, height: displayHeight, offsetX, offsetY },
      크롭영역: { x: cropArea.x, y: cropArea.y, width: cropArea.width, height: cropArea.height },
      변환된크롭: { cropX, cropY, cropWidth, cropHeight },
      스케일: { scaleX, scaleY }
    });

    // 크롭된 영역만큼 캔버스 설정
    canvas.width = cropWidth;
    canvas.height = cropHeight;

    // 이미지의 크롭된 부분을 캔버스에 그리기
    ctx.drawImage(
      img,
      cropX, cropY, cropWidth, cropHeight,
      0, 0, cropWidth, cropHeight
    );

    // 크롭된 이미지를 데이터 URL로 변환
    const croppedImageDataUrl = canvas.toDataURL('image/jpeg', 0.9);
    
    console.log('크롭된 이미지 생성 완료:', croppedImageDataUrl.substring(0, 50) + '...', `크기: ${cropWidth}x${cropHeight}`);
    
    // 크롭된 이미지를 미리보기로 설정하고 크롭 모드 종료
    setCroppedImagePreview(croppedImageDataUrl);
    setIsCropping(false);
  };
  
  // 크롭된 이미지 확인 및 전달
  const confirmCroppedImage = () => {
    if (croppedImagePreview) {
      // 크롭된 이미지를 전달하고 모달 닫기
      onCapture(croppedImagePreview);
      // 상태 초기화 및 모달 닫기
      setCapturedImage(null);
      setCroppedImagePreview(null);
      onClose();
    }
  };
  
  // 크롭 미리보기 취소하고 다시 크롭 모드로
  const cancelPreview = () => {
    setCroppedImagePreview(null);
    setIsCropping(true);
  };

  const cancelCrop = () => {
    setCapturedImage(null);
    setIsCropping(false);
    setCroppedImagePreview(null);
    startCamera();
  };

  const switchCamera = () => {
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
  };

  if (!isOpen) return null;

  // 크롭 미리보기 모드
  if (croppedImagePreview) {
    return (
      <div className="fixed inset-0 bg-black z-[100] flex flex-col">
        {/* 상단 바 */}
        <div className="flex justify-between items-center p-4 bg-black/50 backdrop-blur-sm z-10">
          <button
            onClick={cancelPreview}
            className="px-4 py-2 text-white font-semibold"
          >
            ← 다시 크롭
          </button>
          <h2 className="text-white font-semibold text-lg">크롭된 이미지</h2>
          <div className="w-20"></div> {/* 공간 균형 */}
        </div>

        {/* 크롭된 이미지 미리보기 */}
        <div className="flex-1 flex items-center justify-center bg-gray-900 overflow-hidden">
          <img
            src={croppedImagePreview}
            alt="크롭된 이미지"
            className="max-w-full max-h-full object-contain"
          />
        </div>

        {/* 하단 버튼 */}
        <div className="p-6 bg-black/50 backdrop-blur-sm">
          <div className="flex gap-3">
            <button
              onClick={cancelPreview}
              className="flex-1 px-6 py-4 rounded-xl bg-gray-600 hover:bg-gray-700 text-white font-semibold text-lg transition-all"
            >
              다시 크롭
            </button>
            <button
              onClick={confirmCroppedImage}
              className="flex-1 px-6 py-4 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white font-semibold text-lg shadow-lg hover:shadow-xl transition-all"
            >
              확인
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 크롭 모드
  if (isCropping && capturedImage) {
    return (
      <div 
        className="fixed inset-0 bg-black z-[100] flex flex-col"
        style={{ touchAction: 'none' }}
        onTouchStart={(e) => {
          // 모달 배경의 터치 이벤트 방지
          e.stopPropagation();
        }}
        onTouchMove={(e) => {
          // 모달 배경의 터치 이벤트 방지
          e.stopPropagation();
        }}
      >
        {/* 상단 바 */}
        <div className="flex justify-between items-center p-4 bg-black/50 backdrop-blur-sm z-10">
          <button
            onClick={cancelCrop}
            className="px-4 py-2 text-white font-semibold"
          >
            ✕ 취소
          </button>
          <h2 className="text-white font-semibold text-lg">영역 선택</h2>
          <div className="w-16"></div> {/* 공간 균형 */}
        </div>

        {/* 이미지 크롭 영역 */}
        <div 
          ref={cropContainerRef}
          className="flex-1 relative overflow-hidden flex items-center justify-center bg-gray-900"
          style={{ touchAction: 'none' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const touch = e.touches[0];
            if (!cropContainerRef.current) return;
            const rect = cropContainerRef.current.getBoundingClientRect();
            const x = touch.clientX - rect.left;
            const y = touch.clientY - rect.top;
            
            const type = getDragType(x, y);
            setIsDragging(true);
            setDragType(type);
            setDragStart({ x, y });
            setCropStart({ ...cropArea });
          }}
          onTouchMove={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!isDragging || !cropContainerRef.current) return;
            const touch = e.touches[0];
            const rect = cropContainerRef.current.getBoundingClientRect();
            const currentX = touch.clientX - rect.left;
            const currentY = touch.clientY - rect.top;
            
            const dx = currentX - dragStart.x;
            const dy = currentY - dragStart.y;
            
            const minSize = 50;
            let newCropArea = { ...cropStart };
            
            switch (dragType) {
              case 'move':
                newCropArea.x = Math.max(0, Math.min(cropStart.x + dx, rect.width - cropStart.width));
                newCropArea.y = Math.max(0, Math.min(cropStart.y + dy, rect.height - cropStart.height));
                break;
              case 'nw':
                newCropArea.x = Math.max(0, cropStart.x + dx);
                newCropArea.y = Math.max(0, cropStart.y + dy);
                newCropArea.width = Math.max(minSize, cropStart.width - dx);
                newCropArea.height = Math.max(minSize, cropStart.height - dy);
                break;
              case 'ne':
                newCropArea.y = Math.max(0, cropStart.y + dy);
                newCropArea.width = Math.max(minSize, cropStart.width + dx);
                newCropArea.height = Math.max(minSize, cropStart.height - dy);
                newCropArea.x = Math.min(newCropArea.x, rect.width - newCropArea.width);
                break;
              case 'sw':
                newCropArea.x = Math.max(0, cropStart.x + dx);
                newCropArea.width = Math.max(minSize, cropStart.width - dx);
                newCropArea.height = Math.max(minSize, cropStart.height + dy);
                newCropArea.y = Math.min(newCropArea.y, rect.height - newCropArea.height);
                break;
              case 'se':
                newCropArea.width = Math.max(minSize, Math.min(cropStart.width + dx, rect.width - cropStart.x));
                newCropArea.height = Math.max(minSize, Math.min(cropStart.height + dy, rect.height - cropStart.y));
                break;
              case 'n':
                newCropArea.y = Math.max(0, cropStart.y + dy);
                newCropArea.height = Math.max(minSize, cropStart.height - dy);
                break;
              case 's':
                newCropArea.height = Math.max(minSize, Math.min(cropStart.height + dy, rect.height - cropStart.y));
                break;
              case 'w':
                newCropArea.x = Math.max(0, cropStart.x + dx);
                newCropArea.width = Math.max(minSize, cropStart.width - dx);
                break;
              case 'e':
                newCropArea.width = Math.max(minSize, Math.min(cropStart.width + dx, rect.width - cropStart.x));
                break;
            }
            
            if (newCropArea.x + newCropArea.width > rect.width) {
              newCropArea.width = rect.width - newCropArea.x;
            }
            if (newCropArea.y + newCropArea.height > rect.height) {
              newCropArea.height = rect.height - newCropArea.y;
            }
            
            setCropArea(newCropArea);
          }}
          onTouchEnd={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleMouseUp();
          }}
        >
          <img
            ref={cropImageRef}
            src={capturedImage}
            alt="촬영된 사진"
            className="max-w-full max-h-full select-none"
            draggable={false}
            style={{ userSelect: 'none' }}
          />
          
          {/* 크롭 영역 표시 */}
          <div
            className="absolute border-blue-500 shadow-lg cursor-move"
            style={{
              left: `${cropArea.x}px`,
              top: `${cropArea.y}px`,
              width: `${cropArea.width}px`,
              height: `${cropArea.height}px`,
              touchAction: 'none',
              border: '1px solid rgb(59 130 246)',
              boxSizing: 'border-box',
            }}
          >
            {/* 모서리 핸들 */}
            <div 
              className="absolute bg-blue-500 rounded-full border-2 border-white cursor-nw-resize"
              style={{
                top: `${-HANDLE_SIZE/2}px`,
                left: `${-HANDLE_SIZE/2}px`,
                width: `${HANDLE_SIZE}px`,
                height: `${HANDLE_SIZE}px`,
              }}
              title="크기 조절 (왼쪽 위)"
            ></div>
            <div 
              className="absolute bg-blue-500 rounded-full border-2 border-white cursor-ne-resize"
              style={{
                top: `${-HANDLE_SIZE/2}px`,
                right: `${-HANDLE_SIZE/2}px`,
                width: `${HANDLE_SIZE}px`,
                height: `${HANDLE_SIZE}px`,
              }}
              title="크기 조절 (오른쪽 위)"
            ></div>
            <div 
              className="absolute bg-blue-500 rounded-full border-2 border-white cursor-sw-resize"
              style={{
                bottom: `${-HANDLE_SIZE/2}px`,
                left: `${-HANDLE_SIZE/2}px`,
                width: `${HANDLE_SIZE}px`,
                height: `${HANDLE_SIZE}px`,
              }}
              title="크기 조절 (왼쪽 아래)"
            ></div>
            <div 
              className="absolute bg-blue-500 rounded-full border-2 border-white cursor-se-resize"
              style={{
                bottom: `${-HANDLE_SIZE/2}px`,
                right: `${-HANDLE_SIZE/2}px`,
                width: `${HANDLE_SIZE}px`,
                height: `${HANDLE_SIZE}px`,
              }}
              title="크기 조절 (오른쪽 아래)"
            ></div>
          </div>
          
          {/* 어두운 오버레이 */}
          <div className="absolute inset-0 pointer-events-none">
            <div 
              className="absolute bg-black/60"
              style={{
                top: 0,
                left: 0,
                right: 0,
                height: `${cropArea.y}px`,
              }}
            />
            <div 
              className="absolute bg-black/60"
              style={{
                top: `${cropArea.y}px`,
                left: 0,
                width: `${cropArea.x}px`,
                height: `${cropArea.height}px`,
              }}
            />
            <div 
              className="absolute bg-black/60"
              style={{
                top: `${cropArea.y}px`,
                left: `${cropArea.x + cropArea.width}px`,
                right: 0,
                height: `${cropArea.height}px`,
              }}
            />
            <div 
              className="absolute bg-black/60"
              style={{
                top: `${cropArea.y + cropArea.height}px`,
                left: 0,
                right: 0,
                bottom: 0,
              }}
            />
          </div>
        </div>

        {/* 완료 버튼 */}
        <div className="p-6 bg-black/50 backdrop-blur-sm">
          <button
            onClick={applyCrop}
            className="w-full px-6 py-4 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white font-semibold text-lg shadow-lg hover:shadow-xl transition-all"
          >
            완료
          </button>
        </div>

        {/* 숨겨진 캔버스 (크롭 처리용) */}
        <canvas ref={cropCanvasRef} className="hidden" />
      </div>
    );
  }

  // 촬영 모드
  return (
    <div className="fixed inset-0 bg-black z-[100] flex flex-col">
      {/* 상단 바 */}
      <div className="flex justify-between items-center p-4 bg-black/50 backdrop-blur-sm z-10">
        <button
          onClick={onClose}
          className="px-4 py-2 text-white font-semibold"
        >
          ✕ 닫기
        </button>
        <h2 className="text-white font-semibold text-lg">사진 촬영</h2>
        <button
          onClick={switchCamera}
          className="px-4 py-2 text-white font-semibold"
          title="카메라 전환"
        >
          🔄 전환
        </button>
      </div>

      {/* 비디오 영역 */}
      <div className="flex-1 relative overflow-hidden">
        {error ? (
          <div className="flex items-center justify-center h-full bg-gray-900">
            <div className="text-center text-white p-6">
              <p className="text-xl mb-4">⚠️</p>
              <p className="mb-4">{error}</p>
              <button
                onClick={startCamera}
                className="px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-semibold"
              >
                다시 시도
              </button>
            </div>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            {/* 촬영 영역 가이드 (선택사항) */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="border-2 border-white/50 rounded-lg w-[90%] aspect-[3/4] max-w-md"></div>
            </div>
          </>
        )}
      </div>

      {/* 하단 컨트롤 */}
      {!error && (
        <div className="p-6 bg-black/50 backdrop-blur-sm">
          <div className="flex justify-center">
            <button
              onClick={capturePhoto}
              className="w-20 h-20 rounded-full bg-white border-4 border-gray-300 shadow-lg active:scale-95 transition-transform flex items-center justify-center"
              aria-label="사진 촬영"
            >
              <div className="w-16 h-16 rounded-full bg-white border-2 border-gray-400"></div>
            </button>
          </div>
        </div>
      )}

      {/* 숨겨진 캔버스 (이미지 캡처용) */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}

