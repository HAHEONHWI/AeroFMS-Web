/**
 * Canonical FMS message codes. Each aircraft adapter supplies its own text catalog
 * (e.g. Boeing "INVALID ENTRY" vs Airbus "FORMAT ERROR").
 */
export type MessageCode =
  | 'INVALID_ENTRY'
  | 'FORMAT_ERROR'
  | 'ENTRY_OUT_OF_RANGE'
  | 'NOT_IN_DATABASE'
  | 'INVALID_DELETE'
  | 'NOT_ALLOWED'
  | 'ROUTE_DISCONTINUITY'
  | 'VERIFY_POSITION'
  | 'UNABLE_CRZ_ALT'
  | 'CHECK_ALT_TGT'
  | 'EXECUTE'
  | 'MOD_PENDING'
  | 'ROUTE_FULL'
  | 'NO_ACTIVE_ROUTE'
  | 'RUNWAY_NOT_FOUND'
  | 'SELECT_DESIRED_WPT'
  | 'ENTER_IRS_POSITION'
  | 'PERF_DATA_INCOMPLETE'
  | 'TAKEOFF_SPEEDS_DELETED'
  | 'DRAG_REQUIRED'
  | 'DES_PATH_UNACHIEVABLE'
  | 'END_OF_ROUTE'
  | 'CHECK_FUEL'
  | 'INSUFFICIENT_FUEL'
  | 'TEMPORARY_PENDING'
  | 'NOT_ON_ROUTE'
  | 'AIRWAY_NOT_CONNECTED'
  | 'ARR_DEP_FIRST'
  | 'CHECK_TAKEOFF_DATA'

export type MessageCatalog = Record<MessageCode, string>

/** Messages displayed in the scratchpad as entry errors (cleared with CLR, restore entry). */
export const ENTRY_ERROR_CODES: ReadonlySet<MessageCode> = new Set<MessageCode>([
  'INVALID_ENTRY',
  'FORMAT_ERROR',
  'ENTRY_OUT_OF_RANGE',
  'NOT_IN_DATABASE',
  'INVALID_DELETE',
  'NOT_ALLOWED',
  'ROUTE_FULL',
  'NO_ACTIVE_ROUTE',
  'RUNWAY_NOT_FOUND',
  'NOT_ON_ROUTE',
  'AIRWAY_NOT_CONNECTED',
  'ARR_DEP_FIRST',
  'TEMPORARY_PENDING',
  'MOD_PENDING',
])

/** Error thrown by page handlers / commands to reject an entry. The engine turns it into a scratchpad message. */
export class FmsEntryError extends Error {
  constructor(
    readonly code: MessageCode,
    readonly detail?: string,
  ) {
    super(code)
    this.name = 'FmsEntryError'
  }
}

export const entryError = (code: MessageCode = 'INVALID_ENTRY', detail?: string): never => {
  throw new FmsEntryError(code, detail)
}
