// * Plays the "new paid order" beep. Uses the Web Audio API to synthesise three
// * short beeps — no asset file needed and works offline. Respects the user's
// * mute toggle and volume from the uiSound store.
import { useUiSoundStore } from '~/stores/uiSound'

let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    // * Creation deferred until first gesture (autoplay policy).
    const W = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }
    const Ctor = W.AudioContext ?? W.webkitAudioContext
    if (!Ctor) return null
    ctx = new Ctor()
  }
  return ctx
}

export function useOrderSound() {
  const sound = useUiSoundStore()

  function play() {
    if (!sound.enabled) return
    const audio = getCtx()
    if (!audio) return
    if (audio.state === 'suspended') {
      // * Will resume silently on next user gesture; ignore.
      audio.resume().catch(() => {})
    }

    const now = audio.currentTime
    // * Three quick beeps, each 90ms, 80ms gap.
    for (let i = 0; i < 3; i++) {
      const start = now + i * 0.17
      const osc = audio.createOscillator()
      const gain = audio.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(880, start)           // * A5
      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(sound.volume * 0.7, start + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.09)
      osc.connect(gain).connect(audio.destination)
      osc.start(start)
      osc.stop(start + 0.1)
    }
  }

  return { play }
}
