import { SimulationFlow } from '@machine-gun/common';

/**
 * WelcomeFlow
 *
 * This is the primary onboarding flow for the Machine Gun platform.
 * It demonstrates a classic event-driven architecture:
 * 1. User Creation: A high-frequency source generating user profiles.
 * 2. Security Audit: A downstream processor that receives userId from the creator
 *    and appends a high-precision security timestamp.
 *
 * Features Demonstrated:
 * - Cross-Node Binding: The audit node waits for user creation and binds to its 'id'.
 * - MathJS Expressions: Using `now()` and `timestamp()` for data enrichment.
 * - Dynamic Delay: Using `round(random())` to simulate variable network latency.
 * - Conditional Logic: Demonstrating how to filter events between nodes.
 */
export const WelcomeFlow: SimulationFlow = {
  id: 'system-welcome-security',
  name: 'System: Account Security Flow',
  nodes: [
    {
      id: 'node-user-creation',
      schemaId: 'user-creation',
      position: { x: 100, y: 250 },
      settings: {
        frequency: 2,
        count: 50,
      },
    },
    {
      id: 'node-user-security-audit',
      schemaId: 'user-security-audit',
      position: { x: 500, y: 250 },
      settings: {
        frequency: 1,
        count: 50,
        /**
         * Filter Logic:
         * Only process audit events for users that are marked as 'active'.
         * This demonstrates conditional logic evaluated in the flow engine.
         */
        filter: 'parent.isActive == true',
        bindings: {
          userId: 'node-user-creation.id',
        },
        expressions: {
          /**
           * Demonstrates using the latest mathjs helpers to generate
           * a high-precision ISO timestamp at the exact moment of processing.
           */
          timestamp: 'timestamp(now())',
        },
      },
    },
  ],
  edges: [
    {
      id: 'edge-user-to-audit',
      source: 'node-user-creation',
      target: 'node-user-security-audit',
      condition: 'wait',
      delayMs: 1000,
      /**
       * Dynamic Latency:
       * Simulates a variable network/processing delay between 500ms and 2500ms.
       * Uses the mathjs `round` and `random` functions.
       */
      delayExpression: 'round(random(500, 2500))',
    },
  ],
};
