export type PlaybackState = "idle" | "loading" | "playing" | "paused" | "blocked" | "ended" | "error";
export type VoiceAlignment = {
  characters: string[];
  startTimesSeconds: number[];
  endTimesSeconds: number[];
};
export type VoiceClip = { blob: Blob; alignment: VoiceAlignment | null };

function alignedCharacterAt(alignment: VoiceAlignment, seconds: number) {
  const { startTimesSeconds, endTimesSeconds } = alignment;
  let low = 0;
  let high = startTimesSeconds.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (startTimesSeconds[middle] <= seconds) low = middle + 1;
    else high = middle;
  }
  const index = low - 1;
  return index >= 0 && seconds <= endTimesSeconds[index] ? index : null;
}

export function createVoicePlayback(
  setState: (state: PlaybackState) => void,
  createAudio: (blob: Blob) => { audio: HTMLAudioElement; release: () => void },
  setCaptionCharacter: (index: number | null) => void = () => {},
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
    setCaptionCharacter(null);
    if (!active) return;
    active.audio.onended = null;
    active.audio.onerror = null;
    active.audio.ontimeupdate = null;
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
    async start(load: (signal: AbortSignal) => Promise<Blob | VoiceClip>) {
      dispose();
      const id = generation;
      const controller = new AbortController();
      request = controller;
      setState("loading");
      try {
        const loaded = await load(controller.signal);
        if (id !== generation) return;
        request = undefined;
        const clip: VoiceClip = loaded instanceof Blob ? { blob: loaded, alignment: null } : loaded;
        active = createAudio(clip.blob);
        if (clip.alignment) {
          active.audio.ontimeupdate = () => {
            if (id !== generation) return;
            setCaptionCharacter(alignedCharacterAt(clip.alignment!, active!.audio.currentTime));
          };
        }
        active.audio.onended = () => {
          if (id !== generation) return;
          attempt++;
          setCaptionCharacter(null);
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
