<?php
/**
 * save.php
 * 1) Пишет в data.csv (дата; ip; контакт)
 * 2) (опционально) Пишет в Google Sheets БЕЗ composer — чистый PHP (JWT + OAuth2)
 *    Включить можно флагом GS_ENABLED, заполнив константы ниже.
 */

header('Content-Type: application/json; charset=utf-8');

// --- CORS (для тестов можно оставить *, в проде укажите домен) ---
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { exit; }

// ---------- читаем JSON из тела ----------
$payload = json_decode(file_get_contents('php://input'), true);
if (!$payload) {
  http_response_code(400);
  echo json_encode(['ok' => false, 'error' => 'no_json']);
  exit;
}

$contact = trim($payload['contact'] ?? '');
$ip      = trim($payload['ip'] ?? ($_SERVER['REMOTE_ADDR'] ?? ''));
$ts      = $payload['date'] ?? date('c');

// ---------- CSV ----------
$csvFile = __DIR__ . '/data.csv';
$newFile = !file_exists($csvFile);

$fh = @fopen($csvFile, 'a');
if ($fh === false) {
  http_response_code(500);
  echo json_encode(['ok'=>false, 'error'=>'cant_open_csv']);
  exit;
}
flock($fh, LOCK_EX);
if ($newFile) {
  fputcsv($fh, ['date', 'ip', 'contact'], ';');
}
fputcsv($fh, [$ts, $ip, $contact], ';');
flock($fh, LOCK_UN);
fclose($fh);

$result = ['ok'=>true, 'csv'=>true];

// ================= Google Sheets (чистый PHP) =================
// 1) Создайте сервисный аккаунт в Google Cloud (JSON-ключ).
// 2) Дайте этому аккаунту права «Редактировать» на вашу таблицу
//    (поделитесь таблицей на email сервисного аккаунта).
// 3) Заполните константы ниже и включите GS_ENABLED=true.
// --------------------------------------------------------------

define('GS_ENABLED', false); // <- когда будете готовы, поменяйте на true
define('GS_SPREADSHEET_ID', 'YOUR_SPREADSHEET_ID');    // пример: 1AbCdEfG...xyz
define('GS_RANGE',          'Лист1!A:C');              // куда писать (A: дата, B: ip, C: контакт)
define('GS_SA_EMAIL',       'your-sa@project.iam.gserviceaccount.com');

// Способ 1: положить полный PEM-ключ в переменную (с реальными переводами строк)
define('GS_PRIVATE_KEY', <<<PEM
-----BEGIN PRIVATE KEY-----
PASTE_YOUR_PRIVATE_KEY_WITH_REAL_NEWLINES_HERE
-----END PRIVATE KEY-----
PEM);

// Если у вас ключ в json-формате одной строкой с \n — можно так:
// define('GS_PRIVATE_KEY', str_replace("\\n", "\n", "-----BEGIN PRIVATE KEY-----\\n....\\n-----END PRIVATE KEY-----\\n"));

// --------------------------------------------------------------

if (GS_ENABLED) {
  try {
    $ok = gsheets_append_row([$ts, $ip, $contact], $err);
    $result['sheets'] = $ok;
    if (!$ok) $result['sheets_error'] = $err;
  } catch (Throwable $e) {
    $result['sheets'] = false;
    $result['sheets_error'] = $e->getMessage();
  }
}

echo json_encode($result);
exit;

// ================= вспомогательные функции =================

function gsheets_append_row(array $values, &$err = null) {
  // 1) Получаем OAuth2 access_token по JWT (RS256)
  $token = gs_get_access_token($err);
  if (!$token) return false;

  // 2) POST append values
  $url = 'https://sheets.googleapis.com/v4/spreadsheets/' .
         rawurlencode(GS_SPREADSHEET_ID) .
         '/values/' . rawurlencode(GS_RANGE) .
         ':append?valueInputOption=RAW';

  $body = json_encode(['values' => [ $values ]], JSON_UNESCAPED_UNICODE);

  [$code, $resp, $curlErr] = http_post_json($url, $body, [
    'Authorization: Bearer ' . $token,
    'Content-Type: application/json'
  ]);

  if ($code >= 200 && $code < 300) return true;

  $err = 'http '.$code.'; curl='.$curlErr.'; body='.$resp;
  return false;
}

function gs_get_access_token(&$err = null) {
  $now = time();
  $header  = b64url(json_encode(['alg'=>'RS256','typ'=>'JWT']));
  $claims  = b64url(json_encode([
    'iss'   => GS_SA_EMAIL,
    'scope' => 'https://www.googleapis.com/auth/spreadsheets',
    'aud'   => 'https://oauth2.googleapis.com/token',
    'exp'   => $now + 3600,
    'iat'   => $now
  ]));
  $toSign  = $header . '.' . $claims;

  $privateKey = openssl_pkey_get_private(GS_PRIVATE_KEY);
  if (!$privateKey) { $err = 'bad_private_key'; return null; }

  $sig = '';
  if (!openssl_sign($toSign, $sig, $privateKey, 'sha256')) {
    $err = 'openssl_sign_failed';
    return null;
  }
  $jwt = $toSign . '.' . b64url($sig);

  // exchange JWT -> access_token
  $tokenUrl = 'https://oauth2.googleapis.com/token';
  $post = http_build_query([
    'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    'assertion'  => $jwt
  ], '', '&');

  [$code, $resp, $curlErr] = http_post_form($tokenUrl, $post, [
    'Content-Type: application/x-www-form-urlencoded'
  ]);
  if ($code < 200 || $code >= 300) { $err = 'token_http_'.$code.'; '.$curlErr.'; '.$resp; return null; }

  $json = json_decode($resp, true);
  $access = $json['access_token'] ?? null;
  if (!$access) { $err = 'no_access_token_in_response'; return null; }

  return $access;
}

function b64url($data) {
  return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function http_post_json($url, $json, array $headers = []) {
  $ch = curl_init($url);
  curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
  curl_setopt($ch, CURLOPT_POST, true);
  curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
  curl_setopt($ch, CURLOPT_POSTFIELDS, $json);
  $resp = curl_exec($ch);
  $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
  $err  = $resp === false ? curl_error($ch) : null;
  curl_close($ch);
  return [$code, $resp ?: '', $err];
}

function http_post_form($url, $formBody, array $headers = []) {
  $ch = curl_init($url);
  curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
  curl_setopt($ch, CURLOPT_POST, true);
  curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
  curl_setopt($ch, CURLOPT_POSTFIELDS, $formBody);
  $resp = curl_exec($ch);
  $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
  $err  = $resp === false ? curl_error($ch) : null;
  curl_close($ch);
  return [$code, $resp ?: '', $err];
}
