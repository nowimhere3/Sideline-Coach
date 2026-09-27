import type { AiAlarmEvent } from './control-plane/alarm-engine';

export interface AlarmNotificationWindow {
  showInformationMessage(message: string): unknown;
  showWarningMessage(message: string): unknown;
}

/** Thin VS Code delivery adapter: rendering only; AlarmEngine owns every decision and message. */
export function deliverVsCodeAlarm(window: AlarmNotificationWindow, event: AiAlarmEvent): void {
  if (event.severity === 'info') window.showInformationMessage(event.message);
  else window.showWarningMessage(event.message);
}
