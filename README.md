# AeroFMS Web — FMC & MCDU Simulator

여러 기종의 FMC(Boeing)와 MCDU(Airbus)를 실제 상태 엔진 위에서 조작하며 배우는 비행 시뮬레이션·교육용 웹 앱입니다.
Android 앱은 별도 저장소 **AeroFMS-Android**에 있으며 이 저장소의 공유 패키지를 그대로 사용합니다.

> AeroFMS는 교육·시뮬레이션 전용입니다. 실제 항공기 운항이나 비행 계획에 사용하지 마십시오.
> 내장 항법 데이터는 데모용이며 실제 AIRAC 데이터가 아닙니다.

*English summary: AeroFMS is an offline-first, multi-aircraft FMC/MCDU simulator (B737-800, 737 MAX 8, 777-300ER, 787-9, A320ceo/neo, A330-900, A350-900) with guided lessons, scenarios, replay, a built-in flight simulation and a local connector for MSFS / X-Plane. For training and entertainment only — not for real-world navigation.*

## 주요 기능

- **8개 기종**: B737-800, B737 MAX 8, B777-300ER, B787-9, A320ceo, A320neo, A330-900, A350-900
- **실제 상태 엔진**: 모든 키 입력은 순수 reducer(`reduceFmsAction`)를 통과합니다. Boeing ACT/MOD/EXEC, Airbus TMPY/INSERT/ERASE, 불연속, 직항, 홀드, 오프셋, SID/STAR/접근, VNAV(TOC/TOD/스텝), LNAV 시퀀싱
- **Classic / Modern 뷰**: 같은 상태를 CDU 화면 또는 폼 형태로 조작
- **Explain 모드**: 화면의 필드를 눌러 용어집 설명 보기
- **Academy**: 단계별 가이드 레슨, 실수 분석(Mistake Analyzer), 힌트
- **시나리오**: 내장 시나리오, 시나리오 빌더, 공유 코드, 강사 모드
- **타임라인·리플레이**: 이벤트 소싱 기반, 체크포인트를 이용한 빠른 탐색
- **내장 비행 시뮬레이션** 및 **Connector**(MSFS SimConnect / X-Plane UDP) 연동
- **MapLibre 지도**, 오프라인 우선(PWA + SQLite/IndexedDB), 한국어/영어
- **Firebase(선택)**: 로그인, 클라우드 동기화, 시나리오 공유, Remote Config, Analytics(비행계획 데이터 미수집), 계정 삭제

## 저장소 구조

```
apps/
  web/          React 19 + Vite + Tailwind v4 웹 앱 (PWA)
  connector/    PC용 AeroFMS Connector (Node, WebSocket ⇄ MSFS/X-Plane)
packages/
  shared/       공용 타입, 지오메트리, SQL 드라이버 인터페이스, 수익화 정책
  navigation/   항법 DB(데모 데이터셋), 검색, 절차
  core/         FMS 상태 엔진, 비행계획, VNAV/LNAV, 영속화, 리플레이
  aircraft/     Boeing/Airbus 어댑터, 페이지 정의, 성능 모델
  simulation/   내장 비행 시뮬레이터, Connector 프로토콜/클라이언트
  training/     레슨, 시나리오, 조건 DSL, 실수 분석, 용어집
  i18n/         ko/en 리소스
  ui/           디자인 토큰
  cloud/        Firebase 동기화, 시나리오 클라우드, Remote Config, Analytics 정제
firebase/       Firestore 규칙, 인덱스, Remote Config, (선택) Cloud Functions, 규칙 테스트
scripts/        i18n 검사, 아이콘 생성
docs/           아키텍처 및 확장 가이드
```

## 시작하기

요구 사항: Node 20 이상(22 권장), pnpm 10 (`corepack enable`).

```bash
pnpm install
```

```bash
pnpm dev
```

개발 서버는 http://localhost:5173 (포트가 사용 중이면 Vite가 다음 포트를 선택)에서 열립니다. Firebase 설정 없이도 에뮬레이터·레슨·시나리오·리플레이가 모두 오프라인으로 동작합니다.

### 검증

```bash
pnpm verify
```

