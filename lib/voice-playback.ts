export type PlaybackState = "idle" | "loading" | "playing" | "paused" | "blocked" | "ended" | "error";

export function createVoicePlayback(
  setState: (state: PlaybackState) => void,
  createAudio: (blob: Blob) => { audio: HTMLAudioElement; release: () => void },
) {
  let generation = 0;
  let attempt = 0;
  let request: AbortController | undefined;
  let active: ReturnType<typeof createAudio> | undefined;

  function dispose() {
    generation++;
    attempt++;
    request?.abort();
    request = undefined;
    if (!active) return;
    active.audio.onended = null;
    active.audio.onerror = null;
    active.audio.pause();
    active.release();
    active = undefined;
  }

  async function resume() {
    if (!active) return;
    const { audio } = active;
    const playAttempt = ++attempt;
    try {
      await audio.play();
      if (playAttempt === attempt) setState("playing");
    } catch (error) {
      if (playAttempt !== attempt) return;
      if (error instanceof Error && error.name === "NotAllowedError") {
        setState("blocked");
      } else {
        dispose();
        setState("error");
      }
    }
  }

  return {
    dispose,
    stop() {
      dispose();
      setState("idle");
    },
    pause() {
      if (!active) return;
      attempt++;
      active.audio.pause();
      setState("paused");
    },
    resume,
    async start(load: (signal: AbortSignal) => Promise<Blob>) {
      dispose();
      const id = generation;
      const controller = new AbortController();
      request = controller;
      setState("loading");
      try {
        const blob = await load(controller.signal);
        if (id !== generation) return;
        request = undefined;
        active = createAudio(blob);
        active.audio.onended = () => {
          if (id !== generation) return;
          attempt++;
          setState("ended");
        };
        active.audio.onerror = () => {
          if (id !== generation) return;
          dispose();
          setState("error");
        };
        await resume();
      } catch {
        if (id !== generation) return;
        dispose();
        setState("error");
      }
    },
    async replay() {
      if (!active) return;
      active.audio.currentTime = 0;
      await resume();
    },
  };
}
