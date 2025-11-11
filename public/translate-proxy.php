<?php
// Google Translate API 프록시 (정적 호스팅용)
// 환경 변수나 설정 파일에서 API 키를 읽어오거나, 직접 설정하세요

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Health check
if (isset($_GET['ping'])) {
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode(array('ok' => true, 'message' => 'translate proxy alive'), JSON_UNESCAPED_UNICODE);
  exit;
}

// OPTIONS 요청 처리
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
  header('Allow: POST, OPTIONS');
  http_response_code(204);
  exit;
}

// Google Translate API 키 설정
// 1. translate-config.php 파일을 생성하고 API 키를 설정하세요 (권장)
// 2. 또는 환경 변수 GOOGLE_TRANSLATE_API_KEY를 설정하세요
// 3. 또는 아래 $apiKey 변수에 직접 설정하세요 (Git에 노출되므로 비권장)

$apiKey = null;

// 설정 파일에서 읽기 시도
$configFile = __DIR__ . '/translate-config.php';
if (file_exists($configFile)) {
  $config = require $configFile;
  if (isset($config['api_key']) && $config['api_key'] !== 'YOUR_GOOGLE_TRANSLATE_API_KEY_HERE') {
    $apiKey = $config['api_key'];
  }
}

// 환경 변수에서 읽기 시도
if (!$apiKey) {
  $apiKey = getenv('GOOGLE_TRANSLATE_API_KEY');
}

// API 키가 없으면 에러
if (!$apiKey || $apiKey === 'YOUR_GOOGLE_TRANSLATE_API_KEY_HERE') {
  http_response_code(500);
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode(array(
    'error' => 'Google Translate API 키가 설정되지 않았습니다.',
    'message' => 'translate-config.php 파일을 생성하거나 환경 변수를 설정하세요.',
  ), JSON_UNESCAPED_UNICODE);
  exit;
}

// Google Translate API URL
$apiUrl = 'https://translation.googleapis.com/language/translate/v2';

// Self test: GET ?selftest=1
if (isset($_GET['selftest'])) {
  $testText = 'Hello world';
  $ch = curl_init($apiUrl . '?key=' . urlencode($apiKey));
  curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
  curl_setopt($ch, CURLOPT_POST, true);
  curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 10);
  curl_setopt($ch, CURLOPT_TIMEOUT, 30);
  curl_setopt($ch, CURLOPT_HTTPHEADER, array('Content-Type: application/json'));
  if (isset($_GET['insecure'])) {
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 0);
  }
  $testBody = json_encode(array(
    'q' => array($testText),
    'source' => 'en',
    'target' => 'ko',
    'format' => 'text',
  ), JSON_UNESCAPED_UNICODE);
  curl_setopt($ch, CURLOPT_POSTFIELDS, $testBody);
  $resp = curl_exec($ch);
  $errno = curl_errno($ch);
  $error = curl_error($ch);
  $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
  curl_close($ch);
  header('Content-Type: application/json; charset=utf-8');
  if ($errno) {
    http_response_code(502);
    echo json_encode(array('ok' => false, 'errno' => $errno, 'message' => $error), JSON_UNESCAPED_UNICODE);
  } else {
    echo json_encode(array('ok' => $status === 200, 'status' => $status, 'raw' => json_decode($resp, true)), JSON_UNESCAPED_UNICODE);
  }
  exit;
}

// 요청 본문 읽기
$raw = file_get_contents('php://input');
$payload = json_decode($raw, true);

if (!$payload || !isset($payload['text'])) {
  http_response_code(400);
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode(array('error' => '텍스트가 필요합니다.'), JSON_UNESCAPED_UNICODE);
  exit;
}

$text = $payload['text'];
$source = isset($payload['source']) ? $payload['source'] : 'en';
$target = isset($payload['target']) ? $payload['target'] : 'ko';
$insecure = false;
if (isset($_GET['insecure']) && $_GET['insecure']) {
  $insecure = true;
}
if (isset($payload['insecure']) && $payload['insecure']) {
  $insecure = true;
}

// Google Translate API 호출
$ch = curl_init($apiUrl . '?key=' . urlencode($apiKey));
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 10);
curl_setopt($ch, CURLOPT_TIMEOUT, 30);
curl_setopt($ch, CURLOPT_HTTPHEADER, array(
  'Content-Type: application/json',
));
if ($insecure) {
  curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
  curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 0);
}

$requestBody = json_encode(array(
  'q' => array($text),
  'source' => $source,
  'target' => $target,
  'format' => 'text',
), JSON_UNESCAPED_UNICODE);

curl_setopt($ch, CURLOPT_POSTFIELDS, $requestBody);

$response = curl_exec($ch);
$errno = curl_errno($ch);
$error = curl_error($ch);
$status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($errno) {
  http_response_code(502);
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode(array(
    'error' => '프록시 오류',
    'message' => $error,
  ), JSON_UNESCAPED_UNICODE);
  exit;
}

if ($status !== 200) {
  http_response_code($status);
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode(array(
    'error' => '번역 실패',
    'status' => $status,
    'details' => $response,
  ), JSON_UNESCAPED_UNICODE);
  exit;
}

// 응답 파싱
$data = json_decode($response, true);
$translated = isset($data['data']['translations'][0]['translatedText']) 
  ? $data['data']['translations'][0]['translatedText'] 
  : null;

if (!$translated) {
  http_response_code(500);
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode(array(
    'error' => '번역 결과를 찾을 수 없습니다.',
    'receivedData' => $data,
  ), JSON_UNESCAPED_UNICODE);
  exit;
}

// HTML 엔티티 디코딩
$translated = html_entity_decode($translated, ENT_QUOTES | ENT_HTML5, 'UTF-8');

http_response_code(200);
header('Content-Type: application/json; charset=utf-8');
echo json_encode(array(
  'translatedText' => trim($translated),
), JSON_UNESCAPED_UNICODE);
?>

