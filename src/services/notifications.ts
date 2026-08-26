import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export const MEDICATION_CATEGORY = 'medication-dose';
export const MEDICATION_CHANNEL = 'medication-reminders';

export type DoseNotificationAction = 'TAKEN' | 'SNOOZE' | 'SKIP';
export type MedicationReminderKind = 'primary' | 'followup' | 'snooze';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true
  })
});

export async function configureMedicationNotifications() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(MEDICATION_CHANNEL, {
      name: 'Medication reminders',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 150, 250]
    });
  }

  await Notifications.setNotificationCategoryAsync(MEDICATION_CATEGORY, [
    { identifier: 'TAKEN', buttonTitle: 'Taken' },
    { identifier: 'SNOOZE', buttonTitle: 'Snooze' },
    { identifier: 'SKIP', buttonTitle: 'Skip', options: { isDestructive: true } }
  ]);
}

export async function ensureMedicationNotificationPermission() {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

export async function scheduleDoseReminder(input: {
  doseId: string;
  title: string;
  body: string;
  dueAt: Date;
  reminderKind?: MedicationReminderKind;
}) {
  const reminderAt = input.dueAt.getTime();
  return Notifications.scheduleNotificationAsync({
    content: {
      title: input.title,
      body: input.body,
      categoryIdentifier: MEDICATION_CATEGORY,
      sound: 'default',
      data: {
        doseId: input.doseId,
        reminderAt,
        reminderKind: input.reminderKind ?? 'primary'
      }
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: input.dueAt,
      channelId: Platform.OS === 'android' ? MEDICATION_CHANNEL : undefined
    }
  });
}

export function getDoseNotificationAction(response: Notifications.NotificationResponse) {
  const doseId = response.notification.request.content.data?.doseId;
  const action = response.actionIdentifier;

  if (typeof doseId !== 'string') return null;
  if (action !== 'TAKEN' && action !== 'SNOOZE' && action !== 'SKIP') return null;

  return { doseId, action: action as DoseNotificationAction };
}
