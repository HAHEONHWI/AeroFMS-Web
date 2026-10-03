import { Analytics } from '@aerofms/cloud'
import type { AnalyticsEvent, AnalyticsParams } from '@aerofms/cloud'
import { createWebAnalyticsSink } from '@/platform/firebase'

export const analytics = new Analytics([createWebAnalyticsSink()])

export function track(event: AnalyticsEvent, params?: AnalyticsParams): void {
  analytics.track(event, params)
}
