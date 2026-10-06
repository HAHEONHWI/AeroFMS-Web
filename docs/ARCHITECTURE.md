# 아키텍처

## 개요

```
          ┌──────────── apps/web (React) ─────────────┐   ┌──── AeroFMS-Android (Expo) ────┐
UI        │ CDU/Modern 뷰 · 지도 · Academy · 시나리오 │   │ 같은 화면을 React Native로 구현 │
          └──────────────┬────────────────────────────┘   └───────────────┬─────────────────┘
                         │ dispatch(action)                                │
packages  ┌──────────────▼─────────────────────────────────────────────────▼───────────────┐
          │ core: FmsEngine → reduceFmsAction(state, action, deps) → { state, events }     │
          │        ├─ aircraft adapters (Boeing FMC / Airbus FMGS, 페이지·키패드·정책)    │
          │        ├─ flightplan · vnav · lnav · validation · scratchpad                  │
          │        └─ session/persistence (SqlDriver) · events/replay                     │
          │ navigation · simulation · training · i18n · cloud · shared                     │
          └────────────────────────────────────────────────────────────────────────────────┘
Platform    Web: sql.js + IndexedDB, Firebase JS SDK        Android: expo-sqlite, Firebase JS SDK (+RNFirebase 선택)
```

## 상태 엔진

- `FmsState`(`packages/core/src/state/types.ts`)가 세션의 모든 상태(현재 페이지, 스크래치패드, 활성/수정 비행계획, 성능, 위치, 유도, 시뮬레이션)를 담습니다.
- 모든 변경은 `reduceFmsAction`(`packages/core/src/engine/reducer.ts`)을 통과하는 **순수 함수**입니다. Immer로 불변 상태를 만들고, 기종별 처리는 어댑터에 위임합니다.
- ID와 시간은 결정적입니다: `deterministicId(sessionId, counter)`와 액션에 기록된 `t`만 사용합니다. 따라서 같은 액션 목록을 재생하면 항상 같은 상태가 나옵니다(리플레이·테스트의 기반).
- 입력 오류는 `FmsEntryError`로 표현되고 어댑터의 메시지 카탈로그를 통해 스크래치패드 메시지가 됩니다.

### 비행계획 편집 정책

| | Boeing | Airbus |
| --- | --- | --- |
| 첫 활성화 전 | 직접 편집(`DIRECT`) | — |
| 활성화 후 | MOD 계획 생성 → EXEC로 확정 | 측면 수정·항로·직항·홀드·절차·오프셋은 TMPY → INSERT/ERASE |
| 구현 | `planEditPolicy()` + `planForEdit()` | 동일 |

비행계획 요소는 `LEG | DISCONTINUITY`이며 각 레그는 세그먼트(ORIGIN/DEPARTURE/ENROUTE/ARRIVAL/APPROACH/MISSED/DESTINATION)를 가집니다. 절차 교체는 `replaceSegment` 후 `repairBoundaries`로 경계 불연속을 계산합니다.

### VNAV / LNAV / 시뮬레이션

- `computeVnavProfile`이 성능 모델로 TOC/TOD/스텝, 레그별 ETA·연료를 예측합니다.
- LNAV는 활성 레그 시퀀싱과 유도(XTK, DTG)를 계산합니다.
- `StandaloneSimulator`(`packages/simulation`)가 엔진에 연결되면 같은 상태 위에서 이륙~착륙을 시뮬레이션합니다. Connector 모드에서는 외부 시뮬레이터 상태(`EXTERNAL_STATE`)가 위치를 대신합니다.

## 영속화

- 플랫폼은 `SqlDriver` 인터페이스(`packages/shared/src/sql.ts`)만 구현합니다. 웹은 sql.js(WASM) + IndexedDB 스냅샷과 탭 잠금, Android는 expo-sqlite입니다.
- 마이그레이션은 `packages/core/src/persistence/migrations.ts`에서 버전별로 관리합니다.
- `SessionManager`는 기종별 세션을 저장하고, 디바운스된 상태 스냅샷 + 액션 로그 + 주기적 체크포인트를 기록합니다. 앱이 백그라운드로 가거나 닫힐 때 즉시 flush합니다.
- 기종 전환 시 "저장 후 전환 / 저장하지 않고 전환(`discardSince`) / 취소"를 제공합니다.

## 리플레이

`ReplayController`(`packages/core/src/events/replay.ts`)는 액션 로그와 체크포인트로 임의 시점의 상태를 재구성합니다. 가장 가까운 체크포인트에서 시작해 남은 액션만 reducer로 재생하므로 긴 세션도 빠르게 탐색됩니다.

## 교육 기능

- **Condition DSL**(`packages/training/src/conditions.ts`): 원점/목적지, 절차, 경로 포함, 성능 값, 불연속 없음 등 상태 조건을 선언적으로 표현합니다.
- **LessonRunner / ScenarioRunner**: 상태 변화마다 조건을 평가해 단계 진행·점수를 계산합니다.
- **Mistake Analyzer**: 스크래치패드 오류와 상태를 분석해 원인과 해결 방법을 안내합니다.
- 시나리오 빌더는 `packages/training/src/scenarios/builder.ts`의 공용 함수를 웹·Android가 함께 사용합니다.

## 클라우드 (선택)

- `packages/cloud`: 오프라인 outbox 기반 동기화, 시나리오 공유(Cloud Function이 공유 코드 발급), Remote Config(REST), Analytics 이벤트 정제(비행계획·식별자 미수집).
- Firestore 규칙은 사용자 소유 데이터만 접근 가능하도록 제한하며 `firebase/rules-tests`로 검증합니다.
- 시나리오 공유 코드는 소유자가 `shareCodes/{code}` 문서와 시나리오 업데이트를 한 배치로 쓰며, 보안 규칙이 두 문서가 서로를 가리키는지 확인합니다.
- 계정 삭제는 클라이언트가 보안 규칙 아래에서 본인 소유 데이터(세션·진도·비행계획·리플레이·시나리오·응시 기록·프로필)를 모두 지운 뒤 Auth 계정을 삭제합니다. Cloud Functions 없이(Spark 플랜) 동작합니다.
- 클라우드 리플레이는 세션 내보내기 JSON을 Firestore 문서에 그대로 저장하고, 다른 기기에서 목록을 보고 가져와 재생합니다.

## 수익화 확장 지점

`packages/shared`의 `decideAd()` 정책과 `AdService` 인터페이스가 광고 노출 여부를 결정합니다. 기본값은 `DisabledAdService`이고 Remote Config로도 꺼져 있습니다. 에뮬레이터 조작, 훈련 중, 리플레이, 온보딩, 법적 고지 화면에서는 정책상 광고가 표시되지 않습니다. Android는 빌드 시 `AEROFMS_ENABLE_ADS=true`일 때만 Google Mobile Ads SDK를 링크합니다.