`typecheck → lint → test → check:i18n → build`를 순서대로 실행합니다. 개별 명령: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm check:i18n`, `pnpm build`.

## 환경 변수

`apps/web/.env.example`를 `apps/web/.env.local`로 복사해 채웁니다. 모든 값은 선택 사항이며, 비워 두면 클라우드 기능만 비활성화됩니다.

| 변수 | 설명 |
| --- | --- |
| `VITE_FIREBASE_*` | Firebase 웹 클라이언트 설정(공개 식별자) |
| `VITE_APPCHECK_RECAPTCHA_KEY` | App Check(reCAPTCHA Enterprise) 사이트 키 |
| `VITE_FIREBASE_USE_EMULATORS` | 로컬 Firebase 에뮬레이터 사용 |
| `VITE_PLAY_STORE_URL` | Android 앱 Play Store 주소(`/download` 페이지에 표시) |
| `VITE_ENABLE_DEBUG_TOOLS` | 프로덕션 빌드에서 개발 도구 표시(공개 배포에서는 사용 금지) |

## Netlify 배포

운영 주소: **https://aerofms.netlify.app** (사이트 이름 `aerofms`, 팀 `heonhwi`)

`netlify.toml`에 빌드 명령, SPA 리다이렉트, 보안 헤더(CSP 포함)가 정의되어 있습니다. Netlify 사이트 환경 변수에 `VITE_FIREBASE_*`가 등록되어 있습니다.

- **GitHub 연동 자동 배포(권장)**: Netlify → Site configuration → Build & deploy → Link repository에서 `HAHEONHWI/AreoFMS-Web`을 연결하면 `main` 푸시마다 `netlify.toml` 기준으로 빌드·배포됩니다(비공개 저장소라 Netlify GitHub 앱 권한 승인이 필요).
- **CLI 수동 배포**: 모노레포 감지를 피하려고 빌드 결과와 `netlify.toml`만 담은 폴더에서 배포합니다.

```bash
pnpm --filter @aerofms/web build
```

```bash
mkdir -p /tmp/aerofms-deploy && rm -rf /tmp/aerofms-deploy/* && cp -R apps/web/dist /tmp/aerofms-deploy/dist && sed 's#publish = "apps/web/dist"#publish = "dist"#' netlify.toml > /tmp/aerofms-deploy/netlify.toml
```

```bash
cd /tmp/aerofms-deploy && netlify deploy --prod --dir dist --site 8f1adbee-4b1a-42ab-8498-e0acd15327d4 --no-build
```

Connector는 `ws://localhost`로 접속하므로 HTTPS 사이트에서는 같은 PC의 Connector에만 연결됩니다(LAN의 다른 PC는 Android 앱 또는 로컬 실행 웹 앱 사용).

## Firebase

프로젝트: **`aerofms-app`** (Firestore: `asia-northeast3` 서울, 무료 Spark 플랜으로 동작)

모든 클라이언트 기능(로그인, 동기화, 시나리오 공유 코드, 클라우드 리플레이, 계정 삭제)은 Firestore와 보안 규칙만으로 동작하며 Cloud Functions·Cloud Storage가 필요 없습니다.

```bash
cd firebase && firebase deploy --only firestore,remoteconfig
```

- `.firebaserc`의 기본 프로젝트가 `aerofms-app`입니다.
- 클라이언트 설정: 웹은 `apps/web/.env.local`, Android는 `.env` (`.env.example` 참고, Git 제외).
- **콘솔에서 한 번 해야 하는 일**: Authentication → 시작하기 → 이메일/비밀번호, Google 사용 설정 → 승인된 도메인에 `aerofms.netlify.app` 추가. Google 사용 설정 후 생성되는 "웹 클라이언트 ID"를 Android `.env`의 `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`에 넣으면 Android Google 로그인이 켜집니다.
- **선택(Blaze 요금제)**: `firebase/functions`에는 관리자용 `setUserRole`(교관 권한 부여)과 콘솔에서 사용자를 지웠을 때 데이터를 정리하는 `onUserDeleted`가 있습니다. Blaze로 전환한 경우에만 `firebase deploy --only functions`.
- 규칙 테스트(Java 21 필요):

```bash
cd firebase/rules-tests && npm install && npm test
```

## Connector (MSFS / X-Plane)

```bash
pnpm --filter @aerofms/connector build
```

```bash
node apps/connector/dist/aerofms-connector.mjs --help
```

자세한 내용은 [docs/CONNECTOR.md](docs/CONNECTOR.md)를 참고하세요.

## Android 공유 패키지

Android 저장소는 이 저장소의 `packages/*`를 `scripts/sync-shared.mjs`로 복사(vendoring)해 사용합니다. 공유 패키지를 수정한 뒤 Android 저장소에서 `npm run sync:shared`를 실행하세요.

## 문서

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — 상태 엔진, 영속화, 리플레이 구조
- [docs/ADDING_AIRCRAFT.md](docs/ADDING_AIRCRAFT.md) — 새 기종 추가
- [docs/ADDING_PAGE.md](docs/ADDING_PAGE.md) — 새 FMC/MCDU 페이지 추가
- [docs/CONNECTOR.md](docs/CONNECTOR.md) — Connector 프로토콜과 실행 방법

## 라이선스 및 고지

- 소스 코드 라이선스: 아직 지정되지 않았습니다(별도 고지 전까지 모든 권리 보유).
- 지도 해안선: Natural Earth(퍼블릭 도메인). 배경 타일: © OpenStreetMap contributors.
- 글꼴: IBM Plex Mono, Inter (SIL Open Font License).
- Boeing, Airbus 및 각 기종명은 해당 소유자의 상표이며, AeroFMS는 이들 회사와 관련이 없습니다.
