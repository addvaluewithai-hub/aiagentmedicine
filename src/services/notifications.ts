import * as Notifications from 'expo-notifications';

export const MEDICATION_CATEGORY = 'medication-dose';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true
  })
});

export async function configureMedicationNotificationCategory() {
  await Notifications.setNotificationCategoryAsync(MEDICATION_CATEGORY, [
    { identifier: 'TAKEN', buttonTitle: 'Taken' },
    { identifier: 'SNOOZE', buttonTitle: 'Snooze' },
    { identifier: 'SKIP', buttonTitle: 'Skip', options: { isDestructive: true } }
  ]);
}

export async function scheduleDoseReminder(input: {
  doseId: string;
  title: string;
  body: string;
  dueAt: Date;
}) {
  return Notifications.scheduleNotificationAsync({
    content: {
      title: input.title,
      body: input.body,
      categoryIdentifier: MEDICATION_CATEGORY,
      data: { doseId: input.doseId }
    },
    trigger: input.dueAt
  });
}
