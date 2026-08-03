#!/bin/bash
# retry-promo1-connection.sh
# Reconnects the promo1 WhatsApp instance after IP block expires.
# Schedule via cron every 30 min.

set -e

APIKEY="E21F1E96C693-4144-95FB-C83A66A548C7"
EVOLUTION_URL="http://localhost:8082"
WEBHOOK_URL="https://whatsapp.executioneveryday.com/api/v2/webhooks/evolution"

# Telegram
TELEGRAM_BOT_TOKEN=$(grep '^TELEGRAM_BOT_TOKEN=' ~/.hermes/.env | cut -d= -f2- | tr -d '"')
TELEGRAM_CHAT_ID="8605466870"

send_telegram() {
  local text="$1"
  curl -s -X POST \
    "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    -d "chat_id=${TELEGRAM_CHAT_ID}" \
    -d "text=${text}" \
    -d "parse_mode=Markdown" > /dev/null 2>&1
}

echo "[$(date +%H:%M:%S)] Starting promo1 reconnection attempt..."

# Delete existing closed instance
curl -s -X DELETE -H "apikey: $APIKEY" "${EVOLUTION_URL}/instance/delete/promo1" > /dev/null
sleep 3

# Create fresh instance
RESULT=$(curl -s -X POST -H "apikey: $APIKEY" -H "Content-Type: application/json" \
  -d '{"instanceName":"promo1","qrcode":true,"number":"212641390881","integration":"WHATSAPP-BAILEYS"}' \
  "${EVOLUTION_URL}/instance/create")

PAIRING_CODE=$(echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('qrcode',{}).get('pairingCode') or '')")
HASH=$(echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('hash') or '')")

if [ -z "$PAIRING_CODE" ]; then
  echo "ERROR: No pairing code generated"
  echo "$RESULT" | head -200
  exit 1
fi

# Set webhook
curl -s -X POST -H "apikey: $APIKEY" -H "Content-Type: application/json" \
  -d "{
    \"webhook\": {
      \"url\": \"${WEBHOOK_URL}\",
      \"webhook_by_events\": false,
      \"enabled\": true,
      \"events\": [\"MESSAGES_UPSERT\"]
    }
  }" \
  "${EVOLUTION_URL}/webhook/set/promo1" > /dev/null

echo "[$(date +%H:%M:%S)] Fresh pairing code: ${PAIRING_CODE}"

# Notify user
send_telegram "🔄 *Auto-Retry #\$((++RETRY_COUNT))*: Code \`${PAIRING_CODE}\`

📱 WhatsApp → ⋮ → Linked Devices → Link with phone number instead → enter \`${PAIRING_CODE}\`

⏳ Watching for connection..."

# Poll for 5 minutes (pairing code lifetime)
CONNECTED=false
for i in $(seq 1 60); do
  sleep 5
  STATE=$(curl -s --max-time 4 -H "apikey: $APIKEY" "${EVOLUTION_URL}/instance/connectionState/promo1" | python3 -c "import sys,json; print(json.load(sys.stdin)['instance']['state'])" 2>/dev/null)
  if [ "$STATE" = "open" ]; then
    CONNECTED=true
    break
  fi
  if [ "$STATE" = "close" ] || [ "$STATE" = "refused" ]; then
    # Check if 401 (still blocked) or other error
    DC=$(curl -s -H "apikey: $APIKEY" "${EVOLUTION_URL}/instance/fetchInstances" | python3 -c "
import sys,json
for inst in json.load(sys.stdin):
    if inst['name'] == 'promo1':
        print(inst.get('disconnectionReasonCode') or 'none')
" 2>/dev/null)
    if [ "$DC" = "401" ]; then
      echo "[$(date +%H:%M:%S)] Still blocked (401) — waiting 30 min"
      send_telegram "⏳ *Auto-Retry*: Still IP-blocked (401). Will retry in 30 min."
      exit 0
    fi
    break
  fi
done

if [ "$CONNECTED" = true ]; then
  send_telegram "✅ *WhatsApp CONNECTED!*

promo1 is online. The bot will now respond to incoming messages automatically.

🔁 Next retry cancelled — connection stable."
  exit 0
fi

send_telegram "⚠️ *Auto-Retry*: Code expired without scan. Will retry in 30 min."
