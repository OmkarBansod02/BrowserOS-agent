import { z } from 'zod'

/**
 * Storage Keys
 * Centralized constants for chrome.storage keys to prevent inconsistencies
 */
export const STORAGE_KEYS = {
  // Onboarding
  ONBOARDING_COMPLETED: 'hasCompletedOnboarding',  // Boolean flag for onboarding completion
  ONBOARDING_VERSION: 'onboardingVersion',  // Version when onboarding was completed
  ONBOARDING_LAST_SEEN: 'onboardingLastSeen',  // Last time onboarding was shown

  // Version tracking
  LAST_SEEN_VERSION: 'lastSeenVersion',  // Last version user saw

  // Settings (for reference - these may exist elsewhere)
  LLM_PROVIDERS: 'llmProviders',  // LLM provider configurations
  USER_PREFERENCES: 'userPreferences'  // User preferences
} as const

export type StorageKey = typeof STORAGE_KEYS[keyof typeof STORAGE_KEYS]

/**
 * Onboarding state schema for storage
 */
export const OnboardingStateSchema = z.object({
  hasCompletedOnboarding: z.boolean(),  // Whether user completed onboarding
  onboardingVersion: z.string().optional(),  // Version when completed
  onboardingLastSeen: z.number().optional()  // Timestamp when last shown
})

export type OnboardingState = z.infer<typeof OnboardingStateSchema>

/**
 * Storage utility for onboarding state
 */
export class OnboardingStorage {
  /**
   * Get onboarding completion state
   */
  static async getCompletionState(): Promise<OnboardingState> {
    try {
      const result = await chrome.storage.local.get([
        STORAGE_KEYS.ONBOARDING_COMPLETED,
        STORAGE_KEYS.ONBOARDING_VERSION,
        STORAGE_KEYS.ONBOARDING_LAST_SEEN
      ])

      return {
        hasCompletedOnboarding: result[STORAGE_KEYS.ONBOARDING_COMPLETED] ?? false,
        onboardingVersion: result[STORAGE_KEYS.ONBOARDING_VERSION],
        onboardingLastSeen: result[STORAGE_KEYS.ONBOARDING_LAST_SEEN]
      }
    } catch (error) {
      console.error('[OnboardingStorage] Failed to get completion state:', error)
      // Return safe default on error
      return {
        hasCompletedOnboarding: false
      }
    }
  }

  /**
   * Mark onboarding as completed
   */
  static async markCompleted(version: string): Promise<boolean> {
    try {
      await chrome.storage.local.set({
        [STORAGE_KEYS.ONBOARDING_COMPLETED]: true,
        [STORAGE_KEYS.ONBOARDING_VERSION]: version,
        [STORAGE_KEYS.ONBOARDING_LAST_SEEN]: Date.now()
      })
      return true
    } catch (error) {
      console.error('[OnboardingStorage] Failed to mark completed:', error)
      return false
    }
  }

  /**
   * Update last seen timestamp
   */
  static async updateLastSeen(): Promise<void> {
    try {
      await chrome.storage.local.set({
        [STORAGE_KEYS.ONBOARDING_LAST_SEEN]: Date.now()
      })
    } catch (error) {
      console.error('[OnboardingStorage] Failed to update last seen:', error)
    }
  }

  /**
   * Check if user has completed onboarding
   */
  static async hasCompleted(): Promise<boolean> {
    const state = await this.getCompletionState()
    return state.hasCompletedOnboarding
  }

  /**
   * Reset onboarding state (for testing/debugging)
   */
  static async reset(): Promise<void> {
    try {
      await chrome.storage.local.remove([
        STORAGE_KEYS.ONBOARDING_COMPLETED,
        STORAGE_KEYS.ONBOARDING_VERSION,
        STORAGE_KEYS.ONBOARDING_LAST_SEEN
      ])
      console.log('[OnboardingStorage] Reset completed')
    } catch (error) {
      console.error('[OnboardingStorage] Failed to reset:', error)
    }
  }
}
