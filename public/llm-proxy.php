<?php
// Simple PHP proxy to call external LLM from static hosting (dothome)
// Deploy this file alongside exported Next.js files under /hahahaEnglish

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

// Basic debug logging (writes next to this file)
$__logFile = dirname(__FILE__) . '/proxy_debug.log';
$__log = function ($msg) use ($__logFile) {
    @file_put_contents($__logFile, date('c') . ' ' . $msg . "\n", FILE_APPEND);
};

// Health check (GET /llm-proxy.php?ping=1)
$requestMethod = isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : '';
if ($requestMethod === 'GET' && isset($_GET['ping'])) {
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(array('ok' => true, 'message' => 'proxy alive'));
    exit;
}

if ($requestMethod === 'OPTIONS') {
  header('Allow: POST, OPTIONS');
  http_response_code(204);
  exit;
}

// Base upstream (can be overridden by payload.endpoint)
$endpointBase = 'https://israel-semigeometrical-malignly.ngrok-free.dev';
$defaultPath = '/api/chat';  // AI server endpoint path

$raw = file_get_contents('php://input');
$requestUri = isset($_SERVER['REQUEST_URI']) ? $_SERVER['REQUEST_URI'] : '';
$rawPreview = $raw ? substr($raw, 0, 500) : '';
$__log('method=' . $requestMethod . ' uri=' . $requestUri . ' raw=' . $rawPreview);

$payload = json_decode($raw !== false ? $raw : '', true);
if (!is_array($payload)) {
  $payload = array();
}

// Optional: allow client to specify endpoint or path
$endpointFromPayload = isset($payload['endpoint']) && is_string($payload['endpoint']) ? $payload['endpoint'] : '';
$pathFromPayload = isset($payload['path']) && is_string($payload['path']) ? $payload['path'] : '';

$base = $endpointFromPayload !== '' ? $endpointFromPayload : $endpointBase;
$base = rtrim($base, '/');
$path = $pathFromPayload !== '' ? $pathFromPayload : $defaultPath;
$targetUrl = $base . '/' . ltrim($path, '/');

$headers = function_exists('getallheaders') ? getallheaders() : [];
$incomingAuth = '';
if (is_array($headers)) {
  foreach ($headers as $k => $v) {
    if (strtolower($k) === 'authorization') {
      $incomingAuth = $v;
      break;
    }
  }
}
$fallbackKey = 'your-secret-key-1';
$authHeader = $incomingAuth !== '' ? $incomingAuth : ('Bearer ' . $fallbackKey);

$ch = curl_init($targetUrl);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 10);
curl_setopt($ch, CURLOPT_TIMEOUT, 90); // 30초 -> 90초로 증가 (긴 이야기 생성 시간 고려)
$remoteAddr = isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : '0.0.0.0';
curl_setopt($ch, CURLOPT_HTTPHEADER, array(
  'Content-Type: application/json',
  'User-Agent: PHP-Proxy/1.0',
  'Authorization: ' . $authHeader,
  'X-Forwarded-For: ' . $remoteAddr,
  'ngrok-skip-browser-warning: true',  // Skip ngrok browser warning page
));

// Remove control fields before forwarding
$forwardPayload = $payload;
unset($forwardPayload['endpoint'], $forwardPayload['path']);

// Convert to AI server expected format
// If client sends simple { "message": "..." }, convert to { "messages": [{ "role": "user", "content": "..." }] }
// If client already sends proper format with "messages", use it as-is
if (empty($forwardPayload)) {
  // Default: empty payload -> use default message
  $forwardPayload = array(
    'messages' => array(
      array('role' => 'user', 'content' => '안녕')
    )
  );
} elseif (isset($forwardPayload['message']) && !isset($forwardPayload['messages'])) {
  // Convert simple "message" field to "messages" array format
  $messageContent = $forwardPayload['message'];
  unset($forwardPayload['message']);
  $forwardPayload['messages'] = array(
    array('role' => 'user', 'content' => $messageContent)
  );
} elseif (!isset($forwardPayload['messages'])) {
  // If payload exists but no "messages" field, wrap content in messages array
  $forwardPayload['messages'] = array(
    array('role' => 'user', 'content' => isset($forwardPayload['content']) ? $forwardPayload['content'] : json_encode($forwardPayload))
  );
}

$jsonBody = json_encode($forwardPayload, JSON_UNESCAPED_UNICODE);
$__log('forwarding_payload=' . $jsonBody);
curl_setopt($ch, CURLOPT_POSTFIELDS, $jsonBody);

$response = curl_exec($ch);
$errno = curl_errno($ch);
$error = curl_error($ch);
$status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$respCtype = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
curl_close($ch);

if ($errno) {
  $__log('curl_error=' . $errno . ' msg=' . $error);
  http_response_code(502);
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode(array(
    'error' => 'proxy_error',
    'message' => $error,
  ), JSON_UNESCAPED_UNICODE);
  exit;
}

$logStatus = $status ? $status : 0;
$responsePreview = $response !== false ? substr($response, 0, 200) : '';
$__log('upstream_status=' . $logStatus . ' url=' . $targetUrl . ' response_preview=' . $responsePreview);

// Parse streaming response (SSE format: data: {"content": "..."})
$outputText = '';
if ($response !== false && $response !== '') {
  $lines = explode("\n", $response);
  foreach ($lines as $line) {
    $line = trim($line);
    if (empty($line)) continue;
    
    // Handle SSE format: data: {...}
    if (preg_match('/^data:\s*(.+)$/', $line, $matches)) {
      $dataStr = $matches[1];
      
      // Check for [DONE] marker
      if ($dataStr === '[DONE]') {
        break;
      }
      
      // Try to parse JSON
      $data = json_decode($dataStr, true);
      if (is_array($data) && isset($data['content'])) {
        $outputText .= $data['content'];
      } elseif (is_array($data) && isset($data['choices'][0]['delta']['content'])) {
        // Alternative format
        $outputText .= $data['choices'][0]['delta']['content'];
      } elseif (is_array($data) && isset($data['choices'][0]['message']['content'])) {
        // Another alternative format
        $outputText .= $data['choices'][0]['message']['content'];
      }
    } elseif (!empty($line) && strpos($line, 'data:') !== 0) {
      // Not SSE format, treat as plain text
      $outputText .= $line;
    }
  }
  
  // If no content was extracted, use raw response
  if (empty($outputText)) {
    $outputText = $response;
  }
}

http_response_code($status ? $status : 200);
header('Content-Type: text/plain; charset=utf-8');
echo $outputText;
?>


