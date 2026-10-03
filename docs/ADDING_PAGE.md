# 새 FMC/MCDU 페이지 추가하기

페이지는 순수한 **`FmsPageDefinition`** 객체입니다(`packages/core/src/page/types.ts`). 렌더링은 상태를 읽기만 하고, 입력은 LSK/키 핸들러가 Immer draft를 수정합니다. Classic(CDU)과 Modern 뷰, 리플레이가 모두 같은 정의를 사용합니다.

```ts
export interface FmsPageDefinition {
  id: string
  title: string
  pageCount?: (state, ctx) => number          // NEXT/PREV PAGE 하위 페이지 수
  render(state, ctx): FmsPageContent          // 6행(label + data) 화면
  leftLskHandlers: Array<LskHandler | undefined>   // index 0 = 1L … 5 = 6L
  rightLskHandlers: Array<LskHandler | undefined>
  keyBindings?: KeyBinding[]                  // 페이지 전용 키 처리
  onOpen?: (draft, ctx) => void               // 페이지 진입 시 컨텍스트 초기화
}
```

## 예: Boeing "FUEL" 정보 페이지

```ts
import { displayedPerformance, entryError, opSetFuel, row, small, span } from '@aerofms/core'
import type { FmsPageDefinition } from '@aerofms/core'
import { boxes, fmtWeight } from '../../common/format'
import { goTo, separatorLabel } from '../helpers'

export function fuelPage(): FmsPageDefinition {
  return {
    id: 'FUEL',
    title: 'FUEL',
    render: (state) => {
      const perf = displayedPerformance(state)
      return {
        title: { center: [span('FUEL')] },
        rows: [
          row(
            { left: [small('PLAN FUEL')] },
            { left: [perf.fuelKg !== undefined ? span(fmtWeight(perf.fuelKg)) : span(boxes(4), 'amber')] },
            { L: { fieldId: 'fuel', explainKey: 'fuel' } },
          ),
          row({ left: [small('FUEL ON BOARD')] }, { left: [span(fmtWeight(state.simulation.fuelKg), 'green')] }),
          row(), row(), row(),
          row(separatorLabel(), { left: [span('<INDEX')] }),
        ],
      }
    },
    leftLskHandlers: [
      (draft, ctx) => {
        if (ctx.deleteMode) return entryError('INVALID_DELETE')
        opSetFuel(draft, ctx, ctx.scratchpad) // 범위를 벗어나면 FmsEntryError → INVALID ENTRY
      },
      undefined, undefined, undefined, undefined,
      goTo('INIT_REF_INDEX'),
    ],
    rightLskHandlers: [],
  }
}
```

### 규칙

- **렌더는 순수 함수**여야 합니다. 상태를 수정하거나 시계를 직접 읽지 말고 `state.simulation.simTimeMs` 등 상태 값을 사용합니다.
- **입력 처리는 공용 operation을 재사용**합니다. `packages/core/src/engine/operations.ts`의 `opSet*` 함수는 CDU 페이지와 Modern 뷰가 함께 쓰므로 두 화면의 동작이 항상 같습니다. 새 입력 종류라면 먼저 operation을 추가하세요.
- **입력 검증 실패**는 `entryError('INVALID_ENTRY')`를 반환하거나 `FmsEntryError`를 던집니다. 엔진이 기종별 스크래치패드 메시지로 바꿔 표시합니다.
- **스크래치패드**: 핸들러가 성공하면 입력이 소비됩니다. 페이지 이동 프롬프트는 `goTo(...)` 또는 `navigationHandler(...)`로 만들면 스크래치패드가 유지됩니다(`keepsScratchpad`).
- **비행계획 수정**은 `planForEdit(draft, kind, adapter.planEditPolicy(kind, state))`(`packages/core/src/execution/modification.ts`)로 편집 대상 계획을 얻어서 합니다. 그래야 Boeing MOD/EXEC, Airbus TMPY/INSERT 정책이 일관되게 적용됩니다.
- **Explain 모드**: 행의 `fields`에 `explainKey`를 지정하면 필드를 눌렀을 때 용어집이 열립니다. 키는 `packages/training/src/glossary.ts`의 `GLOSSARY`와 i18n `glossary.*`에 있어야 합니다(`pnpm check:i18n`이 검사).
- CDU 화면 문자열은 실제 FMS처럼 영문 대문자를 쓰고, 앱 UI 문자열(버튼·안내)은 반드시 i18n 키를 사용합니다.

## 등록

1. 어댑터의 `buildPages()`(Boeing: `packages/aircraft/src/boeing/adapter.ts`, Airbus: `airbus/adapter.ts`)에 페이지를 추가합니다. 특정 기종에만 필요하면 variant의 `extraPages`를 사용합니다.
2. 기능 키로 열려면 `pageForKey`에 매핑을 추가하고, 다른 페이지에서 이동하려면 `goTo('FUEL')` 핸들러를 LSK에 연결합니다.
3. 키패드에 새 키가 필요하면 `common/keypad.ts`의 레이아웃을 수정합니다(웹·Android 키패드가 같은 레이아웃을 사용).

## 테스트

`packages/aircraft/test/harness.ts`의 `Pilot`으로 실제 키 입력을 재생합니다.

```ts
import { Pilot } from './harness'

it('accepts plan fuel on the FUEL page', () => {
  const p = new Pilot('B737-800')
  p.dispatch({ type: 'OPEN_PAGE', pageId: 'FUEL' }) // 또는 기능 키/LSK로 이동
  p.enter('8.5', '1L')
  expect(p.state.performance.fuelKg).toBe(8500)
})
```

마지막으로 `pnpm verify`를 실행합니다.
