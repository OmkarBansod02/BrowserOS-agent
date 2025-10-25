import { create } from 'zustand'
import { OnboardingStorage } from '@/constants/storage'
import { config } from '@/config'

const TOTAL_STEPS = 9  // Welcome, Step 1, Step 2, Step 3, Video, Completion, Split-View, Agent Mode, Teach Mode, Quick Search

interface OnboardingState {
  currentStep: number  // 0 = welcome, 1-3 = steps, 4 = video, 5 = completion, 6-9 = features
  videoSkipped: boolean
  completedSteps: Set<number>
  isInitialized: boolean  // Whether state has been loaded from storage

  // Navigation methods
  nextStep: () => void
  previousStep: () => void
  goToStep: (step: number) => void
  skipVideo: () => void
  skipFeatures: () => void
  completeOnboarding: () => Promise<void>

  // Initialization
  initialize: () => Promise<void>

  // State checks
  canGoNext: () => boolean
  canGoPrevious: () => boolean
  isComplete: () => boolean
}

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
  currentStep: 0,
  videoSkipped: false,
  completedSteps: new Set<number>(),
  isInitialized: false,

  /**
   * Initialize store by checking storage for completion state
   * Should be called when onboarding UI mounts
   */
  initialize: async () => {
    try {
      const state = await OnboardingStorage.getCompletionState()

      if (state.hasCompletedOnboarding) {
        // User has completed onboarding - mark all steps as done
        const allSteps = new Set<number>()
        for (let i = 0; i <= TOTAL_STEPS; i++) {
          allSteps.add(i)
        }

        set({
          currentStep: TOTAL_STEPS,
          completedSteps: allSteps,
          isInitialized: true
        })

        console.log('[OnboardingStore] Initialized - already completed', {
          version: state.onboardingVersion,
          lastSeen: state.onboardingLastSeen
        })
      } else {
        // Fresh start - begin at step 0
        set({ isInitialized: true })

        console.log('[OnboardingStore] Initialized - starting fresh')
      }
    } catch (error) {
      console.error('[OnboardingStore] Initialization error:', error)

      // Set initialized anyway to not block UI
      set({ isInitialized: true })
    }
  },

  nextStep: () => {
    const { currentStep, completedSteps } = get()
    if (currentStep < TOTAL_STEPS) {
      const newCompletedSteps = new Set(completedSteps)
      newCompletedSteps.add(currentStep)
      set({
        currentStep: currentStep + 1,
        completedSteps: newCompletedSteps
      })
    }
  },

  previousStep: () => {
    const { currentStep } = get()
    if (currentStep > 0) {
      set({ currentStep: currentStep - 1 })
    }
  },

  goToStep: (step: number) => {
    if (step >= 0 && step <= TOTAL_STEPS) {
      set({ currentStep: step })
    }
  },

  skipVideo: () => {
    set({ videoSkipped: true })
    get().nextStep()
  },

  skipFeatures: () => {
    // Skip from completion screen to the end and complete onboarding
    get().completeOnboarding()
  },

  completeOnboarding: async () => {
    try {
      // Mark onboarding as completed in chrome storage with version tracking
      const success = await OnboardingStorage.markCompleted(config.VERSION)

      if (success) {
        console.log('[OnboardingStore] Onboarding completed successfully', {
          version: config.VERSION,
          timestamp: Date.now()
        })
      } else {
        console.warn('[OnboardingStore] Failed to persist completion state')
      }

      // Mark all steps as completed in local state
      const allSteps = new Set<number>()
      for (let i = 0; i <= TOTAL_STEPS; i++) {
        allSteps.add(i)
      }
      set({
        completedSteps: allSteps,
        currentStep: TOTAL_STEPS
      })
    } catch (error) {
      console.error('[OnboardingStore] Error completing onboarding:', error)

      // Still update local state even if storage fails
      // This ensures UX isn't disrupted by storage errors
      const allSteps = new Set<number>()
      for (let i = 0; i <= TOTAL_STEPS; i++) {
        allSteps.add(i)
      }
      set({
        completedSteps: allSteps,
        currentStep: TOTAL_STEPS
      })
    }
  },

  canGoNext: () => {
    const { currentStep } = get()
    return currentStep < TOTAL_STEPS
  },

  canGoPrevious: () => {
    const { currentStep } = get()
    return currentStep > 0
  },

  isComplete: () => {
    const { currentStep } = get()
    return currentStep === TOTAL_STEPS
  }
}))
