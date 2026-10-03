# 새 기종 추가하기

AeroFMS의 기종은 **Aircraft Adapter**로 구현됩니다. 어댑터는 `AircraftFmsAdapter` 인터페이스(`packages/core/src/engine/adapter.ts`)를 구현하며, 대부분은 공통 동작을 제공하는 `AbstractFmsAdapter`(`packages/core/src/engine/base-adapter.ts`)를 상속합니다.

기존 FMS 계열(Boeing FMC 또는 Airbus FMGS)과 같은 시스템을 쓰는 기종이라면 **variant(파생형) 정의만 추가**하면 됩니다. 전혀 다른 FMS라면 새 어댑터 클래스를 작성합니다.

## 1. 같은 FMS 계열의 파생형 추가 (권장 경로)

예: Boeing 737-900ER 추가

1. **성능 모델** — `packages/aircraft/src/models/performance-models.ts`에 `PerformanceModel`을 추가합니다.
   중량(OEW/MZFW/MTOW/MLW), 최대 연료, 인증 고도, CI 범위, 상승/순항/강하 속도 스케줄, 상승률, 연료 소모 모델을 채웁니다.
   값은 공개 자료 수준의 근사치로 충분하며, 교육용 근사라는 점은 `fidelityNotes`로 표시합니다.

2. **Variant 정의** — `packages/aircraft/src/boeing/variants.ts`(Airbus는 `airbus/variants.ts`)에 추가합니다.

   ```ts
   export const B737_900ER: BoeingVariant = {
     definition: {
       id: 'B737-900ER',            // 세션·시나리오·레슨에서 쓰는 고유 ID (변경 금지)
       manufacturer: 'BOEING',
       family: 'B737NG',
       model: '737-900ER',
       displayName: 'Boeing 737-900ER',
       fmsType: '737 NG FMC',
       systemLabel: 'FMC / CDU',
       engine: 'CFM56-7B27',
       icaoType: 'B739',
       fidelityNotes: [...COMMON_NOTES, 'fidelity.noRte2'],
       quickStart: false,           // 홈 화면 빠른 시작에 표시할지
     },
     performanceModel: B739_PERF,
     cdu: '737',                    // 키패드·VNAV 페이지 구성
     displayStyle: 'BOEING_CDU',
     engineRatingLabel: '27K',
     opProgram: 'AEROFMS-NG-SIM',
     climbRatings: ['CLB', 'CLB-1', 'CLB-2'],
   }
   ```

   그리고 같은 파일의 `BOEING_VARIANTS` 배열에 추가합니다. `createAircraftRegistry()`(`packages/aircraft/src/registry.ts`)가 배열의 모든 항목을 자동 등록합니다.

3. **기종 전용 페이지(선택)** — `extraPages: (v) => [...]`로 추가 페이지를 붙일 수 있습니다. 페이지 작성법은 [ADDING_PAGE.md](ADDING_PAGE.md)를 참고하세요.

4. **i18n** — 새 `fidelityNotes` 키를 썼다면 `packages/i18n/src/locales/{ko,en}.json`의 `fidelity` 아래에 두 언어 모두 추가합니다.

5. **검증**

   ```bash
   pnpm typecheck && pnpm test && pnpm check:i18n
   ```

   `packages/aircraft/test`에 해당 기종으로 기본 시나리오(IDENT 표시, 경로 입력, EXEC/INSERT)를 확인하는 테스트를 추가하세요.

## 2. 새로운 FMS 계열 추가

1. `packages/aircraft/src/<family>/`에 어댑터 클래스를 만들고 `AbstractFmsAdapter`를 상속합니다. 구현해야 할 항목:

   | 멤버 | 역할 |
   | --- | --- |
   | `definition`, `performanceModel` | 기종 메타데이터와 성능 모델 |
   | `display` | 화면 행 수/열 수/색상 스타일 |
   | `messages` | 스크래치패드 메시지 카탈로그(`common/messages.ts` 참고) |
   | `defaultPageId`, `turnPointIdent` | 첫 페이지, 턴 포인트 식별자 |
   | `deleteToken`, `clearCreatesDeleteToken` | DELETE / CLR 동작 차이 |
   | `buildPages()` | 페이지 정의 목록 |
   | `getKeypad()` | 키패드 레이아웃(`common/keypad.ts`) |
   | `getCapabilities()` | 지원 기능 플래그(EXEC 키, 임시 비행계획 등) |
   | `pageForKey(key, state)` | 기능 키 → 페이지 ID |
   | `planEditPolicy(kind, state)` | 비행계획 수정이 즉시 반영(`DIRECT`)인지 MOD/TMPY(`MODIFY`)인지 |
   | `handleFunctionKey(...)` | EXEC, INSERT/ERASE, DIR 등 계열 고유 키 처리 |

2. `registry.ts`에서 `registry.register(definition, () => new MyAdapter(variant))`로 등록합니다.

3. 상태 변경은 항상 Immer draft 위에서만 하며, 입력 오류는 `entryError(...)`/`FmsEntryError`를 던져 스크래치패드 메시지로 표시합니다. 비결정적 값(시간, 무작위 ID)은 `HandlerContext.now`와 `nextId()`만 사용해야 리플레이가 정확히 재현됩니다.

## 체크리스트

- [ ] `id`는 고유하고 이후 변경하지 않음(저장된 세션·시나리오가 참조)
- [ ] 성능 모델 값의 출처와 근사 수준을 `fidelityNotes`로 고지
- [ ] ko/en i18n 키 추가, `pnpm check:i18n` 통과
- [ ] 어댑터 테스트 추가, `pnpm test` 통과
- [ ] Android 저장소에서 `npm run sync:shared` 후 `npm run typecheck`
