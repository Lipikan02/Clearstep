export function getVoiceIntent(utterance: string, confidence?: number) {
  if (confidence !== undefined && confidence > 0 && confidence < 0.5) return "unknown";
  const command = utterance.trim().toLowerCase().replace(/[.!?]+$/g, "").replace(/\s+/g, " ");
  if (/^(repeat( the)?( transaction)? details|read( the)?( transaction)? details( again)?|talk me through this)$/.test(command)) return "summary";
  if (/^(explain|show|read) (the )?(estimated )?(network )?fee( again)?$|^what is the (estimated )?(network )?fee$/.test(command)) return "fee";
  if (/^(show( me)?|read|repeat) (the )?recipient( address)?( again)?$/.test(command)) return "recipient";
  if (/^(where is|find|show( me)?|highlight|point to) (the )?continue( button)?$/.test(command)) return "continue";
  if (/^(where is|find|show( me)?|highlight|point to) (the )?cancel( button)?$/.test(command)) return "cancel";
  if (/^(stop|quiet|stop (the )?(audio|voice|speech|playback)|cancel (the )?(audio|voice|speech|playback))$/.test(command)) return "stop";
  return "unknown";
}
