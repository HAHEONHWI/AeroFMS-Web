# AeroFMS Connector

PC에서 실행되는 작은 브리지 프로그램입니다. 비행 시뮬레이터의 항공기 상태를 AeroFMS(웹/Android)로 보내고, AeroFMS에서 만든 비행계획을 시뮬레이터용 파일로 내보냅니다.

```
MSFS (SimConnect) ─┐
X-Plane (UDP RREF) ─┼─ AeroFMS Connector ── ws://<PC IP>:8787/aerofms/ws ── AeroFMS Web / Android
Demo flight ────────┘        (HTTP GET /aerofms/info, mDNS _aerofms._tcp)
```

## 실행

```bash
pnpm --filter @aerofms/connector build
```

```bash
node apps/connector/dist/aerofms-connector.mjs
```

빌드 결과물 `dist/aerofms-connector.mjs`는 의존성이 포함된 단일 파일이므로 Node 20 이상만 있으면 다른 PC로 복사해 실행할 수 있습니다. 시작하면 AeroFMS에 입력할 주소(`192.168.x.x:8787`)가 표시됩니다.

| 옵션 | 기본값 | 설명 |
| --- | --- | --- |
| `--port` | 8787 | HTTP/WebSocket 포트 |
| `--bind` | 0.0.0.0 | 수신 인터페이스(같은 PC만 허용하려면 `127.0.0.1`) |
| `--xplane-host` / `--xplane-port` | 127.0.0.1 / 49000 | X-Plane UDP 주소 |
| `--xplane-fms-dir` | — | 비행계획 수신 시 `AEROFMS.fms`를 기록할 폴더(X-Plane `Output/FMS plans`) |
| `--msfs-host` / `--msfs-port` | 로컬 / 500 | 원격 SimConnect(TCP). 생략하면 같은 PC의 MSFS 자동 감지 |
| `--msfs-pln-dir` | — | 비행계획 수신 시 `AEROFMS.PLN`을 기록할 폴더 |
| `--no-xplane`, `--no-msfs`, `--no-demo`, `--no-mdns` | — | 해당 기능 비활성화 |
| `--demo-speed` | 1 | 데모 비행 배속(1–16) |

### 시뮬레이터별 준비

- **X-Plane 11/12**: 추가 설정 없이 UDP 49000 포트로 데이터 구독(RREF)을 요청합니다. 다른 PC의 X-Plane이면 `--xplane-host`를 지정하고 방화벽에서 UDP를 허용하세요.
- **MSFS 2020/2024**: MSFS를 실행하면 SimConnect 연결을 자동으로 재시도합니다(5초 간격). 다른 PC의 MSFS는 해당 PC의 `SimConnect.xml`에 TCP 포트를 열고 `--msfs-host`를 지정합니다.
- **Demo flight**: 시뮬레이터 없이 테스트할 때 사용합니다. AeroFMS에서 비행계획을 보내면 그 경로를 따라 이륙·상승·순항·강하를 재현합니다.

## 프로토콜 (v1)

JSON 텍스트 프레임, 정의는 `packages/simulation/src/connector/protocol.ts`.

클라이언트 → Connector

| type | 내용 |
| --- | --- |
| `HELLO` | `{ protocol: 1, client: 'web' \| 'android' }` — 반드시 첫 메시지 |
| `SELECT_SIMULATOR` | `{ id }` — `msfs`, `xplane`, `demo` |
| `SET_FLIGHT_PLAN` | `{ plan }` — 파일 내보내기와 데모 비행에 사용 |
| `REQUEST_FLIGHT_PLAN` | 마지막으로 받은 비행계획 요청 |
| `PING` | `{ t }` |

Connector → 클라이언트

| type | 내용 |
| --- | --- |
| `WELCOME` | `{ protocol, info, activeSimulator? }` |
| `STATUS` | `{ status: CONNECTED \| WAITING_FOR_SIM \| …, simulator?, message? }` |
| `AIRCRAFT_STATE` | `{ state: { lat, lon, altitudeFt, headingTrue, trackTrue, groundSpeedKt, trueAirspeedKt, indicatedAirspeedKt, verticalSpeedFpm, onGround, fuelKg? }, t }` (클라이언트당 최대 10 Hz) |
| `FLIGHT_PLAN` | `{ plan }` |
| `PONG` | `{ t }` |
| `ERROR` | `{ code, message }` — `HELLO_REQUIRED`, `PROTOCOL`, `BAD_MESSAGE`, `UNKNOWN_SIMULATOR`, `FLIGHT_PLAN` |

모든 메시지는 양쪽에서 스키마 검증 후 사용되며, 프레임 크기는 2 MB로 제한됩니다.

## 보안 고려 사항

- Connector는 인증 없이 LAN에서 접속을 받습니다. 신뢰할 수 있는 네트워크에서만 실행하고, 공용 Wi-Fi에서는 `--bind 127.0.0.1`을 사용하세요.
- Connector는 시뮬레이터 상태를 읽고 지정한 폴더에 비행계획 파일만 씁니다. 시뮬레이터를 조종하거나 임의 파일에 접근하지 않습니다.
- HTTPS로 배포된 웹 앱은 브라우저 정책상 `ws://localhost`(같은 PC)에만 연결할 수 있습니다.
