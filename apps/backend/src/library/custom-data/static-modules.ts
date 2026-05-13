import type { CustomModule } from '@machine-gun/common';

export const STATIC_CUSTOM_MODULES: CustomModule[] = [
  {
    id: 'module-status-codes',
    source: 'static',
    name: 'statusCodes',
    values: ['200', '201', '400', '401', '403', '404', '422', '500', '502', '503'],
  },
  {
    id: 'module-environments',
    source: 'static',
    name: 'environments',
    values: ['production', 'staging', 'development', 'qa', 'sandbox'],
  },
  {
    id: 'module-event-types',
    source: 'static',
    name: 'eventTypes',
    values: [
      'user.created',
      'user.updated',
      'user.deleted',
      'order.placed',
      'order.shipped',
      'order.cancelled',
      'payment.success',
      'payment.failed',
    ],
  },
  {
    id: 'module-regions',
    source: 'static',
    name: 'regions',
    values: [
      'eu-west-1',
      'eu-west-2',
      'us-east-1',
      'us-west-2',
      'ap-southeast-1',
      'ap-northeast-1',
    ],
  },
  {
    id: 'module-currencies',
    source: 'static',
    name: 'currencies',
    values: ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY'],
  },
  {
    id: 'module-payment-methods',
    source: 'static',
    name: 'paymentMethods',
    values: [
      'credit_card',
      'debit_card',
      'paypal',
      'bank_transfer',
      'crypto',
      'apple_pay',
      'google_pay',
    ],
  },
  {
    id: 'module-log-levels',
    source: 'static',
    name: 'logLevels',
    values: ['debug', 'info', 'warn', 'error', 'fatal'],
  },
  {
    id: 'module-device-types',
    source: 'static',
    name: 'deviceTypes',
    values: ['mobile', 'tablet', 'desktop', 'smart_tv', 'wearable', 'iot_device'],
  },
];
