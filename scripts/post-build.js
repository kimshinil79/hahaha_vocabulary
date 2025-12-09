#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// Service Worker 파일을 루트와 서버 루트에 복사
const projectRoot = path.join(__dirname, '..');
const outDir = path.join(projectRoot, 'out');

// 1. firebase-messaging-sw-root.js를 firebase-messaging-sw.js로 이름 변경하여 복사
const swRootSource = path.join(projectRoot, 'public', 'firebase-messaging-sw-root.js');
const swRootDest = path.join(outDir, '..', 'firebase-messaging-sw.js'); // out 폴더 밖 (서버 루트)

if (fs.existsSync(swRootSource)) {
  try {
    fs.copyFileSync(swRootSource, swRootDest);
    console.log('✓ firebase-messaging-sw.js를 서버 루트에 복사했습니다:', swRootDest);
  } catch (error) {
    console.error('✗ Service Worker 파일 복사 실패 (서버 루트):', error.message);
  }
} else {
  console.error('✗ firebase-messaging-sw-root.js 파일을 찾을 수 없습니다:', swRootSource);
}

// 2. .htaccess 파일이 out 폴더에 있는지 확인
const htaccessSource = path.join(projectRoot, 'public', '.htaccess');
const htaccessDest = path.join(outDir, '.htaccess');

if (fs.existsSync(htaccessDest)) {
  console.log('✓ .htaccess 파일이 out 폴더에 있습니다:', htaccessDest);
} else if (fs.existsSync(htaccessSource)) {
  try {
    fs.copyFileSync(htaccessSource, htaccessDest);
    console.log('✓ .htaccess 파일을 out 폴더에 복사했습니다:', htaccessDest);
  } catch (error) {
    console.error('✗ .htaccess 파일 복사 실패:', error.message);
  }
}

console.log('\n배포 가이드:');
console.log('1. 서버 루트에 firebase-messaging-sw.js 파일 업로드');
console.log('2. out 폴더 전체를 /hahahaEnglish/ 경로에 업로드');
console.log('3. 서버에서 다음 경로로 접근 가능해야 합니다:');
console.log('   - https://alienpro.dothome.co.kr/firebase-messaging-sw.js');
console.log('   - https://alienpro.dothome.co.kr/hahahaEnglish/firebase-messaging-sw.js');

