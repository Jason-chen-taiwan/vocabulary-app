export interface PushSubscriptionData {
  endpoint: string
  p256dh: string
  auth: string
}

export interface DueUser {
  userId: string
  timezone: string
  subscriptions: PushSubscriptionData[]
}
