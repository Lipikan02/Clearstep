export function getVoiceIntent(utterance: string, confidence?: number) {
  if (confidence !== undefined && confidence > 0 && confidence < 0.5) return "unknown";
  const command = utterance.trim().toLowerCase().replace(/[.!?]+$/g, "").replace(/\s+/g, " ");
  if (/^(repeat( the)?( transaction)? details|read( the)?( transaction)? details( again)?|talk me through this)$/.test(command) ||
      /^(what am i (about to|going to) (send|do)|what am i sending|what does this transaction do|explain this transaction|tell me (about|what) (this transaction|i am signing))$/.test(command)) return "summary";
  if (/^(explain|show|read) (the )?(estimated )?(network )?fee( again)?$|^what is the (estimated )?(network )?fee$|^how much (is|will) (the )?(network )?fee( cost)?$|^how much are the (network )?fees$|^what will i pay (in )?(fees|gas)$|^why (is there|do i pay) (a )?(network )?fee$|^why is the (network )?fee (so )?(low|small|high|expensive|this (much|price|amount)|that (much|price|amount))$|^what does the (network )?fee pay for$|^where does the (network )?fee go$|^is the (network )?fee (a )?percentage of (the )?(amount|transfer)$/.test(command)) return "fee";
  if (/^(show( me)?|read|repeat) (the )?recipient( address)?( again)?$|^who am i sending (this|it) to$|^who is the recipient$|^what (is|are) the recipient address$|^what address am i sending to$|^where is (this|it) going$/.test(command)) return "recipient";
  if (/^(how (do|can) i connect( to)?( my)?( phantom)?( wallet)?|how to connect( to)?( my)?( phantom)?( wallet)?|connect( my)?( phantom)? wallet|connect(ing)? phantom|what happens (when|if) i connect( my)?( phantom)?( wallet)?|does connecting( my)?( phantom)?( wallet)? send (money|sol)|will connecting( my)?( phantom)?( wallet)? send (money|sol))$/.test(command)) return "connect";
  if (/^(where is|find|show( me)?|highlight|point to) (the )?continue( button)?$/.test(command)) return "continue";
  if (/^(where is|find|show( me)?|highlight|point to) (the )?cancel( button)?$/.test(command)) return "cancel";
  if (/^(stop|quiet|stop (the )?(audio|voice|speech|playback)|cancel (the )?(audio|voice|speech|playback))$/.test(command)) return "stop";
  return "unknown";
}
