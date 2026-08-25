#!/usr/bin/env bash
# =====================================================================
# Kavis — login-with-username Edge Function smoke test
# =====================================================================
# 0000_rls_smoke_tests.sql'in tersine bu SAF SQL/psql ile YAPILAMAZ —
# login-with-username bir Deno HTTP fonksiyonu, psql'den çağrılamaz.
# Bu yüzden ayrı, curl tabanlı bir script (bkz. ana repo README'sindeki
# "Admin / Moderasyon" bölümünün aynı ayrımı).
#
# Doğruladığı üç şey:
#   1) Var olan kullanıcı adı + YANLIŞ şifre -> token dönmüyor, genel hata.
#   2) VAR OLMAYAN kullanıcı adı -> BİREBİR AYNI genel hata (kullanıcı adı
#      var/yok ayrımını dışarı sızdırmıyor).
#   3) İki durumun yanıt süresi birbirine yakın (timing-attack koruması —
#      bkz. login-with-username/index.ts'in kendi yorumları).
#
# ÇALIŞTIRMA (sadece local/staging — gerçek bir test kullanıcısı oluşturup
# sonunda delete-account ile temizler):
#   export SUPABASE_URL=...
#   export SUPABASE_ANON_KEY=...
#   ./supabase/tests/0001_login_with_username_smoke_test.sh
#
# Gereksinim: curl, jq. Test ettiği projede "confirm email" kapalı
# olmalı (local `supabase start` varsayılanı budur) — açıksa adım 1
# (signup) aktif bir session dönmez ve script erken başarısız olur.
# =====================================================================

set -euo pipefail

: "${SUPABASE_URL:?SUPABASE_URL ortam değişkeni gerekli}"
: "${SUPABASE_ANON_KEY:?SUPABASE_ANON_KEY ortam değişkeni gerekli}"

SUFFIX=$(date +%s)
TEST_USERNAME="smoketest_login_${SUFFIX}"
TEST_EMAIL="smoketest+login-${SUFFIX}@kavis.test"
TEST_PASSWORD="Sm0keTest!${SUFFIX}"
WRONG_PASSWORD="kesinlikle-yanlis-sifre"
NONEXISTENT_USERNAME="smoketest_yok_${SUFFIX}"

FAIL=0

log() { echo "[login-smoke] $*"; }
fail() {
  echo "[login-smoke] FAIL: $*" >&2
  FAIL=1
}

# --- 0) Geçici test kullanıcısı oluştur (public signup) ---
log "Test kullanıcısı oluşturuluyor: $TEST_USERNAME"
SIGNUP_RESPONSE=$(curl -s -X POST "$SUPABASE_URL/auth/v1/signup" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\",\"data\":{\"username\":\"$TEST_USERNAME\"}}")

if ! echo "$SIGNUP_RESPONSE" | jq -e '.id' >/dev/null 2>&1; then
  echo "$SIGNUP_RESPONSE"
  fail "test kullanıcısı oluşturulamadı (proje 'confirm email' açık mı? local'de kapalı olmalı)"
  exit 1
fi

call_login() {
  local username="$1" password="$2"
  curl -s -w '\n%{http_code}' -X POST "$SUPABASE_URL/functions/v1/login-with-username" \
    -H "apikey: $SUPABASE_ANON_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$username\",\"password\":\"$password\"}"
}

timed_call() {
  local username="$1" password="$2"
  local start end
  start=$(date +%s%N)
  local out
  out=$(call_login "$username" "$password")
  end=$(date +%s%N)
  echo "$out"
  echo "ELAPSED_MS:$(( (end - start) / 1000000 ))" >&2
}

# --- 1) Var olan kullanıcı, yanlış şifre ---
log "Test 1: var olan kullanıcı + yanlış şifre"
RESP1=$(timed_call "$TEST_USERNAME" "$WRONG_PASSWORD" 2>/tmp/login_smoke_t1.ms)
BODY1=$(echo "$RESP1" | head -n -1)
CODE1=$(echo "$RESP1" | tail -n1)
MS1=$(grep -o '[0-9]*' /tmp/login_smoke_t1.ms)

if echo "$BODY1" | jq -e '.access_token' >/dev/null 2>&1; then
  fail "yanlış şifreyle access_token döndü!"
fi
ERROR1=$(echo "$BODY1" | jq -r '.error // empty')
if [ -z "$ERROR1" ]; then
  fail "yanlış şifre durumunda hata mesajı yok (HTTP $CODE1, body: $BODY1)"
fi
log "  -> HTTP $CODE1, hata: \"$ERROR1\", süre: ${MS1}ms"

# --- 2) Var olmayan kullanıcı adı ---
log "Test 2: var olmayan kullanıcı adı"
RESP2=$(timed_call "$NONEXISTENT_USERNAME" "her-hangi-bir-sifre" 2>/tmp/login_smoke_t2.ms)
BODY2=$(echo "$RESP2" | head -n -1)
CODE2=$(echo "$RESP2" | tail -n1)
MS2=$(grep -o '[0-9]*' /tmp/login_smoke_t2.ms)

if echo "$BODY2" | jq -e '.access_token' >/dev/null 2>&1; then
  fail "var olmayan kullanıcı adıyla access_token döndü!"
fi
ERROR2=$(echo "$BODY2" | jq -r '.error // empty')
log "  -> HTTP $CODE2, hata: \"$ERROR2\", süre: ${MS2}ms"

# --- 3) İki hata mesajı BİREBİR AYNI olmalı (kullanıcı adı var/yok sızmasın) ---
if [ "$ERROR1" != "$ERROR2" ]; then
  fail "hata mesajları farklı! ('$ERROR1' vs '$ERROR2') — kullanıcı adının var olup olmadığı sızıyor"
else
  log "  -> hata mesajları aynı, iyi."
fi
if [ "$CODE1" != "$CODE2" ]; then
  fail "HTTP durum kodları farklı! ($CODE1 vs $CODE2)"
fi

# --- 4) Timing — sert assert değil, bilgilendirici uyarı (ağ jitter'ı) ---
DIFF_MS=$(( MS1 > MS2 ? MS1 - MS2 : MS2 - MS1 ))
log "  -> süre farkı: ${DIFF_MS}ms"
if [ "$DIFF_MS" -gt 500 ]; then
  log "  UYARI: süre farkı 500ms'yi geçti — timing-attack koruması gevşemiş olabilir, elle inceleyin."
fi

# --- 5) Mutlu yol + temizlik: doğru şifreyle giriş yap, sonra hesabı sil ---
log "Test 3 (mutlu yol): doğru şifreyle giriş"
RESP3=$(call_login "$TEST_USERNAME" "$TEST_PASSWORD")
BODY3=$(echo "$RESP3" | head -n -1)
ACCESS_TOKEN=$(echo "$BODY3" | jq -r '.access_token // empty')
if [ -z "$ACCESS_TOKEN" ]; then
  fail "doğru şifreyle bile giriş başarısız! body: $BODY3"
else
  log "  -> başarılı, temizleniyor (delete-account)..."
  curl -s -X POST "$SUPABASE_URL/functions/v1/delete-account" \
    -H "apikey: $SUPABASE_ANON_KEY" \
    -H "Authorization: Bearer $ACCESS_TOKEN" >/dev/null
fi

rm -f /tmp/login_smoke_t1.ms /tmp/login_smoke_t2.ms

if [ "$FAIL" -eq 0 ]; then
  echo "[login-smoke] === TÜM TESTLER GEÇTİ ==="
else
  echo "[login-smoke] === BAZI TESTLER BAŞARISIZ ===" >&2
  exit 1
fi
