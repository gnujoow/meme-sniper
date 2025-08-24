# Twitter Crypto Monitor & Auto-Buyer

특정 Twitter 사용자의 트윗을 모니터링하여 Solana 및 BSC 토큰 주소를 감지하고 자동으로 구매하는 도구입니다.

## 기능

- 🔍 실시간 트윗 모니터링
- 🟣 Solana 토큰 주소 감지 (Base58 형식)
- 🟡 BSC/Ethereum 주소 감지 (0x 형식)
- 🔑 암호화폐 관련 키워드 감지
- 🚀 **자동 토큰 구매 기능**
  - Solana: Pump.fun, Raydium에서 자동 구매
  - BSC: PancakeSwap에서 자동 구매
- 💰 정수 단위 구매 (예: 3.7 SOL → 3 SOL 사용)
- 🔔 Webhook 알림 지원
- 🍪 쿠키 기반 인증 지원

## 설치

```bash
npm install
```

## 설정

1. `.env.example` 파일을 `.env`로 복사:
```bash
cp .env.example .env
```

2. `.env` 파일 편집:
```env
# Twitter 인증
TWITTER_USERNAME=your_twitter_username
TWITTER_PASSWORD=your_twitter_password

# 모니터링 설정
TARGET_USERNAME=target_twitter_username
CHECK_INTERVAL=30000

# 선택사항: 감시할 키워드
WATCH_KEYWORDS=pump,launch,token,contract,mint

# 선택사항: 알림용 Webhook URL
WEBHOOK_URL=https://your-webhook-url

# 지갑 설정 (자동 구매용)
SOLANA_PRIVATE_KEY=your_solana_private_key_base58
BSC_PRIVATE_KEY=your_bsc_private_key_hex

# 자동 구매 설정
AUTO_BUY_ENABLED=true
MAX_BUY_AMOUNT_SOL=10
MAX_BUY_AMOUNT_BNB=5
```

## 실행

```bash
npm start
```

개발 모드 (파일 변경 감지):
```bash
npm run dev
```

## 주소 형식

### Solana 주소
- Base58 인코딩
- 32-44 문자 길이
- 예: `DezXAZ8z7PnrnRJjz3wXBoZgFJgjKyx6mjGgpHyQJCW2`

### BSC/Ethereum 주소
- 0x로 시작
- 40개의 16진수 문자
- 예: `0x742d35Cc6634C0532925a3b844Bc8e7E5313A7bE`

## 감지 키워드

- pump, launch, token, contract
- mint/minting/minted
- deploy/deploying/deployed
- live, CA (Contract Address)
- SOL, BSC
- airdrop, presale, liquidity, DEX

## 정규표현식 패턴

### Solana
```javascript
/\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g
```

### BSC/Ethereum
```javascript
/\b0x[a-fA-F0-9]{40}\b/g
```

## 자동 구매 기능

토큰이 감지되면:
1. **Solana 토큰**: Pump.fun → Raydium 순서로 확인 후 구매
2. **BSC 토큰**: PancakeSwap에서 구매
3. **구매 금액**: 지갑 잔액의 정수 부분만 사용 (예: 3.7 SOL → 3 SOL)

## 보안 주의사항

- ⚠️ **Private Key는 절대 공유하지 마세요**
- `.env` 파일은 `.gitignore`에 포함되어 있습니다
- 테스트넷에서 먼저 테스트하는 것을 권장합니다
- `AUTO_BUY_ENABLED=false`로 설정하여 모니터링만 할 수 있습니다

## 주의사항

- Twitter 로그인 정보가 필요합니다
- Rate limiting을 피하기 위해 적절한 CHECK_INTERVAL을 설정하세요
- 쿠키를 저장하여 재로그인을 방지할 수 있습니다
- 자동 구매는 높은 위험을 수반합니다. 신중하게 사용하세요
- 가스비와 슬리피지를 고려하여 충분한 잔액을 유지하세요